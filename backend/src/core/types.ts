export interface Project {
  id: string;
  name: string;
  path: string;
  createdAt: number;
  updatedAt: number;
}

export interface Session {
  sessionPath: string;  // Encoded path is the primary identifier
  projectId: string;
  name: string;
  status: 'idle' | 'streaming' | 'error';
  createdAt: number;
  lastActivity: number;
}

export interface PiCommand {
  id?: string;
  type: string;
  [key: string]: unknown;
}

export interface PiEvent {
  type: string;
  [key: string]: unknown;
}

export interface PiResponse {
  id?: string;
  type: 'response';
  command: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface ExtensionUIRequest {
  type: 'extension_ui_request';
  id: string;
  method: 'select' | 'confirm' | 'input' | 'editor' | 'notify' | 'setStatus' | 'setWidget' | 'setTitle' | 'set_editor_text';
  title?: string;
  message?: string;
  options?: string[];
  placeholder?: string;
  prefill?: string;
  notifyType?: 'info' | 'warning' | 'error';
  statusKey?: string;
  statusText?: string;
  widgetKey?: string;
  widgetLines?: string[];
  widgetPlacement?: 'aboveEditor' | 'belowEditor';
  text?: string;
  timeout?: number;
}

export interface ExtensionUIResponse {
  type: 'extension_ui_response';
  id: string;
  value?: string;
  confirmed?: boolean;
  cancelled?: boolean;
}

export interface ClientMessage {
  type: 'command' | 'extension_ui_response';
  command?: PiCommand;
  id?: string;
  value?: string;
  confirmed?: boolean;
  cancelled?: boolean;
}

export interface ServerMessage {
  type: 'event' | 'extension_ui_request' | 'connected' | 'error' | 'disconnected';
  event?: PiEvent;
  id?: string;
  method?: string;
  message?: string;
}

export interface PendingExtensionUI {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
  method: string;
}
