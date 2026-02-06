export interface TextContent {
  type: 'text';
  text: string;
}

export interface ThinkingContent {
  type: 'thinking';
  thinking: string;
}

export interface ImageContent {
  type: 'image';
  data: string;
  mimeType: string;
}

export interface ToolCall {
  type: 'toolCall';
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface UserMessage {
  role: 'user';
  content: string | (TextContent | ImageContent)[];
  timestamp: number;
}

export interface AssistantMessage {
  role: 'assistant';
  content: (TextContent | ThinkingContent | ToolCall)[];
  timestamp: number;
  model?: string;
  provider?: string;
}

export interface ToolResultMessage {
  role: 'toolResult';
  toolCallId: string;
  toolName: string;
  content: (TextContent | ImageContent)[];
  details?: unknown;
  isError: boolean;
  timestamp: number;
}

export type PiMessage = UserMessage | AssistantMessage | ToolResultMessage;

export interface SessionEntry {
  type: 'message' | 'session';
  id: string;
  parentId: string | null;
  timestamp: string;
  message?: {
    role: string;
    content: unknown;
  };
}

export interface PiEvent {
  type: string;
  [key: string]: unknown;
}

export interface AssistantMessageEvent {
  type: 'text_delta' | 'thinking_delta' | 'thinking_start' | 'tool_call_start' | 'tool_call_delta' | 'usage' | 'stop';
  delta?: string;
  toolCallId?: string;
  toolName?: string;
}

export interface ToolExecutionEvent {
  toolCallId: string;
  toolName: string;
  result?: {
    content: (TextContent | ImageContent)[];
    details?: unknown;
  };
  isError?: boolean;
}
