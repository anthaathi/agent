import { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/theme/useTheme';
import {
  PanelRight,
  FileCode,
  RefreshCw,
  GitBranch,
  ChevronDown,
  ChevronRight,
  Check,
  Maximize2,
  Minimize2,
  Columns,
  ChevronLeft,
  List,
  X,
} from 'lucide-react';
import { Dialog, DialogFullscreenContent, DialogTitle } from '@/components/ui/dialog';
import type { GitDiffPanelProps, GitFile, GitDiff, GitFileStatus } from './types';
import 'diff2html/bundles/css/diff2html.min.css';

// Color scheme values from diff2html
const ColorSchemeValues = {
  AUTO: 'auto',
  DARK: 'dark',
  LIGHT: 'light',
} as const;

const statusConfig: Record<GitFileStatus, { label: string; color: string; lightColor: string }> = {
  M: { label: 'Modified', color: 'text-amber-400', lightColor: 'text-amber-600' },
  A: { label: 'Added', color: 'text-green-400', lightColor: 'text-green-600' },
  D: { label: 'Deleted', color: 'text-red-400', lightColor: 'text-red-600' },
  R: { label: 'Renamed', color: 'text-blue-400', lightColor: 'text-blue-600' },
  C: { label: 'Copied', color: 'text-purple-400', lightColor: 'text-purple-600' },
  U: { label: 'Updated', color: 'text-cyan-400', lightColor: 'text-cyan-600' },
  '?': { label: 'Untracked', color: 'text-neutral-400', lightColor: 'text-neutral-500' },
  '!': { label: 'Ignored', color: 'text-neutral-600', lightColor: 'text-neutral-400' },
};

function FileItem({
  file,
  isSelected,
  onClick,
  onToggleStage,
  isStaged,
}: {
  file: GitFile;
  isSelected: boolean;
  onClick: () => void;
  onToggleStage: (e: React.MouseEvent) => void;
  isStaged: boolean;
}) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const config = statusConfig[file.status];
  const fileName = file.path.split('/').pop() || file.path;
  const dirPath = file.path.split('/').slice(0, -1).join('/');

  return (
    <div
      className={cn(
        'group flex items-center gap-1.5 px-2 py-1 cursor-pointer transition-colors',
        isSelected 
          ? isDark ? 'bg-white/10' : 'bg-black/10'
          : isDark ? 'hover:bg-white/5' : 'hover:bg-black/5'
      )}
      onClick={onClick}
    >
      <button
        onClick={onToggleStage}
        className={cn(
          'w-4 h-4 rounded border flex items-center justify-center transition-colors',
          isStaged
            ? 'bg-black border-black text-white dark:bg-white dark:border-white dark:text-black'
            : isDark 
              ? 'border-neutral-600 hover:border-neutral-400' 
              : 'border-neutral-400 hover:border-neutral-600'
        )}
      >
        {isStaged && <Check className="w-3 h-3" />}
      </button>

      <span className={cn('text-xs', isDark ? config.color : config.lightColor)}>
        {file.status}
      </span>

      <div className="flex-1 min-w-0 flex items-center gap-1">
        <span className={cn(
          'text-[13px] truncate',
          isDark ? 'text-neutral-200' : 'text-neutral-800'
        )}>{fileName}</span>
        {dirPath && (
          <span className={cn(
            'text-[11px] truncate',
            isDark ? 'text-neutral-600' : 'text-neutral-400'
          )}>{dirPath}</span>
        )}
      </div>

      {(file.additions !== undefined || file.deletions !== undefined) && (
        <div className="flex items-center gap-1 text-[10px]">
          {file.additions && file.additions > 0 && (
            <span className="text-green-500 dark:text-green-400">+{file.additions}</span>
          )}
          {file.deletions && file.deletions > 0 && (
            <span className="text-red-500 dark:text-red-400">-{file.deletions}</span>
          )}
        </div>
      )}
    </div>
  );
}

function DiffContent({ 
  diff, 
  viewMode,
  isDark,
}: { 
  diff: GitDiff;
  viewMode: 'side-by-side' | 'line-by-line';
  isDark: boolean;
}) {
  const [html, setHtml] = useState('');

  useEffect(() => {
    import('diff2html').then((mod) => {
      const output = mod.html(diff.diff, {
        drawFileList: false,
        matching: 'lines',
        outputFormat: viewMode,
        colorScheme: (isDark ? ColorSchemeValues.DARK : ColorSchemeValues.LIGHT) as any,
      });
      setHtml(output);
    });
  }, [diff, viewMode, isDark]);

  return (
    <div className="flex-1 overflow-auto">
      <style>{`
        .diff2html *, .d2h-wrapper *, .d2h-file-wrapper * {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
          font-size: 12px !important;
          line-height: 1.5 !important;
        }
        .d2h-file-name {
          font-family: ui-sans-serif, system-ui, -apple-system, sans-serif !important;
          font-size: 13px !important;
        }
      `}</style>
      
      <div 
        className="diff2html"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

function DiffHeader({
  diff,
  isDark,
  onBack,
  onToggleViewMode,
  onToggleFullscreen,
  isFullscreen,
  viewMode,
  files,
  currentFileIndex,
  onPrevFile,
  onNextFile,
  onSelectFile,
  showFileList,
  setShowFileList,
}: {
  diff: GitDiff;
  isDark: boolean;
  onBack: () => void;
  onToggleViewMode: () => void;
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
  viewMode: string;
  files: GitFile[];
  currentFileIndex: number;
  onPrevFile: () => void;
  onNextFile: () => void;
  onSelectFile: (index: number) => void;
  showFileList: boolean;
  setShowFileList: (show: boolean) => void;
}) {
  const fileListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (fileListRef.current && !fileListRef.current.contains(e.target as Node)) {
        setShowFileList(false);
      }
    };
    if (showFileList) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFileList, setShowFileList]);

  return (
    <div className={cn(
      "flex items-center justify-between px-3 py-2 border-b flex-shrink-0",
      isDark ? 'border-white/5 bg-[#0d0d0d]' : 'border-neutral-200 bg-white'
    )}>
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          className={cn(
            "flex items-center gap-1 text-[12px] transition-colors",
            isDark ? 'text-neutral-400 hover:text-white' : 'text-neutral-600 hover:text-black'
          )}
        >
          <ChevronRight className="w-3.5 h-3.5 -rotate-180" />
          Back
        </button>
        <span className={isDark ? 'text-neutral-600' : 'text-neutral-300'}>|</span>
        <FileCode className={cn("w-3.5 h-3.5", isDark ? 'text-neutral-500' : 'text-neutral-400')} />
        <span className={cn(
          "text-[13px] truncate max-w-[300px]",
          isDark ? 'text-neutral-200' : 'text-neutral-800'
        )}>{diff.newPath}</span>
      </div>
      
      <div className="flex items-center gap-1">
        {/* Navigation controls - only in fullscreen */}
        {isFullscreen && files.length > 1 && (
          <>
            <span className={cn("text-[11px] px-2", isDark ? 'text-neutral-500' : 'text-neutral-400')}>
              {currentFileIndex + 1} / {files.length}
            </span>
            <button
              onClick={onPrevFile}
              disabled={currentFileIndex === 0}
              className={cn(
                "p-1.5 rounded transition-colors disabled:opacity-30",
                isDark 
                  ? 'hover:bg-white/5 text-neutral-400 hover:text-white' 
                  : 'hover:bg-black/5 text-neutral-600 hover:text-black'
              )}
              title="Previous file"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onNextFile}
              disabled={currentFileIndex === files.length - 1}
              className={cn(
                "p-1.5 rounded transition-colors disabled:opacity-30",
                isDark 
                  ? 'hover:bg-white/5 text-neutral-400 hover:text-white' 
                  : 'hover:bg-black/5 text-neutral-600 hover:text-black'
              )}
              title="Next file"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            
            {/* File list dropdown */}
            <div className="relative" ref={fileListRef}>
              <button
                onClick={() => setShowFileList(!showFileList)}
                className={cn(
                  "p-1.5 rounded transition-colors",
                  isDark 
                    ? 'hover:bg-white/5 text-neutral-500 hover:text-white' 
                    : 'hover:bg-black/5 text-neutral-600 hover:text-black',
                  showFileList && (isDark ? 'bg-white/10' : 'bg-black/10')
                )}
                title="File list"
              >
                <List className="w-3.5 h-3.5" />
              </button>
              
              {showFileList && (
                <div className={cn(
                  "absolute right-0 top-full mt-1 w-64 max-h-80 overflow-y-auto rounded-lg border shadow-lg z-50",
                  isDark ? 'bg-[#1a1a1a] border-white/10' : 'bg-white border-neutral-200'
                )}>
                  <div className={cn(
                    "px-3 py-2 text-[11px] font-medium border-b",
                    isDark ? 'text-neutral-400 border-white/5' : 'text-neutral-600 border-neutral-100'
                  )}>
                    Changed Files ({files.length})
                  </div>
                  {files.map((file, index) => {
                    const config = statusConfig[file.status];
                    const fileName = file.path.split('/').pop() || file.path;
                    return (
                      <button
                        key={file.path}
                        onClick={() => {
                          onSelectFile(index);
                          setShowFileList(false);
                        }}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] transition-colors",
                          index === currentFileIndex 
                            ? (isDark ? 'bg-white/10' : 'bg-black/5')
                            : (isDark ? 'hover:bg-white/5' : 'hover:bg-black/5')
                        )}
                      >
                        <span className={cn("text-xs", isDark ? config.color : config.lightColor)}>
                          {file.status}
                        </span>
                        <span className={cn(
                          "flex-1 truncate",
                          isDark ? 'text-neutral-200' : 'text-neutral-800'
                        )}>
                          {fileName}
                        </span>
                        {index === currentFileIndex && (
                          <div className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            isDark ? 'bg-white' : 'bg-black'
                          )} />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            
            <div className={cn("w-px h-4 mx-1", isDark ? 'bg-white/10' : 'bg-neutral-200')} />
          </>
        )}
        
        <button
          onClick={onToggleViewMode}
          className={cn(
            "p-1.5 rounded transition-colors",
            isDark 
              ? 'hover:bg-white/5 text-neutral-500 hover:text-white' 
              : 'hover:bg-black/5 text-neutral-600 hover:text-black'
          )}
          title={viewMode === 'side-by-side' ? 'Inline view' : 'Split view'}
        >
          <Columns className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onToggleFullscreen}
          className={cn(
            "p-1.5 rounded transition-colors",
            isDark 
              ? 'hover:bg-white/5 text-neutral-500 hover:text-white' 
              : 'hover:bg-black/5 text-neutral-600 hover:text-black'
          )}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

function DiffViewer({ 
  diff, 
  onBack,
  isFullscreen,
  onToggleFullscreen,
  viewMode,
  onToggleViewMode,
  files,
  currentFileIndex,
  onPrevFile,
  onNextFile,
  onSelectFile,
}: { 
  diff: GitDiff; 
  onBack: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  viewMode: 'side-by-side' | 'line-by-line';
  onToggleViewMode: () => void;
  files: GitFile[];
  currentFileIndex: number;
  onPrevFile: () => void;
  onNextFile: () => void;
  onSelectFile: (index: number) => void;
}) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [showFileList, setShowFileList] = useState(false);

  // Fullscreen Dialog
  if (isFullscreen) {
    return (
      <Dialog open={isFullscreen} onOpenChange={(open) => !open && onToggleFullscreen()}>
        <DialogFullscreenContent 
          className={isDark ? 'bg-[#0d0d0d]' : 'bg-white'}
        >
          <DialogTitle className="sr-only">Diff View - {diff.newPath}</DialogTitle>
          <div className="flex flex-col h-screen w-screen">
            <DiffHeader
              diff={diff}
              isDark={isDark}
              onBack={onBack}
              onToggleViewMode={onToggleViewMode}
              onToggleFullscreen={onToggleFullscreen}
              isFullscreen={isFullscreen}
              viewMode={viewMode}
              files={files}
              currentFileIndex={currentFileIndex}
              onPrevFile={onPrevFile}
              onNextFile={onNextFile}
              onSelectFile={onSelectFile}
              showFileList={showFileList}
              setShowFileList={setShowFileList}
            />
            <DiffContent diff={diff} viewMode={viewMode} isDark={isDark} />
          </div>
        </DialogFullscreenContent>
      </Dialog>
    );
  }

  // Normal inline view
  return (
    <div className={cn(
      "flex flex-col h-full",
      isDark ? 'bg-[#0d0d0d]' : 'bg-white'
    )}>
      <DiffHeader
        diff={diff}
        isDark={isDark}
        onBack={onBack}
        onToggleViewMode={onToggleViewMode}
        onToggleFullscreen={onToggleFullscreen}
        isFullscreen={isFullscreen}
        viewMode={viewMode}
        files={files}
        currentFileIndex={currentFileIndex}
        onPrevFile={onPrevFile}
        onNextFile={onNextFile}
        onSelectFile={onSelectFile}
        showFileList={showFileList}
        setShowFileList={setShowFileList}
      />
      <DiffContent diff={diff} viewMode={viewMode} isDark={isDark} />
    </div>
  );
}

export function GitDiffPanel({
  isOpen = true,
  onClose,
  collapsed = false,
  onToggleCollapse,
}: GitDiffPanelProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [files, setFiles] = useState<GitFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diff, setDiff] = useState<GitDiff | null>(null);
  const [loading, setLoading] = useState(false);
  const [branch] = useState('main');
  const [commitMessage, setCommitMessage] = useState('');
  const [expandedSections, setExpandedSections] = useState({
    changes: true,
    staged: true,
  });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState<'side-by-side' | 'line-by-line'>('line-by-line');
  const [width, setWidth] = useState(300);
  const [isResizing, setIsResizing] = useState(false);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const toggleSection = (section: 'changes' | 'staged') => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = window.innerWidth - e.clientX;
      setWidth(Math.max(200, Math.min(800, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const fetchGitStatus = useCallback(async () => {
    setLoading(true);
    setFiles([
      { path: 'src/components/sidebar/index.tsx', status: 'M', staged: true, additions: 45, deletions: 12 },
      { path: 'package.json', status: 'M', staged: true, additions: 2, deletions: 1 },
      { path: 'src/components/git-diff/index.tsx', status: 'A', staged: true, additions: 320, deletions: 0 },
      { path: 'src/App.tsx', status: 'M', staged: false, additions: 23, deletions: 8 },
      { path: '.env.local', status: '?', staged: false },
    ]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchGitStatus();
  }, [fetchGitStatus]);

  useEffect(() => {
    if (selectedFile) {
      const index = files.findIndex(f => f.path === selectedFile);
      setCurrentFileIndex(index >= 0 ? index : 0);
      setDiff({
        oldPath: selectedFile,
        newPath: selectedFile,
        status: 'M',
        additions: 45,
        deletions: 12,
        diff: `diff --git a/${selectedFile} b/${selectedFile}
index 1234567..abcdefg 100644
--- a/${selectedFile}
+++ b/${selectedFile}
@@ -10,7 +10,7 @@ import { useState } from 'react';
 export function Component() {
   const [count, setCount] = useState(0);
   
-  return <div>{count}</div>;
+  return <div className="p-4">{count}</div>;
 }
 `,
      });
    } else {
      setDiff(null);
    }
  }, [selectedFile, files]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose && !isFullscreen) {
        onClose();
      }
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose, isFullscreen]);

  const toggleStage = (e: React.MouseEvent, filePath: string) => {
    e.stopPropagation();
    setFiles(prev =>
      prev.map(f =>
        f.path === filePath ? { ...f, staged: !f.staged } : f
      )
    );
  };

  const stageAll = () => {
    setFiles(prev => prev.map(f => ({ ...f, staged: true })));
  };

  const unstageAll = () => {
    setFiles(prev => prev.map(f => ({ ...f, staged: false })));
  };

  const handleCommit = () => {
    if (!commitMessage.trim()) return;
    console.log('Committing with message:', commitMessage);
    setCommitMessage('');
    fetchGitStatus();
  };

  // Navigation functions
  const handlePrevFile = () => {
    if (currentFileIndex > 0) {
      const newIndex = currentFileIndex - 1;
      setCurrentFileIndex(newIndex);
      setSelectedFile(files[newIndex].path);
    }
  };

  const handleNextFile = () => {
    if (currentFileIndex < files.length - 1) {
      const newIndex = currentFileIndex + 1;
      setCurrentFileIndex(newIndex);
      setSelectedFile(files[newIndex].path);
    }
  };

  const handleSelectFile = (index: number) => {
    setCurrentFileIndex(index);
    setSelectedFile(files[index].path);
  };

  const stagedFiles = files.filter(f => f.staged);
  const unstagedFiles = files.filter(f => !f.staged);
  const totalAdditions = stagedFiles.reduce((acc, f) => acc + (f.additions || 0), 0);
  const totalDeletions = stagedFiles.reduce((acc, f) => acc + (f.deletions || 0), 0);

  return (
    <>
      {/* Mobile Overlay */}
      <div
        className={cn(
          'fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden',
          'transition-all duration-300 ease-out',
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
      />

      {/* Resizer Handle */}
      {!collapsed && (
        <div
          className={cn(
            "fixed right-[300px] top-0 bottom-0 w-1 cursor-col-resize z-[55] transition-colors hidden md:block",
            isDark ? "hover:bg-white/10" : "hover:bg-black/10"
          )}
          onMouseDown={handleMouseDown}
          style={{ right: width }}
        />
      )}

      {/* Desktop Panel / Mobile Bottom Sheet */}
      <div
        ref={panelRef}
        className={cn(
          // Desktop: right sidebar
          'md:static md:inset-y-0 md:right-0 md:h-full md:border-l md:flex-col md:translate-x-0 md:overflow-hidden',
          // Mobile: bottom sheet
          'fixed inset-x-0 bottom-0 rounded-t-xl md:rounded-none shadow-2xl md:shadow-none flex flex-col z-50 h-auto max-h-[80vh] md:max-h-none',
          isDark 
            ? 'bg-[#0a0a0a] border-white/5 md:bg-[#0a0a0a]' 
            : 'bg-neutral-50 border-neutral-200 md:bg-neutral-50',
          // Mobile animation classes
          isOpen ? 'translate-y-0' : 'translate-y-full',
          // Desktop animation classes  
          'md:transition-[width] md:duration-200',
          collapsed ? 'md:w-[40px]' : 'w-full md:w-auto'
        )}
        style={{ 
          '--panel-width': collapsed ? undefined : `${width}px`,
          transition: collapsed || isResizing 
            ? undefined 
            : 'transform 400ms cubic-bezier(0.16, 1, 0.3, 1)'
        } as React.CSSProperties}
      >
        {/* Mobile Handle Bar */}
        <div 
          className="md:hidden w-full flex justify-center pt-2 pb-1 cursor-pointer group"
          onClick={onClose}
        >
          <div className={cn(
            "w-10 h-1 rounded-full transition-transform duration-300",
            "group-active:scale-90",
            isDark ? 'bg-white/20' : 'bg-neutral-300'
          )} />
        </div>
        {/* Header */}
        <div className={cn(
          'border-b flex-shrink-0',
          isDark ? 'border-white/5' : 'border-neutral-200',
          collapsed ? 'p-1' : 'py-2 px-3'
        )}>
          <div className="flex items-center justify-between">
            {!collapsed && (
              <div className="flex items-center gap-2">
                <GitBranch className={cn("w-4 h-4", isDark ? 'text-neutral-500' : 'text-neutral-400')} />
                <span className={cn(
                  "text-sm font-medium",
                  isDark ? 'text-white' : 'text-neutral-900'
                )}>{branch}</span>
                {stagedFiles.length > 0 && (
                  <span className="text-[11px] text-neutral-500">
                    <span className="text-green-500 dark:text-green-400">+{totalAdditions}</span>
                    <span className="mx-1 text-neutral-300 dark:text-neutral-700">/</span>
                    <span className="text-red-500 dark:text-red-400">-{totalDeletions}</span>
                  </span>
                )}
              </div>
            )}

            <div className="flex items-center gap-0.5">
              {!collapsed && (
                <>
                  <button
                    onClick={fetchGitStatus}
                    className={cn(
                      'p-1.5 rounded transition-colors',
                      isDark
                        ? 'hover:bg-white/5 text-neutral-500 hover:text-white'
                        : 'hover:bg-black/5 text-neutral-600 hover:text-black',
                      loading && 'animate-spin'
                    )}
                    title="Refresh"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={onClose}
                    className={cn(
                      'p-1.5 rounded transition-colors hidden md:block',
                      isDark
                        ? 'hover:bg-white/5 text-neutral-500 hover:text-white'
                        : 'hover:bg-black/5 text-neutral-600 hover:text-black'
                    )}
                    title="Close"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden min-h-0">
          {collapsed ? (
            <div className="flex flex-col items-center py-2 px-1 gap-1">
              {files.slice(0, 6).map((file, i) => (
                <button
                  key={i}
                  className={cn(
                    'w-6 h-6 flex items-center justify-center rounded transition-colors',
                    isDark ? statusConfig[file.status].color : statusConfig[file.status].lightColor,
                    isDark ? 'hover:bg-white/5' : 'hover:bg-black/5'
                  )}
                  title={`${file.path} (${file.status})`}
                >
                  <FileCode className="w-3.5 h-3.5" />
                </button>
              ))}
            </div>
          ) : selectedFile && diff ? (
            <DiffViewer 
              diff={diff} 
              onBack={() => setSelectedFile(null)}
              isFullscreen={isFullscreen}
              onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
              viewMode={viewMode}
              onToggleViewMode={() => setViewMode(viewMode === 'side-by-side' ? 'line-by-line' : 'side-by-side')}
              files={files}
              currentFileIndex={currentFileIndex}
              onPrevFile={handlePrevFile}
              onNextFile={handleNextFile}
              onSelectFile={handleSelectFile}
            />
          ) : (
            <div className="h-full overflow-y-auto overscroll-contain pb-4">
              {files.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-center px-4">
                  <GitBranch className={cn("w-6 h-6 mb-2", isDark ? 'text-neutral-700' : 'text-neutral-300')} />
                  <p className={cn("text-xs", isDark ? 'text-neutral-500' : 'text-neutral-400')}>No changes</p>
                </div>
              ) : (
                <div className="py-1">
                  {/* Staged Section - ON TOP */}
                  {stagedFiles.length > 0 && (
                    <div className="mb-1">
                      <button
                        onClick={() => toggleSection('staged')}
                        className={cn(
                          "w-full flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium transition-colors",
                          isDark 
                            ? 'text-neutral-400 hover:text-neutral-300 hover:bg-white/5' 
                            : 'text-neutral-600 hover:text-neutral-800 hover:bg-black/5'
                        )}
                      >
                        {expandedSections.staged ? (
                          <ChevronDown className="w-3 h-3" />
                        ) : (
                          <ChevronRight className="w-3 h-3" />
                        )}
                        <span>STAGED</span>
                        <span className={cn("ml-1", isDark ? 'text-neutral-600' : 'text-neutral-400')}>({stagedFiles.length})</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            unstageAll();
                          }}
                          className={cn(
                            "ml-auto text-[10px] px-1.5 py-0.5 rounded",
                            isDark 
                              ? 'text-neutral-500 hover:text-white hover:bg-white/5' 
                              : 'text-neutral-500 hover:text-black hover:bg-black/5'
                          )}
                        >
                          - All
                        </button>
                      </button>
                      {expandedSections.staged && (
                        <div>
                          {stagedFiles.map((file) => (
                            <FileItem
                              key={file.path}
                              file={file}
                              isSelected={selectedFile === file.path}
                              onClick={() => setSelectedFile(file.path)}
                              onToggleStage={(e) => toggleStage(e, file.path)}
                              isStaged={true}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Changes Section */}
                  {unstagedFiles.length > 0 && (
                    <div>
                      <button
                        onClick={() => toggleSection('changes')}
                        className={cn(
                          "w-full flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium transition-colors",
                          isDark 
                            ? 'text-neutral-400 hover:text-neutral-300 hover:bg-white/5' 
                            : 'text-neutral-600 hover:text-neutral-800 hover:bg-black/5'
                        )}
                      >
                        {expandedSections.changes ? (
                          <ChevronDown className="w-3 h-3" />
                        ) : (
                          <ChevronRight className="w-3 h-3" />
                        )}
                        <span>CHANGES</span>
                        <span className={cn("ml-1", isDark ? 'text-neutral-600' : 'text-neutral-400')}>({unstagedFiles.length})</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            stageAll();
                          }}
                          className={cn(
                            "ml-auto text-[10px] px-1.5 py-0.5 rounded",
                            isDark 
                              ? 'text-neutral-500 hover:text-white hover:bg-white/5' 
                              : 'text-neutral-500 hover:text-black hover:bg-black/5'
                          )}
                        >
                          + All
                        </button>
                      </button>
                      {expandedSections.changes && (
                        <div>
                          {unstagedFiles.map((file) => (
                            <FileItem
                              key={file.path}
                              file={file}
                              isSelected={selectedFile === file.path}
                              onClick={() => setSelectedFile(file.path)}
                              onToggleStage={(e) => toggleStage(e, file.path)}
                              isStaged={false}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer - Commit Box */}
        {!collapsed && !selectedFile && stagedFiles.length > 0 && (
          <div className={cn(
            "border-t p-3 flex-shrink-0 md:pb-3",
            isDark ? 'border-white/5' : 'border-neutral-200'
          )}>
            <textarea
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Message (⌘Enter to commit)"
              className={cn(
                "w-full h-16 px-2.5 py-2 text-[12px] border rounded-md outline-none focus:border-neutral-400 transition-colors resize-none",
                isDark 
                  ? 'bg-white/5 border-white/5 text-white placeholder:text-neutral-600' 
                  : 'bg-white border-neutral-200 text-neutral-900 placeholder:text-neutral-400'
              )}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  handleCommit();
                }
              }}
            />
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-2 text-[10px] text-neutral-500">
                <span className="text-green-500 dark:text-green-400">+{totalAdditions}</span>
                <span className="text-red-500 dark:text-red-400">-{totalDeletions}</span>
              </div>
              <button
                onClick={handleCommit}
                disabled={!commitMessage.trim()}
                className="px-3 py-1.5 text-[11px] font-medium bg-black text-white dark:bg-white dark:text-black rounded-md hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Commit
              </button>
            </div>
          </div>
        )}

        {/* Collapse Button */}
        <div className={cn(
          "border-t flex-shrink-0",
          isDark ? 'border-white/5' : 'border-neutral-200',
          collapsed ? 'p-1' : 'p-2'
        )}>
          <div className="flex justify-center">
            <button
              onClick={onToggleCollapse}
              className={cn(
                "p-1 rounded transition-colors",
                isDark 
                  ? 'hover:bg-white/5 text-neutral-500 hover:text-white' 
                  : 'hover:bg-black/5 text-neutral-600 hover:text-black',
                collapsed && 'rotate-180'
              )}
              title={collapsed ? 'Expand' : 'Collapse'}
            >
              <PanelRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export type { GitFileStatus, GitFile, GitDiff, GitDiffPanelProps } from './types';
