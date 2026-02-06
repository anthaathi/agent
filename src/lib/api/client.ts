import type { SessionEntry } from './pi-types';

const API_URL = ''; // Use relative URLs with Vite proxy

export interface Project {
  id: string;
  name: string;
  path: string;
  createdAt: number;
  updatedAt: number;
}

export interface Session {
  sessionPath: string;
  projectId: string;
  name: string;
  status: 'idle' | 'streaming' | 'error';
  createdAt: number;
  lastActivity: number;
}

export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory' | 'symlink';
  size: number;
  mtime: number;
}

export interface GitInfo {
  isRepo: boolean;
  branch?: string;
  remoteUrl?: string;
  worktreePath?: string;
}

export interface GitStatus {
  path: string;
  status: 'M' | 'A' | 'D' | 'R' | 'C' | 'U' | '?' | '!';
  staged: boolean;
  additions: number;
  deletions: number;
}

export interface Model {
  id: string;
  name: string;
  api: string;
  provider: string;
  baseUrl?: string;
  reasoning?: boolean;
  input?: string[];
  contextWindow?: number;
  maxTokens?: number;
  cost?: {
    input: number;
    output: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
}

class ApiClient {
  private async fetch(path: string, options?: RequestInit): Promise<Response> {
    const url = `${API_URL}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response;
  }

  // Projects
  async getProjects(): Promise<Project[]> {
    const response = await this.fetch('/api/projects');
    const data = await response.json();
    return data.projects;
  }

  async createProject(name: string, path: string): Promise<Project> {
    const response = await this.fetch('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name, path }),
    });
    const data = await response.json();
    return data.project;
  }

  async getProject(id: string): Promise<Project> {
    const response = await this.fetch(`/api/projects/${id}`);
    const data = await response.json();
    return data.project;
  }

  async updateProject(id: string, updates: Partial<Pick<Project, 'name' | 'path'>>): Promise<Project> {
    const response = await this.fetch(`/api/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    const data = await response.json();
    return data.project;
  }

  async deleteProject(id: string): Promise<void> {
    await this.fetch(`/api/projects/${id}`, { method: 'DELETE' });
  }

  async getProjectSessions(projectId: string): Promise<Session[]> {
    const response = await this.fetch(`/api/projects/${projectId}/sessions`);
    const data = await response.json();
    return data.sessions;
  }

  async loadProjectSessions(projectId: string, limit: number = 10, offset: number = 0): Promise<{ sessions: Session[]; total: number; hasMore: boolean }> {
    const response = await this.fetch(`/api/projects/${projectId}/sessions?limit=${limit}&offset=${offset}`);
    const data = await response.json();
    return data;
  }

  // Sessions
  async createSession(projectId: string, name?: string, cwd?: string): Promise<Session> {
    const response = await this.fetch('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ projectId, name, cwd }),
    });
    const data = await response.json();
    return data.session;
  }

  async getSession(sessionPath: string): Promise<Session> {
    const encodedPath = encodeURIComponent(encodeURIComponent(sessionPath));
    const response = await this.fetch(`/api/sessions/${encodedPath}`);
    const data = await response.json();
    return data.session;
  }

  async deleteSession(sessionPath: string): Promise<void> {
    const encodedPath = encodeURIComponent(encodeURIComponent(sessionPath));
    await this.fetch(`/api/sessions/${encodedPath}`, { method: 'DELETE' });
  }

  async sendCommand(sessionPath: string, command: Record<string, unknown>): Promise<void> {
    const encodedPath = encodeURIComponent(encodeURIComponent(sessionPath));
    await this.fetch(`/api/sessions/${encodedPath}/command`, {
      method: 'POST',
      body: JSON.stringify({ command }),
    });
  }

  async getSessionMessages(sessionPath: string): Promise<SessionEntry[]> {
    const encodedPath = encodeURIComponent(encodeURIComponent(sessionPath));
    const response = await this.fetch(`/api/sessions/${encodedPath}/messages`);
    const data = await response.json();
    return data.messages;
  }

  // File System
  async listDirectory(path: string): Promise<FileEntry[]> {
    const response = await this.fetch(`/api/fs/ls?path=${encodeURIComponent(path)}`);
    const data = await response.json();
    return data.entries;
  }

  async readFile(path: string): Promise<string> {
    const response = await this.fetch(`/api/fs/read?path=${encodeURIComponent(path)}`);
    const data = await response.json();
    return data.content;
  }

  async writeFile(path: string, content: string): Promise<void> {
    await this.fetch('/api/fs/write', {
      method: 'POST',
      body: JSON.stringify({ path, content }),
    });
  }

  async searchFiles(path: string, query: string): Promise<string[]> {
    const response = await this.fetch(`/api/fs/search?path=${encodeURIComponent(path)}&query=${encodeURIComponent(query)}`);
    const data = await response.json();
    return data.results;
  }

  async getGitInfo(path: string): Promise<GitInfo> {
    const response = await this.fetch(`/api/fs/git-info?path=${encodeURIComponent(path)}`);
    const data = await response.json();
    return data.gitInfo;
  }

  // Git
  async getGitStatus(cwd: string): Promise<GitStatus[]> {
    const response = await this.fetch(`/api/git/status?cwd=${encodeURIComponent(cwd)}`);
    const data = await response.json();
    return data.files;
  }

  async getGitDiff(cwd: string, path: string, staged?: boolean): Promise<string> {
    const response = await this.fetch(`/api/git/diff?cwd=${encodeURIComponent(cwd)}&path=${encodeURIComponent(path)}&staged=${staged}`);
    const data = await response.json();
    return data.diff;
  }

  async stageFile(cwd: string, path: string): Promise<void> {
    await this.fetch('/api/git/stage', {
      method: 'POST',
      body: JSON.stringify({ cwd, path }),
    });
  }

  async unstageFile(cwd: string, path: string): Promise<void> {
    await this.fetch('/api/git/unstage', {
      method: 'POST',
      body: JSON.stringify({ cwd, path }),
    });
  }

  async commit(cwd: string, message: string): Promise<void> {
    await this.fetch('/api/git/commit', {
      method: 'POST',
      body: JSON.stringify({ cwd, message }),
    });
  }

  // Models
  async getModels(): Promise<Model[]> {
    const response = await this.fetch('/api/models');
    const data = await response.json();
    return data.models;
  }

  // WebSocket
  connectWebSocket(sessionId: string): WebSocket {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    return new WebSocket(`${wsUrl}/ws/session/${sessionId}`);
  }
}

export const api = new ApiClient();
