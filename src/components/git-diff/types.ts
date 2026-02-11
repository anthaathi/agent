export type GitFileStatus = 'M' | 'A' | 'D' | 'R' | 'C' | 'U' | '?' | '!';

export interface GitFile {
  path: string;
  status: GitFileStatus;
  staged: boolean;
  additions?: number;
  deletions?: number;
}

export interface GitDiff {
  oldPath: string;
  newPath: string;
  status: GitFileStatus;
  additions: number;
  deletions: number;
  diff: string;
}

export interface GitDiffPanelProps {
  isOpen?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  cwd?: string;
}
