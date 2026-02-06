import type { AgentSessionEvent } from '@mariozechner/pi-coding-agent';
import type { AgentEvent, AgentMessage, ThinkingLevel } from '@mariozechner/pi-agent-core';
import type { Model, Api, AssistantMessageEvent } from '@mariozechner/pi-ai';

// Image attachment for prompts
export interface ImageAttachment {
  type: 'image';
  data: string; // base64 encoded
  mimeType: string;
  name: string;
}

// Command types sent to backend
export interface PiCommand {
  type: 'prompt' | 'abort' | 'get_state' | 'get_available_models' | 'set_model' | 'set_thinking_level' | 'new_session';
  message?: string;
  attachments?: ImageAttachment[];
  provider?: string;
  modelId?: string;
  level?: ThinkingLevel;
}

// Response event from backend
export interface ResponseEvent {
  type: 'response';
  command: string;
  success: boolean;
  data?: {
    models?: Model<Api>[];
    model?: Model<Api>;
    thinkingLevel?: ThinkingLevel;
    messages?: AgentMessage[];
    isStreaming?: boolean;
    sessionId?: string;
    sessionFile?: string;
  };
}

// All possible events from backend
export type PiServerEvent = AgentSessionEvent | ResponseEvent | { type: 'error'; message: string };

// Client message types
export interface ClientMessage {
  type: 'command' | 'extension_ui_response';
  command?: PiCommand;
  id?: string;
  value?: string;
  confirmed?: boolean;
  cancelled?: boolean;
}

// Server message wrapper
export interface ServerMessage {
  type: 'connected' | 'event' | 'extension_ui_request' | 'error' | 'disconnected';
  event?: PiServerEvent;
  message?: string;
  id?: string;
}

export type StreamingContentItem = 
  | { type: 'thinking'; index: number }
  | { type: 'toolCall'; id: string }
  | { type: 'text' };

export interface PiSessionState {
  isConnected: boolean;
  isLoading: boolean;
  models: Model<Api>[];
  currentModel?: Model<Api>;
  thinkingLevel: ThinkingLevel;
  streamingMessageId: string | null;
  streamingText: string;
  streamingThinkingBlocks: string[];
  streamingToolCalls: Map<string, ToolCallState>;
  streamingContentOrder: StreamingContentItem[];
}

export interface ToolCallState {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: {
    content: Array<{ type: string; text?: string }>;
    details?: unknown;
  };
  isError?: boolean;
  isRunning?: boolean;
  startTime?: number;
  endTime?: number;
}

export type PiSessionClientListener = (state: PiSessionState) => void;
export type PiSessionEventListener = (event: PiServerEvent) => void;

export class PiSessionClient {
  private ws: WebSocket | null = null;
  private sessionId: string;
  private baseUrl: string;
  private usePathBased: boolean;
  private listeners: Set<PiSessionClientListener> = new Set();
  private eventListeners: Set<PiSessionEventListener> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  private state: PiSessionState = {
    isConnected: false,
    isLoading: false,
    models: [],
    currentModel: undefined,
    thinkingLevel: 'medium',
    streamingMessageId: null,
    streamingText: '',
    streamingThinkingBlocks: [],
    streamingToolCalls: new Map(),
    streamingContentOrder: [],
  };

  constructor(sessionId: string, baseUrl: string = '') {
    this.sessionId = sessionId;
    this.baseUrl = baseUrl || window.location.origin.replace(/^http/, 'ws');
    this.usePathBased = false;
  }

  /**
   * Create a client that connects by session file path instead of session ID.
   * The path will be URL-encoded and used directly in the WebSocket URL.
   */
  static fromSessionFile(sessionFilePath: string, baseUrl: string = ''): PiSessionClient {
    const client = new PiSessionClient(sessionFilePath, baseUrl);
    client.usePathBased = true;
    return client;
  }

  getState(): Readonly<PiSessionState> {
    return this.state;
  }

  subscribe(listener: PiSessionClientListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  subscribeToEvents(listener: PiSessionEventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  private notifyEventListeners(event: PiServerEvent): void {
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }

  private updateState(updates: Partial<PiSessionState>): void {
    this.state = { ...this.state, ...updates };
    this.notifyListeners();
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    let wsUrl: string;
    if (this.usePathBased) {
      // Use path-based connection with single URL encoding
      // Session paths are now simple relative paths like:
      // --home-omkar-Apps-xhisper--/2026-01-28T05-24-53-939Z_xxx.jsonl
      const encodedPath = encodeURIComponent(this.sessionId);
      wsUrl = `${this.baseUrl}/ws/session/${encodedPath}`;
    } else {
      wsUrl = `${this.baseUrl}/ws/session/${this.sessionId}`;
    }
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
    };

    this.ws.onclose = (event) => {
      this.updateState({ isConnected: false });
      // Only reconnect if it wasn't a deliberate close (e.g., session not found)
      if (event.code !== 1008) {
        this.attemptReconnect();
      }
    };

    this.ws.onerror = (error) => {
      console.error('[PiSessionClient] Error:', error);
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as ServerMessage;
        this.handleServerMessage(message);
      } catch (err) {
        console.error('[PiSessionClient] Failed to parse message:', err);
      }
    };
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.ws?.close();
    this.ws = null;
    this.updateState({ isConnected: false });
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    
    this.reconnectTimeout = setTimeout(() => this.connect(), delay);
  }

  private handleServerMessage(message: ServerMessage): void {
    switch (message.type) {
      case 'connected':
        this.updateState({ isConnected: true });
        // Now safe to send commands
        this.sendCommand({ type: 'get_available_models' });
        this.sendCommand({ type: 'get_state' });
        break;

      case 'event':
        if (message.event) {
          this.handleEvent(message.event);
          this.notifyEventListeners(message.event);
        }
        break;

      case 'extension_ui_request':
        if (message.id) {
          this.send({
            type: 'extension_ui_response',
            id: message.id,
            cancelled: true,
          });
        }
        break;

      case 'error':
        console.error('[PiSessionClient] Server error:', message.message);
        this.updateState({ isLoading: false });
        break;

      case 'disconnected':
        this.updateState({ isConnected: false });
        break;
    }
  }

  private handleEvent(event: PiServerEvent): void {
    switch (event.type) {
      case 'agent_start':
        this.updateState({
          isLoading: true,
          streamingMessageId: `turn-${Date.now()}`,
          streamingText: '',
          streamingThinkingBlocks: [],
          streamingToolCalls: new Map(),
          streamingContentOrder: [],
        });
        break;

      case 'message_start':
      case 'turn_start':
        break;

      case 'message_update': {
        const updateEvent = event as AgentEvent & { type: 'message_update' };
        const assistantEvent = updateEvent.assistantMessageEvent as AssistantMessageEvent & {
          partial?: {
            content?: Array<{ type: string; text?: string; thinking?: string; id?: string; name?: string; arguments?: Record<string, unknown> }>;
          };
          type: string;
          delta?: string;
          content?: string;
          contentIndex?: number;
        };

        if (assistantEvent.partial?.content && Array.isArray(assistantEvent.partial.content)) {
          const content = assistantEvent.partial.content;
          const thinkingBlocks: string[] = [];
          let text = '';
          const newToolCalls = new Map(this.state.streamingToolCalls);
          const contentOrder: StreamingContentItem[] = [];
          let hasText = false;

          for (const block of content) {
            if (block.type === 'thinking') {
              thinkingBlocks.push(block.thinking || '');
              contentOrder.push({ type: 'thinking', index: thinkingBlocks.length - 1 });
            } else if (block.type === 'text') {
              text += block.text || '';
              if (!hasText) {
                contentOrder.push({ type: 'text' });
                hasText = true;
              }
            } else if (block.type === 'toolCall' && block.id && block.name) {
              const existing = newToolCalls.get(block.id);
              newToolCalls.set(block.id, {
                id: block.id,
                name: block.name,
                arguments: block.arguments || existing?.arguments || {},
                result: existing?.result,
                isError: existing?.isError,
                isRunning: existing?.isRunning ?? true,
                startTime: existing?.startTime,
                endTime: existing?.endTime,
              });
              contentOrder.push({ type: 'toolCall', id: block.id });
            }
          }

          this.updateState({
            streamingText: text,
            streamingThinkingBlocks: thinkingBlocks,
            streamingToolCalls: newToolCalls,
            streamingContentOrder: contentOrder,
          });
          break;
        }

        if (assistantEvent.type === 'text_delta') {
          const delta = assistantEvent.delta || '';
          const hasTextInOrder = this.state.streamingContentOrder.some(c => c.type === 'text');
          this.updateState({
            streamingText: this.state.streamingText + delta,
            streamingContentOrder: hasTextInOrder
              ? this.state.streamingContentOrder
              : [...this.state.streamingContentOrder, { type: 'text' }],
          });
        }
        break;
      }

      case 'message_end':
      case 'turn_end': {
        const endEvent = event as {
          type: 'message_end' | 'turn_end';
          message?: { role?: string; content?: Array<{ type: string; text?: string; thinking?: string; id?: string; name?: string; arguments?: Record<string, unknown> }> };
        };

        if (endEvent.message?.role === 'assistant' && Array.isArray(endEvent.message.content)) {
          const content = endEvent.message.content;
          const thinkingBlocks: string[] = [];
          let text = '';
          const newToolCalls = new Map(this.state.streamingToolCalls);
          const contentOrder: StreamingContentItem[] = [];
          let hasText = false;

          for (const block of content) {
            if (block.type === 'thinking') {
              thinkingBlocks.push(block.thinking || '');
              contentOrder.push({ type: 'thinking', index: thinkingBlocks.length - 1 });
            } else if (block.type === 'text') {
              text += block.text || '';
              if (!hasText) {
                contentOrder.push({ type: 'text' });
                hasText = true;
              }
            } else if (block.type === 'toolCall' && block.id && block.name) {
              const existing = newToolCalls.get(block.id);
              newToolCalls.set(block.id, {
                id: block.id,
                name: block.name,
                arguments: block.arguments || existing?.arguments || {},
                result: existing?.result,
                isError: existing?.isError,
                isRunning: existing?.isRunning ?? false,
                startTime: existing?.startTime,
                endTime: existing?.endTime,
              });
              contentOrder.push({ type: 'toolCall', id: block.id });
            }
          }

          this.updateState({
            streamingText: text,
            streamingThinkingBlocks: thinkingBlocks,
            streamingToolCalls: newToolCalls,
            streamingContentOrder: contentOrder,
          });
        }
        break;
      }

      case 'tool_execution_start': {
        const toolEvent = event as AgentEvent & { type: 'tool_execution_start' };
        const newToolCalls = new Map(this.state.streamingToolCalls);
        const existing = newToolCalls.get(toolEvent.toolCallId);
        newToolCalls.set(toolEvent.toolCallId, {
          ...existing,
          id: toolEvent.toolCallId,
          name: toolEvent.toolName,
          arguments: toolEvent.args || existing?.arguments || {},
          isRunning: true,
          startTime: Date.now(),
        });
        this.updateState({ streamingToolCalls: newToolCalls });
        break;
      }

      case 'tool_execution_end': {
        const toolEvent = event as AgentEvent & { type: 'tool_execution_end' };
        const newToolCalls = new Map(this.state.streamingToolCalls);
        const existing = newToolCalls.get(toolEvent.toolCallId);
        if (existing) {
          newToolCalls.set(toolEvent.toolCallId, {
            ...existing,
            result: toolEvent.result,
            isError: toolEvent.isError || false,
            isRunning: false,
            endTime: Date.now(),
          });
          this.updateState({ streamingToolCalls: newToolCalls });
        }
        break;
      }

      case 'agent_end':
        this.updateState({ isLoading: false });
        break;

      case 'response': {
        const responseEvent = event as ResponseEvent;
        this.handleResponse(responseEvent);
        break;
      }

      case 'error':
        console.error('[PiSessionClient] Agent error:', (event as { type: 'error'; message: string }).message);
        this.updateState({ isLoading: false });
        break;
    }
  }

  private handleResponse(event: ResponseEvent): void {
    const { command, data } = event;

    if (command === 'get_available_models' && data?.models) {
      this.updateState({ models: data.models });
    } else if (command === 'get_state' && data) {
      this.updateState({
        currentModel: data.model,
        thinkingLevel: data.thinkingLevel || this.state.thinkingLevel,
      });
    }
  }

  private send(message: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  sendCommand(command: PiCommand): void {
    this.send({ type: 'command', command });
  }

  prompt(message: string, attachments?: ImageAttachment[]): void {
    this.sendCommand({ type: 'prompt', message, attachments });
  }

  abort(): void {
    this.sendCommand({ type: 'abort' });
  }

  setModel(provider: string, modelId: string): void {
    this.sendCommand({ type: 'set_model', provider, modelId });
    // Optimistically update
    const model = this.state.models.find(m => String(m.provider) === provider && m.id === modelId);
    if (model) {
      this.updateState({ currentModel: model });
    }
  }

  setThinkingLevel(level: ThinkingLevel): void {
    this.sendCommand({ type: 'set_thinking_level', level });
    this.updateState({ thinkingLevel: level });
  }

  newSession(): void {
    this.sendCommand({ type: 'new_session' });
  }
}
