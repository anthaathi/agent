export type SessionStatus = 'idle' | 'loading' | 'error' | 'stalled';
export type ProjectMode = 'plain' | 'git-worktree';

export interface Session {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
  status?: SessionStatus;
}

export interface Project {
  id: string;
  name: string;
  path?: string;
  mode: ProjectMode;
  sessions: Session[];
  createdAt: Date;
}

export interface SidebarProps {
  projects: Project[];
  activeSessionId?: string;
  isOpen?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onSessionSelect: (projectId: string, sessionId: string) => void;
  onNewSession: (projectId: string) => void;
  onNewProject: (name: string, path: string, mode: ProjectMode) => void;
  onRenameProject?: (projectId: string, newName: string) => void;
  onRenameSession?: (sessionId: string, newName: string) => void;
  onDeleteProject?: (projectId: string) => void;
  onDeleteSession?: (sessionId: string) => void;
}
