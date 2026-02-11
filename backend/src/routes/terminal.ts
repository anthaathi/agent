import { spawn, type IPty } from 'node-pty';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
import { SessionManager } from '../managers/SessionManager.js';
import { ProjectManager } from '../managers/ProjectManager.js';
import { state } from '../core/state.js';
import type { Session } from '../core/types.js';
import { logger } from '../utils/logger.js';

interface TerminalParams {
  '*': string;
}

interface TerminalQuery {
  terminalId?: string;
}

interface TerminalClientMessage {
  type: 'input' | 'resize' | 'ping' | 'close';
  data?: string;
  cols?: number;
  rows?: number;
}

interface TerminalInstance {
  key: string;
  sessionPath: string;
  terminalId: string;
  cwd: string;
  shell: string;
  ptyProcess: IPty;
  clients: Set<WebSocket>;
  history: string[];
  historyBytes: number;
  disposed: boolean;
  lastActivity: number;
}

const MAX_HISTORY_BYTES = 512 * 1024;
const terminalInstances = new Map<string, TerminalInstance>();

function sendMessage(socket: WebSocket, message: Record<string, unknown>): void {
  if (socket.readyState !== 1) {
    return;
  }

  socket.send(JSON.stringify(message), (err) => {
    if (err) {
      logger.error('Failed to send terminal websocket message', { error: err.message });
    }
  });
}

function normalizeTerminalId(rawId?: string): string {
  const cleaned = (rawId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  return cleaned || 'terminal-1';
}

function makeTerminalKey(sessionPath: string, terminalId: string): string {
  return `${sessionPath}::${terminalId}`;
}

function buildShellConfig(): { shell: string; args: string[] } {
  if (process.platform === 'win32') {
    return {
      shell: process.env.COMSPEC || 'powershell.exe',
      args: [],
    };
  }

  return {
    shell: process.env.SHELL || '/bin/bash',
    args: ['-l'],
  };
}

function appendHistory(instance: TerminalInstance, data: string): void {
  if (!data) {
    return;
  }

  instance.history.push(data);
  instance.historyBytes += Buffer.byteLength(data, 'utf8');

  while (instance.historyBytes > MAX_HISTORY_BYTES && instance.history.length > 0) {
    const removed = instance.history.shift()!;
    instance.historyBytes -= Buffer.byteLength(removed, 'utf8');
  }
}

function broadcast(instance: TerminalInstance, message: Record<string, unknown>): void {
  for (const client of instance.clients) {
    sendMessage(client, message);
  }
}

function disposeTerminalInstance(instance: TerminalInstance, reason: string): void {
  if (instance.disposed) {
    return;
  }

  instance.disposed = true;
  terminalInstances.delete(instance.key);

  try {
    instance.ptyProcess.kill();
  } catch {
    // ignore
  }

  for (const client of instance.clients) {
    if (client.readyState === 1) {
      client.close(1000, reason);
    }
  }

  instance.clients.clear();

  logger.info(`Disposed terminal ${instance.key}`, { reason });
}

async function findSession(
  relativePath: string,
  projectManager: ProjectManager
): Promise<{ sessionPath: string; session: Session } | null> {
  const directSession = state.getSession(relativePath);
  if (directSession) {
    return { sessionPath: relativePath, session: directSession };
  }

  const allProjects = state.getAllProjects();
  for (const project of allProjects) {
    const sessions = state.getSessionsByProject(project.id);
    for (const s of sessions) {
      if (s.sessionPath === relativePath) {
        return { sessionPath: s.sessionPath, session: s };
      }
    }
  }

  logger.info(`Terminal session ${relativePath} not in state, attempting to load from scanned data`);

  for (const project of allProjects) {
    try {
      await projectManager.loadProjectSessions(project.id);
      const sessions = state.getSessionsByProject(project.id);
      for (const s of sessions) {
        if (s.sessionPath === relativePath) {
          logger.info(`Found terminal session in project ${project.id}`);
          return { sessionPath: s.sessionPath, session: s };
        }
      }
    } catch {
      // Continue searching
    }
  }

  return null;
}

function getOrCreateTerminal(
  sessionPath: string,
  terminalId: string,
  cwd: string
): TerminalInstance {
  const key = makeTerminalKey(sessionPath, terminalId);
  const existing = terminalInstances.get(key);
  if (existing && !existing.disposed) {
    return existing;
  }

  const { shell, args } = buildShellConfig();

  const ptyProcess = spawn(shell, args, {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    },
  });

  const instance: TerminalInstance = {
    key,
    sessionPath,
    terminalId,
    cwd,
    shell,
    ptyProcess,
    clients: new Set<WebSocket>(),
    history: [],
    historyBytes: 0,
    disposed: false,
    lastActivity: Date.now(),
  };

  ptyProcess.onData((data) => {
    if (instance.disposed) {
      return;
    }

    appendHistory(instance, data);
    instance.lastActivity = Date.now();
    broadcast(instance, { type: 'output', data });
  });

  ptyProcess.onExit(({ exitCode, signal }) => {
    if (instance.disposed) {
      return;
    }

    instance.disposed = true;
    terminalInstances.delete(instance.key);
    broadcast(instance, { type: 'exit', exitCode, signal: signal ?? null });

    for (const client of instance.clients) {
      if (client.readyState === 1) {
        client.close(1000, 'Terminal exited');
      }
    }

    instance.clients.clear();

    logger.info(`Terminal exited ${instance.key}`, {
      exitCode,
      signal: signal ?? null,
    });
  });

  terminalInstances.set(key, instance);

  logger.info(`Spawned terminal ${instance.key}`, {
    sessionPath,
    terminalId,
    cwd,
    shell,
    pid: ptyProcess.pid,
  });

  return instance;
}

export async function terminalRoutes(fastify: FastifyInstance): Promise<void> {
  const projectManager = ProjectManager.getInstance();
  const sessionManager = SessionManager.getInstance();

  fastify.get(
    '/ws/terminal/*',
    { websocket: true },
    async (socket: WebSocket, request: FastifyRequest<{ Params: TerminalParams; Querystring: TerminalQuery }>) => {
      await projectManager.initialize();

      let relativePath = request.params['*'];

      try {
        relativePath = decodeURIComponent(relativePath);
      } catch {
        // use undecoded path
      }

      const result = await findSession(relativePath, projectManager);

      if (!result) {
        logger.warn(`Terminal connection attempt for non-existent session: ${relativePath}`);
        socket.close(1008, 'Session not found');
        return;
      }

      const project = state.getProject(result.session.projectId);
      if (!project) {
        logger.warn(`Terminal connection missing project for session: ${result.sessionPath}`);
        socket.close(1008, 'Project not found');
        return;
      }

      const terminalId = normalizeTerminalId(request.query?.terminalId);

      let instance: TerminalInstance;
      try {
        instance = getOrCreateTerminal(result.sessionPath, terminalId, project.path);
      } catch (error) {
        logger.error(`Failed to create terminal for session ${result.sessionPath}`, {
          terminalId,
          error: (error as Error).message,
        });
        sendMessage(socket, {
          type: 'error',
          message: `Failed to start terminal: ${(error as Error).message}`,
        });
        socket.close(1011, 'Terminal spawn failed');
        return;
      }

      instance.clients.add(socket);
      instance.lastActivity = Date.now();
      sessionManager.updateSessionActivity(result.sessionPath);

      logger.info(`Terminal websocket connected ${instance.key}`, {
        pid: instance.ptyProcess.pid,
        clients: instance.clients.size,
      });

      sendMessage(socket, {
        type: 'ready',
        terminalId: instance.terminalId,
        pid: instance.ptyProcess.pid,
        shell: instance.shell,
        cwd: instance.cwd,
      });

      for (const chunk of instance.history) {
        sendMessage(socket, { type: 'output', data: chunk });
      }

      socket.on('message', (raw) => {
        let message: TerminalClientMessage;
        try {
          message = JSON.parse(raw.toString()) as TerminalClientMessage;
        } catch {
          sendMessage(socket, { type: 'error', message: 'Invalid terminal message' });
          return;
        }

        if (instance.disposed) {
          sendMessage(socket, { type: 'error', message: 'Terminal is not available' });
          return;
        }

        sessionManager.updateSessionActivity(result.sessionPath);
        instance.lastActivity = Date.now();

        switch (message.type) {
          case 'input':
            if (typeof message.data === 'string') {
              instance.ptyProcess.write(message.data);
            }
            break;

          case 'resize':
            if (typeof message.cols === 'number' && typeof message.rows === 'number') {
              const cols = Math.max(20, Math.min(400, Math.floor(message.cols)));
              const rows = Math.max(5, Math.min(200, Math.floor(message.rows)));
              try {
                instance.ptyProcess.resize(cols, rows);
              } catch (error) {
                logger.warn(`Terminal resize failed for ${instance.key}`, {
                  error: (error as Error).message,
                  cols,
                  rows,
                });
              }
            }
            break;

          case 'close':
            disposeTerminalInstance(instance, 'Terminal closed');
            break;

          case 'ping':
            sendMessage(socket, { type: 'pong' });
            break;
        }
      });

      const detach = () => {
        instance.clients.delete(socket);
        logger.info(`Terminal websocket disconnected ${instance.key}`, {
          clients: instance.clients.size,
        });
      };

      socket.on('close', detach);
      socket.on('error', (error) => {
        logger.error(`Terminal websocket error for ${instance.key}`, {
          error: error.message,
        });
        detach();
      });
    }
  );
}
