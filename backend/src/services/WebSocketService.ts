import type { WebSocket } from 'ws';
import { state } from '../core/state.js';
import { SessionManager } from '../managers/SessionManager.js';
import { ProcessManager } from '../managers/ProcessManager.js';
import type { ClientMessage, ExtensionUIResponse } from '../core/types.js';
import type { WebSocketConnection } from '../managers/types.js';
import { logger } from '../utils/logger.js';
import { decodeSessionPath, resolveSessionPath } from '../utils/path-encode.js';

const PING_INTERVAL = 30000; // 30 seconds
const PONG_TIMEOUT = 10000; // 10 seconds
const MAX_BUFFERED_MESSAGES = 100;

export class WebSocketService {
  private static instance: WebSocketService;
  private sessionManager: SessionManager;
  private processManager: ProcessManager;
  private pingInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.sessionManager = SessionManager.getInstance();
    this.processManager = ProcessManager.getInstance();
    this.startPingInterval();
  }

  static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      for (const [sessionPath, connections] of state.getAllConnections()) {
        for (const connection of connections) {
          if (!connection.isAlive) {
            logger.warn(`WebSocket timeout for session ${decodeSessionPath(sessionPath)}`);
            this.handleDisconnect(sessionPath, connection.socket);
            continue;
          }

          connection.isAlive = false;
          if (connection.socket.readyState === 1) { // OPEN
            connection.socket.ping();
          }
        }
      }
    }, PING_INTERVAL);
  }

  private async ensureProcessExists(sessionPath: string): Promise<void> {
    const existingProcess = state.getProcess(sessionPath);
    if (existingProcess) {
      logger.info(`Process already exists for session ${decodeSessionPath(sessionPath)}`);
      return;
    }

    const session = state.getSession(sessionPath);
    if (!session) {
      logger.warn(`Session ${decodeSessionPath(sessionPath)} not found, cannot spawn process`);
      return;
    }

    const project = state.getProject(session.projectId);
    if (!project) {
      logger.warn(`Project ${session.projectId} not found for session ${decodeSessionPath(sessionPath)}`);
      return;
    }

    try {
      logger.info(`Spawning process for existing session ${sessionPath}`);
      // Get session directory from the resolved absolute path
      const absolutePath = resolveSessionPath(sessionPath);
      const sessionDir = absolutePath.substring(0, absolutePath.lastIndexOf('/'));
      
      await this.processManager.spawnProcess({
        sessionPath,
        projectPath: project.path,
        sessionDir,
      });
      logger.info(`Process spawned successfully for session ${sessionPath}`);
    } catch (err) {
      logger.error(`Failed to spawn process for session ${decodeSessionPath(sessionPath)}`, { error: (err as Error).message });
    }
  }

  async handleConnection(sessionPath: string, socket: WebSocket): Promise<void> {
    logger.info(`WebSocket connection for session ${decodeSessionPath(sessionPath)}`);

    const connection: WebSocketConnection = {
      sessionPath,
      socket,
      isAlive: true,
      messageQueue: [],
      isPaused: false,
    };

    state.addConnection(sessionPath, connection);

    // Ensure process exists before signaling the client
    await this.ensureProcessExists(sessionPath);

    // Send connected message — process is now ready to handle commands
    this.sendMessage(sessionPath, { type: 'connected' });

    // Setup socket handlers
    socket.on('message', (data) => {
      this.handleMessage(sessionPath, data.toString());
    });

    socket.on('close', () => {
      this.handleDisconnect(sessionPath, socket);
    });

    socket.on('error', (err) => {
      logger.error(`WebSocket error for session ${decodeSessionPath(sessionPath)}`, { error: err.message });
    });

    socket.on('pong', () => {
      connection.isAlive = true;
    });

    socket.on('drain', () => {
      connection.isPaused = false;
      this.flushMessageQueue(connection);
    });

    // Update session activity
    this.sessionManager.updateSessionActivity(sessionPath);
  }

  private handleMessage(sessionPath: string, data: string): void {
    try {
      const message = JSON.parse(data) as ClientMessage;
      logger.info(`WebSocket message for session ${decodeSessionPath(sessionPath)}`, { type: message.type, command: message.command?.type });

      switch (message.type) {
        case 'command':
          if (message.command) {
            this.sessionManager.sendCommand(sessionPath, message.command);
          }
          break;

        case 'extension_ui_response':
          if (message.id) {
            this.sessionManager.handleExtensionUIResponse(sessionPath, {
              id: message.id,
              value: message.value,
              confirmed: message.confirmed,
              cancelled: message.cancelled,
            });
          }
          break;

        default:
          logger.warn(`Unknown message type from session ${decodeSessionPath(sessionPath)}`, { type: message.type });
      }
    } catch (err) {
      logger.error(`Failed to parse WebSocket message for session ${decodeSessionPath(sessionPath)}`, { error: (err as Error).message });
    }
  }

  private handleDisconnect(sessionPath: string, socket: WebSocket): void {
    logger.info(`WebSocket disconnect for session ${decodeSessionPath(sessionPath)}`);

    const connections = state.getConnections(sessionPath);
    const connectionToRemove = Array.from(connections).find(c => c.socket === socket);
    
    if (connectionToRemove) {
      state.removeConnection(sessionPath, connectionToRemove);
    }

    // Only cleanup pending UIs when last connection disconnects
    const remainingConnections = state.getConnections(sessionPath);
    if (remainingConnections.size === 0) {
      const piProcess = state.getProcess(sessionPath);
      if (piProcess) {
        for (const [id, pending] of piProcess.pendingExtensionUIs) {
          clearTimeout(pending.timeout);
          pending.reject(new Error('Client disconnected'));
        }
        piProcess.pendingExtensionUIs.clear();
      }
    }
  }

  sendMessage(sessionPath: string, message: Record<string, unknown>): boolean {
    const connections = state.getConnections(sessionPath);
    if (connections.size === 0) {
      return false;
    }

    const messageStr = JSON.stringify(message);
    let anySuccess = false;

    for (const connection of connections) {
      if (connection.socket.readyState !== 1) {
        continue;
      }

      // Check backpressure
      if (connection.isPaused) {
        if (connection.messageQueue.length < MAX_BUFFERED_MESSAGES) {
          connection.messageQueue.push(messageStr);
          anySuccess = true;
        } else {
          // Drop oldest message
          connection.messageQueue.shift();
          connection.messageQueue.push(messageStr);
          logger.warn(`Message queue full for session ${decodeSessionPath(sessionPath)}, dropping oldest`);
        }
        continue;
      }

      try {
        connection.socket.send(messageStr, (err) => {
          if (err) {
            logger.error(`WebSocket send error for session ${decodeSessionPath(sessionPath)}`, { error: err.message });
          }
        });
        anySuccess = true;
      } catch (err) {
        logger.error(`WebSocket send failed for session ${decodeSessionPath(sessionPath)}`, { error: (err as Error).message });
        connection.isPaused = true;
      }
    }

    return anySuccess;
  }

  private flushMessageQueue(connection: WebSocketConnection): void {
    if (connection.socket.readyState !== 1) {
      return;
    }

    while (connection.messageQueue.length > 0 && !connection.isPaused) {
      const message = connection.messageQueue.shift()!;
      try {
        connection.socket.send(message, (err) => {
          if (err) {
            logger.error(`WebSocket send error for session ${decodeSessionPath(connection.sessionPath)}`, { error: err.message });
          }
        });
      } catch (err) {
        logger.error(`WebSocket send failed for session ${decodeSessionPath(connection.sessionPath)}`, { error: (err as Error).message });
        connection.isPaused = true;
        // Put message back at front of queue
        connection.messageQueue.unshift(message);
        break;
      }
    }
  }

  stop(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
  }
}
