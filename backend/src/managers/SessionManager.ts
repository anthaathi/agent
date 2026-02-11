import { mkdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { homedir } from 'node:os';
import { state } from '../core/state.js';
import type { Session, PiCommand } from '../core/types.js';
import { ProcessManager } from './ProcessManager.js';
import { logger } from '../utils/logger.js';
import { encodePathForDirectory, resolveSessionPath, decodeSessionPath } from '../utils/path-encode.js';

// Use pi's default session directory
const PI_AGENT_DIR = join(homedir(), '.pi', 'agent');
const SESSION_DIR = process.env.PI_SESSION_DIR || join(PI_AGENT_DIR, 'sessions');

// Convert absolute path to relative session path
function toRelativeSessionPath(absolutePath: string): string {
  return relative(SESSION_DIR, absolutePath);
}

export class SessionManager {
  private static instance: SessionManager;
  private processManager: ProcessManager;

  private constructor() {
    this.processManager = ProcessManager.getInstance();
  }

  static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  async createSession(projectId: string, name?: string, cwd?: string): Promise<Session> {
    const project = state.getProject(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const projectPath = cwd || project.path;
    
    // Use pi-style encoding: --home-user-project--
    const encodedDirName = encodePathForDirectory(projectPath);
    const sessionDir = join(SESSION_DIR, encodedDirName);
    
    await mkdir(sessionDir, { recursive: true });

    // Temporary session path - will be replaced with actual after spawn
    const tempSessionPath = `${encodedDirName}/temp-${Date.now()}`;

    const session: Session = {
      sessionPath: tempSessionPath,
      projectId,
      name: name || `Session ${Date.now()}`,
      status: 'idle',
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };

    state.setSession(session);

    try {
      const piProcess = await this.processManager.spawnProcess({
        sessionPath: tempSessionPath,
        projectPath,
        sessionDir,
      });

      // Update session with actual file path from pi session (as relative path)
      const actualFilePath = piProcess.session.sessionFile;
      if (actualFilePath) {
        const actualSessionPath = toRelativeSessionPath(actualFilePath);
        const updatedSession: Session = {
          ...session,
          sessionPath: actualSessionPath,
        };
        // Remove old entry and add with correct key
        state.deleteSession(tempSessionPath);
        state.setSession(updatedSession);
        return updatedSession;
      }
    } catch (err) {
      state.deleteSession(tempSessionPath);
      throw new Error(`Failed to create pi session: ${(err as Error).message}`);
    }

    logger.info(`Created session ${session.sessionPath} for project ${projectId}`);
    return session;
  }

  getSession(sessionPath: string): Session | undefined {
    return state.getSession(sessionPath);
  }

  getSessionsByProject(projectId: string): Session[] {
    return state.getSessionsByProject(projectId);
  }

  async deleteSession(sessionPath: string): Promise<void> {
    const session = state.getSession(sessionPath);
    if (!session) {
      throw new Error(`Session ${decodeSessionPath(sessionPath)} not found`);
    }

    await this.processManager.killProcess(sessionPath);

    const connections = state.getConnections(sessionPath);
    for (const connection of connections) {
      connection.socket.close();
    }

    state.cleanupSession(sessionPath);

    logger.info(`Deleted session ${decodeSessionPath(sessionPath)}`);
  }

  updateSessionActivity(sessionPath: string): void {
    const session = state.getSession(sessionPath);
    if (session) {
      const now = Date.now();
      session.lastActivity = now;
      state.setSession(session);
      
      // Also update the project's updatedAt to keep it at top
      const project = state.getProject(session.projectId);
      if (project) {
        project.updatedAt = now;
        state.setProject(project);
      }
    }
  }

  async sendCommand(sessionPath: string, command: PiCommand): Promise<boolean> {
    const piProcess = state.getProcess(sessionPath);
    if (!piProcess) {
      return false;
    }

    this.updateSessionActivity(sessionPath);
    return this.processManager.sendCommand(piProcess, command);
  }

  handleExtensionUIResponse(
    sessionPath: string,
    response: { id: string; value?: string; confirmed?: boolean; cancelled?: boolean }
  ): void {
    this.processManager.handleExtensionUIResponse(sessionPath, response);
  }

  async getSessionState(sessionPath: string): Promise<unknown> {
    const piProcess = state.getProcess(sessionPath);
    if (!piProcess) {
      throw new Error('Session not found');
    }

    const { session } = piProcess;
    return {
      messages: session.messages,
      model: session.model,
      thinkingLevel: session.thinkingLevel,
      isStreaming: session.isStreaming,
      sessionId: session.sessionId,
      sessionFile: session.sessionFile,
    };
  }

  getSessionMessages(sessionPath: string): unknown[] {
    const piProcess = state.getProcess(sessionPath);
    if (!piProcess) {
      logger.warn(`No process found for session ${decodeSessionPath(sessionPath)}`);
      return [];
    }

    const messages = piProcess.session.messages;
    logger.info(`Getting messages for session ${decodeSessionPath(sessionPath)}`, { 
      messageCount: messages.length,
      roles: messages.map(m => m.role),
    });

    return messages
      .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
      .map((msg, index) => {
        let content: unknown;
        if ('content' in msg) {
          content = msg.content;
        }

        return {
          type: 'message',
          id: `msg-${index}`,
          parentId: index > 0 ? `msg-${index - 1}` : null,
          timestamp: 'timestamp' in msg ? new Date(msg.timestamp).toISOString() : new Date().toISOString(),
          message: {
            role: msg.role,
            content,
          },
        };
      });
  }

  async getSessionMessagesFromFile(sessionPath: string): Promise<unknown[]> {
    const absolutePath = resolveSessionPath(sessionPath);
    
    try {
      const content = await readFile(absolutePath, 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      
      const messages: unknown[] = [];
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.type === 'message' && entry.message) {
            messages.push(entry);
          }
        } catch {
          // Skip malformed lines
        }
      }
      
      logger.info(`Loaded ${messages.length} messages from file for session ${sessionPath}`);
      return messages;
    } catch (err) {
      logger.warn(`Failed to read session file for ${sessionPath}`, { error: (err as Error).message });
      // Fall back to in-memory messages
      return this.getSessionMessages(sessionPath);
    }
  }
}
