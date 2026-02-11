import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
import { WebSocketService } from '../services/WebSocketService.js';
import { SessionManager } from '../managers/SessionManager.js';
import { ProjectManager } from '../managers/ProjectManager.js';
import { state } from '../core/state.js';
import { logger } from '../utils/logger.js';

interface WebSocketParams {
  '*': string; // Wildcard captures the full path including slashes
}

/**
 * Try to find a session by relative path
 * Sessions are now stored with simple relative paths like:
 * "--home-omkar-Apps-xhisper--/2026-01-28T05-24-53-939Z_xxx.jsonl"
 */
async function findSession(
  relativePath: string,
  sessionManager: SessionManager,
  projectManager: ProjectManager
): Promise<{ sessionPath: string; session: ReturnType<SessionManager['getSession']> } | null> {
  // Try direct lookup first (most common case)
  const session = state.getSession(relativePath);
  if (session) {
    return { sessionPath: relativePath, session };
  }

  // Look through all sessions to find one with matching path
  const allProjects = state.getAllProjects();
  for (const project of allProjects) {
    const sessions = state.getSessionsByProject(project.id);
    for (const s of sessions) {
      if (s.sessionPath === relativePath) {
        return { sessionPath: s.sessionPath, session: s };
      }
    }
  }

  // Try to load from scanned sessions
  logger.info(`Session ${relativePath} not in state, attempting to load from scanned data`);

  const projects = state.getAllProjects();
  for (const project of projects) {
    try {
      await projectManager.loadProjectSessions(project.id);
      const sessions = state.getSessionsByProject(project.id);
      for (const s of sessions) {
        if (s.sessionPath === relativePath) {
          logger.info(`Found session in project ${project.id}`);
          return { sessionPath: s.sessionPath, session: s };
        }
      }
    } catch (err) {
      // Continue searching
    }
  }

  return null;
}

export async function websocketRoutes(fastify: FastifyInstance): Promise<void> {
  const webSocketService = WebSocketService.getInstance();
  const sessionManager = SessionManager.getInstance();
  const projectManager = ProjectManager.getInstance();

  // Route: Connect by session path
  // Use wildcard (*) to capture the relative path like:
  // --home-omkar-Apps-xhisper--/2026-01-28T05-24-53-939Z_xxx.jsonl
  fastify.get('/ws/session/*', { websocket: true }, async (socket: WebSocket, request: FastifyRequest<{ Params: WebSocketParams }>) => {
    // Ensure projects are initialized
    await projectManager.initialize();
    
    // The wildcard param captures everything after /ws/session/
    // This should be a relative path like: --home-omkar-Apps-xhisper--/2026-01-28T05-24-53-939Z_xxx.jsonl
    let relativePath = request.params['*'];
    
    logger.info(`WebSocket connection attempt, path: ${relativePath}`);
    
    // URL decode once (browsers may encode the path)
    try {
      relativePath = decodeURIComponent(relativePath);
    } catch {
      // If decoding fails, use as-is
    }
    
    logger.info(`WebSocket looking for session: ${relativePath}`);

    // Find the session
    const result = await findSession(relativePath, sessionManager, projectManager);

    if (!result) {
      logger.warn(`WebSocket connection attempt for non-existent session: ${relativePath}`);
      socket.close(1008, 'Session not found');
      return;
    }

    logger.info(`WebSocket connecting to session: ${result.sessionPath}`);
    
    // Handle connection
    await webSocketService.handleConnection(result.sessionPath, socket);
  });
}
