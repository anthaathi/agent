import type { AgentSession } from '@mariozechner/pi-coding-agent';
import type { WebSocket } from 'ws';
import type { PendingExtensionUI } from '../core/types.js';

export interface PiProcess {
  sessionPath: string; // Encoded path as identifier
  session: AgentSession;
  pendingExtensionUIs: Map<string, PendingExtensionUI>;
  isReady: boolean;
  unsubscribe: () => void;
}

export interface WebSocketConnection {
  sessionPath: string; // Encoded path as identifier
  socket: WebSocket;
  isAlive: boolean;
  messageQueue: string[];
  isPaused: boolean;
}

export interface ProcessSpawnOptions {
  sessionPath: string; // Encoded path
  projectPath: string;
  sessionDir: string;
  piCliPath?: string;
}

export interface ProcessMetrics {
  sessionPath: string;
  memoryUsage: number;
  cpuUsage: number;
  uptime: number;
}
