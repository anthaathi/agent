import { readdir, readFile, stat } from 'node:fs/promises';
import { join, basename, relative } from 'node:path';
import { homedir } from 'node:os';
import { logger } from '../utils/logger.js';

export interface PiSessionEntry {
  type: string;
  id: string;
  parentId: string | null;
  timestamp: string;
  message?: {
    role: string;
    content: string | unknown[];
  };
}

export interface PiSessionHeader {
  type: 'session';
  version: number;
  id: string;
  timestamp: string;
  cwd: string;
  parentSession?: string;
}

export interface PiSession {
  id: string;
  filePath: string;      // Full absolute path for file operations
  relativePath: string;  // Relative path from sessions dir for URLs
  cwd: string;
  createdAt: number;
  lastActivity: number;
  messageCount: number;
  firstMessage?: string;
}

export interface PiProject {
  path: string;
  name: string;
  sessions: PiSession[];
}

const PI_SESSIONS_DIR = join(homedir(), '.pi', 'agent', 'sessions');

export function getSessionsDir(): string {
  return PI_SESSIONS_DIR;
}

export function resolveSessionPath(relativePath: string): string {
  return join(PI_SESSIONS_DIR, relativePath);
}

export class PiSessionScanner {
  private static instance: PiSessionScanner;

  static getInstance(): PiSessionScanner {
    if (!PiSessionScanner.instance) {
      PiSessionScanner.instance = new PiSessionScanner();
    }
    return PiSessionScanner.instance;
  }

  async scanSessions(): Promise<PiProject[]> {
    const projects = new Map<string, PiProject>();

    try {
      // List all project directories in ~/.pi/agent/sessions
      const entries = await readdir(PI_SESSIONS_DIR, { withFileTypes: true });
      const projectDirs = entries.filter(e => e.isDirectory());

      for (const dir of projectDirs) {
        const projectPath = join(PI_SESSIONS_DIR, dir.name);
        const sessions = await this.scanProjectSessions(projectPath, dir.name);

        if (sessions.length > 0) {
          // Get the real path from the first session's cwd
          const realPath = sessions[0].cwd;
          
          // Create project name from path segments
          const pathParts = realPath.split('/').filter(Boolean);
          
          // Skip generic prefix directories
          const skipPrefixes = ['home', 'Users', 'user', 'dev', 'workspace'];
          let startIndex = 0;
          for (let i = 0; i < pathParts.length - 1; i++) {
            if (skipPrefixes.includes(pathParts[i].toLowerCase())) {
              startIndex = i + 1;
            } else {
              break;
            }
          }
          
          // Get meaningful parts (skip generic prefixes, keep last 2 meaningful)
          const meaningfulParts = pathParts.slice(startIndex);
          
          // Always show last 2 meaningful parts (or 1 if only 1 exists)
          let projectName: string;
          if (meaningfulParts.length >= 2) {
            projectName = meaningfulParts.slice(-2).join('/');
          } else {
            projectName = meaningfulParts[meaningfulParts.length - 1] || realPath;
          }

          projects.set(realPath, {
            path: realPath,
            name: projectName,
            sessions,
          });
        }
      }
    } catch (err) {
      logger.error('Failed to scan pi sessions', { error: (err as Error).message });
    }

    return Array.from(projects.values());
  }

  private async scanProjectSessions(projectDir: string, _dirName: string): Promise<PiSession[]> {
    const sessions: PiSession[] = [];

    try {
      const files = await readdir(projectDir);
      const sessionFiles = files.filter(f => f.endsWith('.jsonl'));

      for (const file of sessionFiles) {
        const filePath = join(projectDir, file);
        const session = await this.parseSessionFile(filePath);
        if (session) {
          sessions.push(session);
        }
      }

      sessions.sort((a, b) => b.lastActivity - a.lastActivity);
    } catch (err) {
      logger.warn(`Failed to scan project dir ${projectDir}`, { error: (err as Error).message });
    }

    return sessions;
  }

  private async parseSessionFile(filePath: string): Promise<PiSession | null> {
    try {
      const stats = await stat(filePath);
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n').filter(Boolean);

      if (lines.length === 0) return null;

      // Parse header (first line)
      const header = JSON.parse(lines[0]) as PiSessionHeader;
      if (header.type !== 'session') return null;

      // Count messages and find first user message
      let messageCount = 0;
      let firstMessage: string | undefined;

      for (let i = 1; i < lines.length; i++) {
        try {
          const entry = JSON.parse(lines[i]) as PiSessionEntry;
          if (entry.type === 'message' && entry.message) {
            messageCount++;
            if (!firstMessage && entry.message.role === 'user') {
              const content = entry.message.content;
              let rawText = '';
              
              if (typeof content === 'string') {
                rawText = content;
              } else if (Array.isArray(content)) {
                // Extract text from content array
                const textParts: string[] = [];
                for (const c of content) {
                  if (c && typeof c === 'object' && 'type' in c && c.type === 'text' && 'text' in c) {
                    const text = (c as { text?: string }).text;
                    if (text) textParts.push(text);
                  }
                }
                rawText = textParts.join(' ') || 'Attachment';
              }
              
              // Clean up the message - take first line, remove markdown, truncate
              firstMessage = rawText
                .split('\n')[0] // First line only
                .replace(/[#*`]/g, '') // Remove markdown chars
                .trim();
              
              if (firstMessage.length > 60) {
                firstMessage = firstMessage.slice(0, 57) + '...';
              }
              
              // If still empty or just whitespace, use a default
              if (!firstMessage || firstMessage.length < 3) {
                firstMessage = 'New chat';
              }
            }
          }
        } catch {
          // Skip malformed lines
        }
      }

      const fileName = basename(filePath, '.jsonl');
      const sessionId = fileName.split('_')[1] || fileName;
      const relativePath = relative(PI_SESSIONS_DIR, filePath);

      const createdAt = header.timestamp ? new Date(header.timestamp).getTime() : stats.birthtimeMs;

      return {
        id: sessionId,
        filePath,
        relativePath,
        cwd: header.cwd,
        createdAt,
        lastActivity: stats.mtimeMs,
        messageCount,
        firstMessage,
      };
    } catch (err) {
      logger.warn(`Failed to parse session file ${filePath}`, { error: (err as Error).message });
      return null;
    }
  }

  async getSessionMessages(filePath: string): Promise<PiSessionEntry[]> {
    try {
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      
      return lines.map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      }).filter(Boolean) as PiSessionEntry[];
    } catch (err) {
      logger.error(`Failed to read session messages from ${filePath}`, { error: (err as Error).message });
      return [];
    }
  }
}
