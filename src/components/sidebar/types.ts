export type SessionStatus = 'idle' | 'loading' | 'error' | 'stalled';
export type ProjectMode = 'plain' | 'git-worktree';

export interface Session {
  sessionPath: string;  // URL-encoded path, used as identifier
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
  updatedAt: Date;
}

export interface SidebarProps {
  projects: Project[];
  activeSessionPath?: string;
  isOpen?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onSessionSelect: (projectId: string, sessionPath: string) => void;
  onNewSession: (projectId: string) => void;
  onNewProject: (name: string, path: string, mode: ProjectMode) => void;
  onRenameProject?: (projectId: string, newName: string) => void;
  onRenameSession?: (sessionPath: string, newName: string) => void;
  onDeleteProject?: (projectId: string) => void;
  onDeleteSession?: (sessionPath: string) => void;
  onLoadProjectSessions?: (projectId: string, limit: number, offset: number) => Promise<{ sessions: Session[]; total: number; hasMore: boolean }>;
  creatingSessionInProject?: string | null;
  isLoadingProjects?: boolean;
}
