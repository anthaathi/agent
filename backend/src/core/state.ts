import type { PiProcess, WebSocketConnection } from '../managers/types.js';
import type { Project, Session } from './types.js';

class State {
  private projects = new Map<string, Project>();
  private sessions = new Map<string, Session>(); // Keyed by sessionPath (encoded)
  private processes = new Map<string, PiProcess>(); // Keyed by sessionPath
  private connections = new Map<string, Set<WebSocketConnection>>(); // Keyed by sessionPath
  private executingSessions = new Set<string>(); // Track which sessions are currently executing (by sessionPath)

  // Projects
  getProject(id: string): Project | undefined {
    return this.projects.get(id);
  }

  getAllProjects(): Project[] {
    return Array.from(this.projects.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  setProject(project: Project): void {
    this.projects.set(project.id, project);
  }

  deleteProject(id: string): boolean {
    return this.projects.delete(id);
  }

  // Sessions - keyed by sessionPath
  getSession(sessionPath: string): Session | undefined {
    return this.sessions.get(sessionPath);
  }

  getSessionsByProject(projectId: string): Session[] {
    return Array.from(this.sessions.values())
      .filter(s => s.projectId === projectId)
      .sort((a, b) => b.lastActivity - a.lastActivity);
  }

  setSession(session: Session): void {
    this.sessions.set(session.sessionPath, session);
  }

  deleteSession(sessionPath: string): boolean {
    return this.sessions.delete(sessionPath);
  }

  // Processes - keyed by sessionPath
  getProcess(sessionPath: string): PiProcess | undefined {
    return this.processes.get(sessionPath);
  }

  setProcess(sessionPath: string, process: PiProcess): void {
    this.processes.set(sessionPath, process);
  }

  deleteProcess(sessionPath: string): boolean {
    return this.processes.delete(sessionPath);
  }

  // WebSocket Connections - Multi-window support, keyed by sessionPath
  getConnections(sessionPath: string): Set<WebSocketConnection> {
    return this.connections.get(sessionPath) ?? new Set();
  }

  addConnection(sessionPath: string, connection: WebSocketConnection): void {
    if (!this.connections.has(sessionPath)) {
      this.connections.set(sessionPath, new Set());
    }
    this.connections.get(sessionPath)!.add(connection);
  }

  removeConnection(sessionPath: string, connection: WebSocketConnection): boolean {
    const connections = this.connections.get(sessionPath);
    if (!connections) return false;
    
    const result = connections.delete(connection);
    if (connections.size === 0) {
      this.connections.delete(sessionPath);
    }
    return result;
  }

  getAllConnections(): Map<string, Set<WebSocketConnection>> {
    return this.connections;
  }

  // Execution lock for first-come-first-serve, keyed by sessionPath
  isExecuting(sessionPath: string): boolean {
    return this.executingSessions.has(sessionPath);
  }

  acquireExecutionLock(sessionPath: string): boolean {
    if (this.executingSessions.has(sessionPath)) {
      return false;
    }
    this.executingSessions.add(sessionPath);
    return true;
  }

  releaseExecutionLock(sessionPath: string): boolean {
    return this.executingSessions.delete(sessionPath);
  }

  // Cleanup all state for a session
  cleanupSession(sessionPath: string): void {
    this.sessions.delete(sessionPath);
    this.processes.delete(sessionPath);
    this.connections.delete(sessionPath);
    this.executingSessions.delete(sessionPath);
  }
}

export const state = new State();
