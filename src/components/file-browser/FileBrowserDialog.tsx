import { useState, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronUp,
  Home,
  Check,
  GitBranch,
  ArrowLeft,
  Loader2,
} from 'lucide-react';
import { api } from '@/lib/api/client';
import type { FileEntry, GitInfo } from '@/lib/api/client';
import { cn } from '@/lib/utils';

interface FileBrowserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (path: string, mode: 'plain' | 'git-worktree') => void;
  initialPath?: string;
}

async function fetchDirectory(path: string): Promise<FileEntry[]> {
  const entries = await api.listDirectory(path);
  return entries.filter((e) => e.type === 'directory');
}

async function detectGit(path: string): Promise<GitInfo> {
  return await api.getGitInfo(path);
}

async function fetchHomeDirectory(): Promise<string> {
  const response = await fetch('/api/fs/home');
  if (!response.ok) {
    throw new Error('Failed to fetch home directory');
  }
  const data = await response.json();
  return typeof data.path === 'string' ? data.path : '/';
}

export function FileBrowserDialog({
  open,
  onOpenChange,
  onSelect,
  initialPath = '/',
}: FileBrowserDialogProps) {
  const [homePath, setHomePath] = useState(initialPath);
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [step, setStep] = useState<'browse' | 'confirm'>('browse');
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null);
  const [detectingGit, setDetectingGit] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadHomeDirectory = async () => {
      try {
        const path = await fetchHomeDirectory();
        if (cancelled) return;
        setHomePath(path);
        setCurrentPath((prev) => (prev === initialPath || prev === '/' ? path : prev));
      } catch (error) {
        console.error('Failed to get home directory:', error);
      }
    };

    loadHomeDirectory();

    return () => {
      cancelled = true;
    };
  }, [initialPath]);

  const loadDirectory = useCallback(async (path: string) => {
    setLoading(true);
    try {
      const data = await fetchDirectory(path);
      setEntries(data.filter((e) => e.type === 'directory'));
    } catch (error) {
      console.error('Failed to load directory:', error);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && step === 'browse') {
      loadDirectory(currentPath);
    }
  }, [open, currentPath, step, loadDirectory]);

  const navigateUp = useCallback(() => {
    const parent = currentPath.split('/').slice(0, -1).join('/') || '/';
    setCurrentPath(parent);
    setSelectedPath(null);
  }, [currentPath]);

  const navigateTo = useCallback((entry: FileEntry) => {
    if (entry.type === 'directory') {
      setCurrentPath(entry.path);
      setSelectedPath(null);
    }
  }, []);

  const handleSelectFolder = useCallback(async () => {
    const path = selectedPath || currentPath;
    setDetectingGit(true);
    try {
      const info = await detectGit(path);
      setGitInfo(info);
      setStep('confirm');
    } finally {
      setDetectingGit(false);
    }
  }, [selectedPath, currentPath]);

  const handleModeSelect = useCallback(
    (mode: 'plain' | 'git-worktree') => {
      onSelect(selectedPath || currentPath, mode);
      onOpenChange(false);
      setTimeout(() => {
        setStep('browse');
        setSelectedPath(null);
        setGitInfo(null);
        setCurrentPath(homePath);
      }, 200);
    },
    [selectedPath, currentPath, onSelect, onOpenChange, homePath]
  );

  const handleBack = useCallback(() => {
    setStep('browse');
    setGitInfo(null);
  }, []);

  const handleClose = useCallback(() => {
    onOpenChange(false);
    setTimeout(() => {
      setStep('browse');
      setSelectedPath(null);
      setGitInfo(null);
      setCurrentPath(homePath);
    }, 200);
  }, [onOpenChange, homePath]);

  const pathParts = currentPath.split('/').filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md bg-black border-neutral-800 text-white p-0 gap-0">
        <DialogHeader className="p-4 border-b border-neutral-800">
          <DialogTitle className="text-white text-base">
            {step === 'browse' ? 'Select Folder' : 'Choose Working Mode'}
          </DialogTitle>
        </DialogHeader>

        {step === 'browse' ? (
          <>
            <div className="flex items-center gap-1 px-4 py-2 border-b border-neutral-800 text-sm">
              <button
                onClick={() => {
                  setCurrentPath(homePath);
                  setSelectedPath(null);
                }}
                className="p-1 hover:bg-white/10 rounded transition-colors"
              >
                <Home className="w-3.5 h-3.5 text-neutral-400" />
              </button>
              {currentPath !== '/' && (
                <>
                  <ChevronRight className="w-3 h-3 text-neutral-600" />
                  <button
                    onClick={navigateUp}
                    className="p-1 hover:bg-white/10 rounded transition-colors"
                  >
                    <ChevronUp className="w-3.5 h-3.5 text-neutral-400" />
                  </button>
                </>
              )}
              <div className="flex items-center gap-1 overflow-hidden">
                {pathParts.map((part, index) => (
                  <span key={index} className="flex items-center gap-1">
                    <ChevronRight className="w-3 h-3 text-neutral-600" />
                    <span className="text-neutral-300 truncate">{part}</span>
                  </span>
                ))}
              </div>
            </div>

            <div className="h-[300px] overflow-y-auto p-2">
              {loading ? (
                <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
                  Loading...
                </div>
              ) : entries.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-neutral-500">
                  <Folder className="w-10 h-10 mb-2 opacity-20" />
                  <span className="text-sm">No folders</span>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {entries.map((entry) => (
                    <div
                      key={entry.path}
                      onClick={() => setSelectedPath(entry.path)}
                      onDoubleClick={() => navigateTo(entry)}
                      className={cn(
                        'group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors',
                        selectedPath === entry.path
                          ? 'bg-white/10 text-white'
                          : 'text-neutral-400 hover:bg-white/5 hover:text-neutral-200'
                      )}
                    >
                      <FolderOpen className="w-4 h-4 text-neutral-500" />
                      <span className="flex-1 text-sm truncate">{entry.name}</span>
                      {selectedPath === entry.path && (
                        <Check className="w-4 h-4 text-white" />
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigateTo(entry);
                        }}
                        className="p-1 opacity-0 group-hover:opacity-100 hover:bg-white/10 rounded transition-all"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-800">
              <div className="text-xs text-neutral-500 truncate max-w-[200px]">
                {selectedPath || currentPath}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClose}
                  className="bg-transparent border-neutral-800 text-neutral-400 hover:bg-neutral-900 hover:text-white"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSelectFolder}
                  disabled={detectingGit}
                  className="bg-white text-black hover:bg-neutral-200"
                >
                  {detectingGit ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Select'
                  )}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2 px-3 py-2 bg-neutral-900 rounded-lg border border-neutral-800">
                <Folder className="w-4 h-4 text-neutral-500" />
                <span className="text-sm text-neutral-300 truncate flex-1">
                  {selectedPath || currentPath}
                </span>
                <button
                  onClick={handleBack}
                  className="p-1 hover:bg-white/10 rounded text-neutral-500 hover:text-white"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
              </div>

              {gitInfo?.isRepo && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <GitBranch className="w-4 h-4 text-green-400" />
                    <span className="text-green-400">Git repository detected</span>
                  </div>
                  <div className="text-xs text-neutral-500 pl-6 space-y-1">
                    <div>Branch: {gitInfo.branch}</div>
                    {gitInfo.remoteUrl && <div>Remote: {gitInfo.remoteUrl}</div>}
                  </div>
                </div>
              )}

              <div className="space-y-2 pt-2">
                {gitInfo?.isRepo ? (
                  <>
                    <p className="text-xs text-neutral-500 uppercase tracking-wide">
                      Choose working mode
                    </p>
                    
                    <button
                      onClick={() => handleModeSelect('plain')}
                      className="w-full flex items-center gap-3 p-3 rounded-lg border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900/50 transition-all text-left"
                    >
                      <div className="w-10 h-10 rounded-lg bg-neutral-900 flex items-center justify-center shrink-0">
                        <Folder className="w-5 h-5 text-neutral-400" />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-white">Continue</div>
                        <div className="text-xs text-neutral-500 mt-0.5">
                          Work with this folder
                        </div>
                      </div>
                    </button>

                    <button
                      onClick={() => handleModeSelect('git-worktree')}
                      className="w-full flex items-center gap-3 p-3 rounded-lg border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900/50 transition-all text-left"
                    >
                      <div className="w-10 h-10 rounded-lg bg-blue-950 flex items-center justify-center shrink-0">
                        <GitBranch className="w-5 h-5 text-blue-400" />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-white">Git Worktree</div>
                        <div className="text-xs text-neutral-500 mt-0.5">
                          Create isolated worktree for development
                        </div>
                      </div>
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleModeSelect('plain')}
                    className="w-full flex items-center justify-center gap-2 p-3 rounded-lg bg-white text-black hover:bg-neutral-200 transition-all font-medium"
                  >
                    Continue
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-800">
              <Button
                variant="outline"
                size="sm"
                onClick={handleBack}
                className="bg-transparent border-neutral-800 text-neutral-400 hover:bg-neutral-900 hover:text-white"
              >
                <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
                Back
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
