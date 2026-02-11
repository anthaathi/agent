import { createHash } from 'node:crypto';
import { state } from '../core/state.js';
import type { Project, Session } from '../core/types.js';
import { SessionManager } from './SessionManager.js';
import { PiSessionScanner } from '../services/PiSessionScanner.js';
import { logger } from '../utils/logger.js';

export class ProjectManager {
  private static instance: ProjectManager;
  private sessionManager: SessionManager;
  private piScanner: PiSessionScanner;
  private initialized = false;
  private scannedProjects: Map<string, import('../services/PiSessionScanner.js').PiProject> = new Map();

  private constructor() {
    this.sessionManager = SessionManager.getInstance();
    this.piScanner = PiSessionScanner.getInstance();
  }

  static getInstance(): ProjectManager {
    if (!ProjectManager.instance) {
      ProjectManager.instance = new ProjectManager();
    }
    return ProjectManager.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Scan existing pi sessions but only create projects (not sessions yet)
      const piProjects = await this.piScanner.scanSessions();
      
      for (const piProject of piProjects) {
        this.scannedProjects.set(piProject.path, piProject);
        
        let project = this.findProjectByPath(piProject.path);
        if (!project) {
          project = this.createProject(piProject.name, piProject.path);
        }

        if (piProject.sessions.length > 0) {
          const latestActivity = Math.max(...piProject.sessions.map(s => s.lastActivity));
          project.updatedAt = latestActivity;
          state.setProject(project);
        }
      }

      this.initialized = true;
      logger.info(`Initialized ${piProjects.length} projects from pi sessions`);
    } catch (err) {
      logger.error('Failed to initialize projects from pi sessions', { error: (err as Error).message });
    }
  }

  async loadProjectSessions(projectId: string): Promise<Session[]> {
    const project = state.getProject(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    // Check if already loaded
    const existingSessions = state.getSessionsByProject(projectId);
    if (existingSessions.length > 0) {
      return existingSessions;
    }

    // Load from scanned data
    const piProject = this.scannedProjects.get(project.path);
    if (!piProject) {
      return [];
    }

    const sessions: Session[] = [];
    for (const piSession of piProject.sessions) {
      const sessionPath = piSession.relativePath;
      const session: Session = {
        sessionPath,
        projectId: project.id,
        name: piSession.firstMessage || `Session ${new Date(piSession.createdAt).toLocaleString()}`,
        status: 'idle',
        createdAt: piSession.createdAt,
        lastActivity: piSession.lastActivity,
      };
      state.setSession(session);
      sessions.push(session);
    }

    return sessions;
  }

  async loadProjectSessionsPaginated(
    projectId: string,
    limit: number,
    offset: number
  ): Promise<{ sessions: Session[]; total: number; hasMore: boolean }> {
    const project = state.getProject(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    // Get sessions already in state (includes newly created ones)
    const stateSessions = state.getSessionsByProject(projectId);
    const stateSessionPaths = new Set(stateSessions.map(s => s.sessionPath));

    // Load from scanned data
    const piProject = this.scannedProjects.get(project.path);
    
    // Build list of all sessions (state sessions + scanned sessions not in state)
    const allSessions: Session[] = [...stateSessions];
    
    if (piProject) {
      for (const piSession of piProject.sessions) {
        const sessionPath = piSession.relativePath;
        if (!stateSessionPaths.has(sessionPath)) {
          const session: Session = {
            sessionPath,
            projectId: project.id,
            name: piSession.firstMessage || `Session ${new Date(piSession.createdAt).toLocaleString()}`,
            status: 'idle',
            createdAt: piSession.createdAt,
            lastActivity: piSession.lastActivity,
          };
          state.setSession(session);
          allSessions.push(session);
        }
      }
    }

    // Sort by lastActivity descending (newest first)
    allSessions.sort((a, b) => b.lastActivity - a.lastActivity);

    const total = allSessions.length;
    const paginatedSessions = allSessions.slice(offset, offset + limit);

    return {
      sessions: paginatedSessions,
      total,
      hasMore: offset + limit < total,
    };
  }

  private findProjectByPath(path: string): Project | undefined {
    return state.getAllProjects().find(p => p.path === path);
  }

  private getProjectId(path: string): string {
    return createHash('sha1').update(path).digest('hex').slice(0, 16);
  }

  createProject(name: string, path: string): Project {
    const existing = this.findProjectByPath(path);
    if (existing) {
      return existing;
    }

    const project: Project = {
      id: this.getProjectId(path),
      name,
      path,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    state.setProject(project);
    logger.info(`Created project ${project.id}`, { name, path });
    return project;
  }

  getProject(id: string): Project | undefined {
    return state.getProject(id);
  }

  getAllProjects(): Project[] {
    return state.getAllProjects();
  }

  updateProject(id: string, updates: Partial<Pick<Project, 'name' | 'path'>>): Project {
    const project = state.getProject(id);
    if (!project) {
      throw new Error(`Project ${id} not found`);
    }

    Object.assign(project, updates, { updatedAt: Date.now() });
    state.setProject(project);
    return project;
  }

  async deleteProject(id: string): Promise<void> {
    const project = state.getProject(id);
    if (!project) {
      throw new Error(`Project ${id} not found`);
    }

    // Delete all sessions in this project
    const sessions = state.getSessionsByProject(id);
    for (const session of sessions) {
      await this.sessionManager.deleteSession(session.sessionPath);
    }

    state.deleteProject(id);
    logger.info(`Deleted project ${id}`);
  }

  getProjectSessions(projectId: string): Session[] {
    return state.getSessionsByProject(projectId);
  }
}
