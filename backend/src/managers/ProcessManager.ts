import {
  AuthStorage,
  createAgentSession,
  ModelRegistry,
  SessionManager as PiSessionManager,
  type AgentSessionEvent,
} from '@mariozechner/pi-coding-agent';
import type { ImageContent, TextContent } from '@mariozechner/pi-ai';
import { state } from '../core/state.js';
import type { PiCommand } from '../core/types.js';
import type { PiProcess, ProcessSpawnOptions } from './types.js';
import { logger } from '../utils/logger.js';
import { decodeSessionPath } from '../utils/path-encode.js';

const authStorage = new AuthStorage();
const modelRegistry = new ModelRegistry(authStorage);

// Log available models on startup
(async () => {
  try {
    modelRegistry.refresh();
    const models = await modelRegistry.getAvailable();
    logger.info('Available models', { count: models.length, models: models.slice(0, 3).map((m: { id: string }) => m.id) });
  } catch (err) {
    logger.error('Failed to get available models', { error: (err as Error).message });
  }
})();

export class ProcessManager {
  private static instance: ProcessManager;

  static getInstance(): ProcessManager {
    if (!ProcessManager.instance) {
      ProcessManager.instance = new ProcessManager();
    }
    return ProcessManager.instance;
  }

  async spawnProcess(options: ProcessSpawnOptions): Promise<PiProcess> {
    const { sessionPath, projectPath, sessionDir } = options;
    const decodedPath = decodeSessionPath(sessionPath);

    logger.info(`Creating pi session for ${decodedPath}`, { projectPath, sessionDir });

    // Create session manager first to check for saved model
    const sessionManager = PiSessionManager.create(projectPath, sessionDir);
    
    // Try to restore model from session context
    let savedModel = undefined;
    try {
      const context = sessionManager.buildSessionContext();
      if (context.model) {
        savedModel = modelRegistry.find(context.model.provider, context.model.modelId);
        if (savedModel) {
          logger.info(`Restored model from session: ${context.model.provider}/${context.model.modelId}`);
        }
      }
    } catch (err) {
      logger.warn(`Failed to build session context for ${decodedPath}`, { error: (err as Error).message });
    }

    const { session } = await createAgentSession({
      cwd: projectPath,
      sessionManager,
      authStorage,
      modelRegistry,
      model: savedModel, // Use restored model or let SDK pick default
    });

    const piProcess: PiProcess = {
      sessionPath,
      session,
      pendingExtensionUIs: new Map(),
      isReady: false,
      unsubscribe: () => {},
    };

    const unsubscribe = session.subscribe((event) => {
      this.handleSessionEvent(piProcess, event);
    });
    piProcess.unsubscribe = unsubscribe;

    piProcess.isReady = true;
    state.setProcess(sessionPath, piProcess);

    return piProcess;
  }

  private handleSessionEvent(piProcess: PiProcess, event: AgentSessionEvent): void {
    const { sessionPath } = piProcess;
    const decodedPath = decodeSessionPath(sessionPath);

    logger.info(`Session event for ${decodedPath}`, { eventType: event.type });

    const connections = state.getConnections(sessionPath);
    if (connections.size === 0) {
      logger.warn(`No active connections for session ${decodedPath}`);
      return;
    }

    const eventData = this.serializeEvent(event);
    const messageStr = JSON.stringify({ type: 'event', event: eventData });

    for (const connection of connections) {
      if (connection.socket.readyState === 1) {
        try {
          connection.socket.send(messageStr);
        } catch (err) {
          logger.error(`Failed to send event to connection`, { 
            sessionPath: decodedPath, 
            error: (err as Error).message 
          });
        }
      }
    }
  }

  private serializeEvent(event: AgentSessionEvent): Record<string, unknown> {
    return event as unknown as Record<string, unknown>;
  }

  private broadcastError(sessionPath: string, message: string): void {
    const connections = state.getConnections(sessionPath);
    const errorMessage = JSON.stringify({
      type: 'event',
      event: { type: 'error', message },
    });

    for (const connection of connections) {
      if (connection.socket.readyState === 1) {
        try {
          connection.socket.send(errorMessage);
        } catch (err) {
          logger.error(`Failed to send error to connection`, { sessionPath: decodeSessionPath(sessionPath), error: (err as Error).message });
        }
      }
    }
  }

  handleExtensionUIResponse(
    sessionPath: string,
    response: { id: string; value?: string; confirmed?: boolean; cancelled?: boolean }
  ): void {
    const piProcess = state.getProcess(sessionPath);
    if (!piProcess) return;

    const pending = piProcess.pendingExtensionUIs.get(response.id);
    if (!pending) return;

    clearTimeout(pending.timeout);
    piProcess.pendingExtensionUIs.delete(response.id);

    if (response.cancelled) {
      pending.resolve(undefined);
    } else if (response.confirmed !== undefined) {
      pending.resolve(response.confirmed);
    } else {
      pending.resolve(response.value);
    }
  }

  async sendCommand(piProcess: PiProcess, command: PiCommand): Promise<boolean> {
    const { session, sessionPath } = piProcess;
    const decodedPath = decodeSessionPath(sessionPath);

    try {
      switch (command.type) {
        case 'prompt': {
          // First-come-first-serve: acquire execution lock
          if (!state.acquireExecutionLock(sessionPath)) {
            logger.warn(`Session ${decodedPath} is already executing, rejecting prompt`);
            this.broadcastError(sessionPath, 'Agent is busy. Another prompt is currently being processed.');
            return false;
          }

          const promptMessage = command.message as string;
          const attachments = command.attachments as Array<{ type: string; data: string; mimeType: string; name?: string }> | undefined;
          
          logger.info(`Sending prompt for session ${decodedPath}`, { 
            message: promptMessage.slice(0, 100),
            attachmentCount: attachments?.length || 0 
          });

          // Build content array with text and images
          const content: (TextContent | ImageContent)[] = [];
          
          // Add text content
          if (promptMessage.trim()) {
            content.push({ type: 'text', text: promptMessage });
          }
          
          // Add image attachments
          if (attachments && attachments.length > 0) {
            for (const att of attachments) {
              if (att.type === 'image') {
                content.push({
                  type: 'image',
                  data: att.data,
                  mimeType: att.mimeType,
                });
              }
            }
          }
          
          // Use sendUserMessage to send content array (supports images)
          session.sendUserMessage(content)
            .then(() => {
              logger.info(`Prompt completed for session ${decodedPath}`, { messageCount: session.messages.length });
            })
            .catch((err) => {
              logger.error(`Prompt error for session ${decodedPath}`, { error: (err as Error).message });
              this.broadcastError(sessionPath, (err as Error).message);
            })
            .finally(() => {
              state.releaseExecutionLock(sessionPath);
            });
          break;
        }

        case 'abort':
          await session.abort();
          break;

        case 'get_state':
          this.sendStateResponse(piProcess);
          break;

        case 'get_available_models': {
          modelRegistry.refresh();
          const models = await modelRegistry.getAvailable();
          const connections = state.getConnections(sessionPath);
          const responseMessage = JSON.stringify({
            type: 'event',
            event: {
              type: 'response',
              command: 'get_available_models',
              success: true,
              data: { models },
            },
          });

          for (const connection of connections) {
            if (connection.socket.readyState === 1) {
              try {
                connection.socket.send(responseMessage);
              } catch (err) {
                logger.error(`Failed to send models to connection`, { sessionPath: decodedPath, error: (err as Error).message });
              }
            }
          }
          break;
        }

        case 'set_model': {
          const model = modelRegistry.find(
            command.provider as string,
            command.modelId as string
          );
          if (model) {
            await session.setModel(model);
          }
          break;
        }

        case 'set_thinking_level':
          session.setThinkingLevel(command.level as 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh');
          break;

        case 'new_session':
          await session.newSession();
          break;

        default:
          logger.warn(`Unknown command type: ${command.type}`);
          return false;
      }

      return true;
    } catch (err) {
      logger.error(`Failed to execute command for session ${decodedPath}`, {
        error: (err as Error).message,
        command: command.type,
      });
      return false;
    }
  }

  private sendStateResponse(piProcess: PiProcess): void {
    const { session, sessionPath } = piProcess;
    const connections = state.getConnections(sessionPath);

    const responseMessage = JSON.stringify({
      type: 'event',
      event: {
        type: 'response',
        command: 'get_state',
        success: true,
        data: {
          messages: session.messages,
          model: session.model,
          thinkingLevel: session.thinkingLevel,
          isStreaming: session.isStreaming,
          sessionId: session.sessionId,
          sessionFile: session.sessionFile,
        },
      },
    });

    for (const connection of connections) {
      if (connection.socket.readyState === 1) {
        try {
          connection.socket.send(responseMessage);
        } catch (err) {
          logger.error(`Failed to send state to connection`, { sessionPath: decodeSessionPath(sessionPath), error: (err as Error).message });
        }
      }
    }
  }

  async killProcess(sessionPath: string): Promise<void> {
    const piProcess = state.getProcess(sessionPath);
    if (!piProcess) return;

    for (const [_id, pending] of piProcess.pendingExtensionUIs) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Process killed'));
    }
    piProcess.pendingExtensionUIs.clear();

    piProcess.unsubscribe();
    piProcess.session.dispose();

    this.cleanupProcess(sessionPath);
  }

  private cleanupProcess(sessionPath: string): void {
    const piProcess = state.getProcess(sessionPath);
    if (!piProcess) return;

    for (const [_id, pending] of piProcess.pendingExtensionUIs) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Process disconnected'));
    }

    state.deleteProcess(sessionPath);

    const session = state.getSession(sessionPath);
    if (session) {
      session.status = 'error';
      state.setSession(session);
    }

    const connections = state.getConnections(sessionPath);
    const disconnectMessage = JSON.stringify({ type: 'disconnected', message: 'Pi session ended' });

    for (const connection of connections) {
      if (connection.socket.readyState === 1) {
        try {
          connection.socket.send(disconnectMessage);
        } catch (err) {
          logger.error(`Failed to send disconnect to connection`, { sessionPath: decodeSessionPath(sessionPath), error: (err as Error).message });
        }
      }
    }
  }

  getMetrics(sessionPath: string): { memoryUsage: number; uptime: number } | null {
    const piProcess = state.getProcess(sessionPath);
    if (!piProcess) return null;

    return {
      memoryUsage: process.memoryUsage().heapUsed,
      uptime: Date.now(),
    };
  }
}
