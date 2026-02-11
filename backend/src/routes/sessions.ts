import type { FastifyInstance, FastifyRequest } from 'fastify';
import { SessionManager } from '../managers/SessionManager.js';
import { ProjectManager } from '../managers/ProjectManager.js';
import { state } from '../core/state.js';
import type { Session } from '../core/types.js';
import { logger } from '../utils/logger.js';
import { decodeSessionPath } from '../utils/path-encode.js';

interface CreateSessionBody {
  projectId: string;
  name?: string;
  cwd?: string;
}

interface WildcardParams {
  '*': string;
}

interface CommandBody {
  command: {
    type: string;
    [key: string]: unknown;
  };
}

const KNOWN_SUFFIXES = ['/state', '/command', '/messages'] as const;
type RouteSuffix = typeof KNOWN_SUFFIXES[number] | null;

function parseWildcard(raw: string): { sessionPath: string; suffix: RouteSuffix } {
  for (const suffix of KNOWN_SUFFIXES) {
    if (raw.endsWith(suffix)) {
      return { sessionPath: raw.slice(0, -suffix.length), suffix };
    }
  }
  return { sessionPath: raw, suffix: null };
}

function decodeSessionParam(encodedPath: string): string {
  try {
    const firstDecode = decodeURIComponent(encodedPath);
    if (firstDecode !== encodedPath) {
      try {
        const secondDecode = decodeURIComponent(firstDecode);
        if (secondDecode !== firstDecode) {
          return secondDecode;
        } else {
          return firstDecode;
        }
      } catch {
        return firstDecode;
      }
    }
  } catch {
    // Not encoded or invalid
  }
  return encodedPath;
}

export async function sessionRoutes(fastify: FastifyInstance): Promise<void> {
  const sessionManager = SessionManager.getInstance();
  const projectManager = ProjectManager.getInstance();

  async function findSessionByPath(decodedPath: string): Promise<Session | null> {
    logger.info(`Looking for session: ${decodedPath}`);

    await projectManager.initialize();

    const allProjects = state.getAllProjects();
    for (const project of allProjects) {
      const sessions = state.getSessionsByProject(project.id);
      for (const s of sessions) {
        const storedDecodedPath = decodeSessionPath(s.sessionPath);
        if (storedDecodedPath === decodedPath) {
          return s;
        }
      }
    }

    logger.info(`Session not in loaded sessions, trying to scan...`);
    for (const project of allProjects) {
      try {
        await projectManager.loadProjectSessions(project.id);
        const sessions = state.getSessionsByProject(project.id);
        for (const s of sessions) {
          const storedDecodedPath = decodeSessionPath(s.sessionPath);
          if (storedDecodedPath === decodedPath) {
            return s;
          }
        }
      } catch (err) {
        logger.warn(`Failed to load sessions for project ${project.id}: ${(err as Error).message}`);
      }
    }

    logger.warn(`Session not found: ${decodedPath}`);
    return null;
  }

  fastify.get('/', async () => {
    try {
      return { sessions: [] };
    } catch (err) {
      logger.error('Failed to list sessions', { error: (err as Error).message });
      return { error: 'Failed to list sessions' };
    }
  });

  fastify.post('/', async (request: FastifyRequest<{ Body: CreateSessionBody }>, reply) => {
    try {
      const { projectId, name, cwd } = request.body;

      if (!projectId) {
        reply.status(400);
        return { error: 'Missing required field: projectId' };
      }

      const session = await sessionManager.createSession(projectId, name, cwd);
      reply.status(201);
      return { session };
    } catch (err) {
      const message = (err as Error).message || 'Failed to create session';
      logger.error('Failed to create session', { error: message });
      if (message.includes('Project') && message.includes('not found')) {
        reply.status(404);
        return { error: message };
      }
      reply.status(500);
      return { error: message };
    }
  });

  // Wildcard GET handles: get session, get state, get messages
  // Encoded slashes (%2F) get decoded by Fastify's router before matching,
  // which breaks :param routes by creating extra path segments.
  fastify.get('/*', async (request: FastifyRequest<{ Params: WildcardParams }>, reply) => {
    try {
      const raw = request.params['*'];
      const { sessionPath: rawSessionPath, suffix } = parseWildcard(raw);
      const decodedPath = decodeSessionParam(rawSessionPath);
      const session = await findSessionByPath(decodedPath);

      if (!session) {
        reply.status(404);
        return { error: 'Session not found' };
      }

      if (suffix === '/state') {
        const sessionState = await sessionManager.getSessionState(session.sessionPath);
        return { state: sessionState };
      }

      if (suffix === '/messages') {
        let messages = sessionManager.getSessionMessages(session.sessionPath);
        if (messages.length === 0) {
          messages = await sessionManager.getSessionMessagesFromFile(session.sessionPath);
        }
        return { messages };
      }

      return { session };
    } catch (err) {
      logger.error('Failed to handle GET session request', { error: (err as Error).message });
      reply.status(500);
      return { error: 'Failed to handle request' };
    }
  });

  // Wildcard DELETE handles: delete session
  fastify.delete('/*', async (request: FastifyRequest<{ Params: WildcardParams }>, reply) => {
    try {
      const raw = request.params['*'];
      const { sessionPath: rawSessionPath } = parseWildcard(raw);
      const decodedPath = decodeSessionParam(rawSessionPath);
      const session = await findSessionByPath(decodedPath);

      if (!session) {
        reply.status(404);
        return { error: 'Session not found' };
      }

      await sessionManager.deleteSession(session.sessionPath);
      reply.status(204);
    } catch (err) {
      if ((err as Error).message.includes('not found')) {
        reply.status(404);
        return { error: 'Session not found' };
      }
      logger.error('Failed to delete session', { error: (err as Error).message });
      reply.status(500);
      return { error: 'Failed to delete session' };
    }
  });

  // Wildcard POST handles: send command
  fastify.post('/*', async (request: FastifyRequest<{ Params: WildcardParams; Body: CommandBody }>, reply) => {
    try {
      const raw = request.params['*'];
      const { sessionPath: rawSessionPath, suffix } = parseWildcard(raw);

      if (suffix !== '/command') {
        reply.status(404);
        return { error: 'Not found' };
      }

      const decodedPath = decodeSessionParam(rawSessionPath);
      const session = await findSessionByPath(decodedPath);

      if (!session) {
        reply.status(404);
        return { error: 'Session not found' };
      }

      const { command } = request.body;

      if (!command) {
        reply.status(400);
        return { error: 'Missing required field: command' };
      }

      const success = await sessionManager.sendCommand(session.sessionPath, command);

      if (!success) {
        reply.status(503);
        return { error: 'Session not available' };
      }

      return { success: true };
    } catch (err) {
      logger.error('Failed to send command', { error: (err as Error).message });
      reply.status(500);
      return { error: 'Failed to send command' };
    }
  });
}
