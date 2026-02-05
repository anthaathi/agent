import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FolderOpen, GitBranch } from 'lucide-react';
import { FileBrowserDialog } from '@/components/file-browser/FileBrowserDialog';

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string, path: string, mode: 'plain' | 'git-worktree') => void;
}

export function NewProjectDialog({ open, onOpenChange, onCreate }: NewProjectDialogProps) {
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [mode, setMode] = useState<'plain' | 'git-worktree'>('plain');
  const [browserOpen, setBrowserOpen] = useState(false);

  const handleBrowse = useCallback(() => {
    setBrowserOpen(true);
  }, []);

  const handlePathSelect = useCallback((selectedPath: string, selectedMode: 'plain' | 'git-worktree') => {
    setPath(selectedPath);
    setMode(selectedMode);
    // Use folder name as project name if empty
    if (!name) {
      const folderName = selectedPath.split('/').pop() || '';
      setName(folderName);
    }
  }, [name]);

  const handleCreate = useCallback(() => {
    if (name.trim()) {
      onCreate(name.trim(), path.trim(), mode);
      setName('');
      setPath('');
      setMode('plain');
      onOpenChange(false);
    }
  }, [name, path, mode, onCreate, onOpenChange]);

  const handleCancel = useCallback(() => {
    setName('');
    setPath('');
    setMode('plain');
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <>
      <Dialog open={open} onOpenChange={handleCancel}>
        <DialogContent className="sm:max-w-md bg-black border-neutral-800 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">New Project</DialogTitle>
            <DialogDescription className="text-neutral-400">
              Create a new project with a name and folder path.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Project Name */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-300">Project Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Project"
                className="w-full px-3 py-2 text-sm bg-neutral-900 border border-neutral-800 rounded-lg text-white placeholder:text-neutral-600 outline-none focus:border-neutral-600 transition-colors"
              />
            </div>

            {/* Folder Path */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-300">Folder Path</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder="/path/to/folder"
                  className="flex-1 px-3 py-2 text-sm bg-neutral-900 border border-neutral-800 rounded-lg text-white placeholder:text-neutral-600 outline-none focus:border-neutral-600 transition-colors"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBrowse}
                  className="bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800 hover:text-white"
                >
                  <FolderOpen className="w-4 h-4 mr-1.5" />
                  Browse
                </Button>
              </div>
              <p className="text-xs text-neutral-600">
                Select a folder or leave empty for a virtual project
              </p>
            </div>

            {/* Mode Indicator - only for git worktree */}
            {path && mode === 'git-worktree' && (
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-950/30 rounded-lg border border-blue-900/50">
                <GitBranch className="w-4 h-4 text-blue-400" />
                <span className="text-sm text-blue-300">Git Worktree</span>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={handleCancel}
              className="bg-transparent border-neutral-800 text-neutral-400 hover:bg-neutral-900 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!name.trim()}
              className="bg-white text-black hover:bg-neutral-200 disabled:opacity-50"
            >
              Create Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* File Browser */}
      <FileBrowserDialog
        open={browserOpen}
        onOpenChange={setBrowserOpen}
        onSelect={handlePathSelect}
      />
    </>
  );
}
