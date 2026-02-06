import { useState, useCallback, useMemo, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import {
  Folder,
  Plus,
  Search,
  Settings,
  Edit3,
  Trash2,
  Command,
  Loader2,
  AlertCircle,
  Clock,
  ChevronRight,
  Moon,
  Sun,
  X,
  PanelLeft,
  RefreshCw,
} from 'lucide-react';
import { useTheme } from '@/components/theme/useTheme';
import { NewProjectDialog } from './NewProjectDialog';
import { Logo } from './Logo';
import type { SidebarProps, Project, Session, SessionStatus } from './types';

const statusConfig: Record<SessionStatus, { icon: React.ReactNode; color: string; label: string }> = {
  idle: { icon: null, color: '', label: '' },
  loading: { icon: <Loader2 className="w-3 h-3 animate-spin" />, color: 'text-blue-400', label: 'Loading' },
  error: { icon: <AlertCircle className="w-3 h-3" />, color: 'text-red-400', label: 'Error' },
  stalled: { icon: <Clock className="w-3 h-3" />, color: 'text-amber-400', label: 'Stalled' },
};

interface DateGroup {
  label: string;
  sessions: Session[];
}

function groupSessionsByDate(sessions: Session[]): DateGroup[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const last7Days = new Date(today.getTime() - 7 * 86400000);
  const last30Days = new Date(today.getTime() - 30 * 86400000);

  const groups: Record<string, Session[]> = {
    Today: [],
    Yesterday: [],
    'Last 7 days': [],
    'Last 30 days': [],
    Older: [],
  };

  const sorted = [...sessions].sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
  );

  for (const session of sorted) {
    const date = session.updatedAt;
    if (date >= today) {
      groups['Today'].push(session);
    } else if (date >= yesterday) {
      groups['Yesterday'].push(session);
    } else if (date >= last7Days) {
      groups['Last 7 days'].push(session);
    } else if (date >= last30Days) {
      groups['Last 30 days'].push(session);
    } else {
      groups['Older'].push(session);
    }
  }

  return Object.entries(groups)
    .filter(([, sessions]) => sessions.length > 0)
    .map(([label, sessions]) => ({ label, sessions }));
}

function SessionItem({
  session,
  isActive,
  onClick,
  onRename,
  onDelete,
}: {
  session: Session;
  isActive: boolean;
  onClick: () => void;
  onRename?: (name: string) => void;
  onDelete?: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(session.name);
  const [showActions, setShowActions] = useState(false);

  const handleRename = useCallback(() => {
    if (editName.trim() && editName !== session.name) {
      onRename?.(editName.trim());
    }
    setIsEditing(false);
  }, [editName, session.name, onRename]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleRename();
    if (e.key === 'Escape') {
      setEditName(session.name);
      setIsEditing(false);
    }
  };

  const status = session.status || 'idle';
  const statusInfo = statusConfig[status];

  if (isEditing) {
    return (
      <div className="px-2 py-1">
        <input
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleRename}
          onKeyDown={handleKeyDown}
          autoFocus
          className="w-full px-2 py-1 text-[13px] bg-neutral-800/80 border border-neutral-700 rounded text-white outline-none focus:border-neutral-500"
        />
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      className={cn(
        'group flex items-center gap-2 px-2 py-1.5 cursor-pointer transition-all rounded mx-1',
        isActive
          ? 'bg-white text-neutral-900'
          : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/5'
      )}
    >
      <span className={cn(
        'flex-1 text-[13px] truncate',
        isActive && 'font-medium'
      )}>
        {session.name}
      </span>

      {status !== 'idle' && statusInfo.icon && (
        <span className={cn('shrink-0', isActive ? 'text-neutral-900/60' : statusInfo.color)} title={statusInfo.label}>
          {statusInfo.icon}
        </span>
      )}

      <div className={cn(
        'flex items-center gap-0.5 transition-opacity',
        showActions ? 'opacity-100' : 'opacity-0'
      )}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsEditing(true);
          }}
          className={cn(
            'p-1 rounded opacity-60 hover:opacity-100 transition-opacity',
            isActive ? 'hover:bg-neutral-900/10' : 'hover:bg-white/10'
          )}
        >
          <Edit3 className="w-3 h-3" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm('Delete this session?')) {
              onDelete?.();
            }
          }}
          className={cn(
            'p-1 rounded opacity-60 hover:opacity-100 transition-opacity',
            isActive ? 'hover:bg-neutral-900/10 hover:text-red-600' : 'hover:bg-white/10 hover:text-red-400'
          )}
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

function ProjectFolder({
  project,
  activeSessionPath,
  onSessionSelect,
  onNewSession,
  onRenameProject,
  onRenameSession,
  onDeleteProject,
  onDeleteSession,
  onLoadSessions,
  isCreatingSession,
}: {
  project: Project;
  activeSessionPath?: string;
  onSessionSelect: (sessionPath: string) => void;
  onNewSession: () => void;
  onRenameProject?: (name: string) => void;
  onRenameSession?: (sessionPath: string, name: string) => void;
  onDeleteProject?: () => void;
  onDeleteSession?: (sessionPath: string) => void;
  onLoadSessions?: (limit: number, offset: number) => Promise<{ sessions: Session[]; total: number; hasMore: boolean }>;
  isCreatingSession?: boolean;
}) {
  const hasActiveSession = project.sessions.some((s) => s.sessionPath === activeSessionPath);
  const [isExpanded, setIsExpanded] = useState(hasActiveSession);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(project.name);
  const [showActions, setShowActions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionsLoaded, setSessionsLoaded] = useState(project.sessions.length > 0);
  const [totalSessions, setTotalSessions] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  // Auto-expand if this project contains the active session
  useEffect(() => {
    if (hasActiveSession && !isExpanded) {
      setIsExpanded(true);
    }
  }, [hasActiveSession]);

  // Update sessionsLoaded when sessions change externally
  useEffect(() => {
    if (project.sessions.length > 0) {
      setSessionsLoaded(true);
    }
  }, [project.sessions.length]);
  const [currentOffset, setCurrentOffset] = useState(0);
  const PAGE_SIZE = 10;

  const dateGroups = useMemo(() => groupSessionsByDate(project.sessions), [project.sessions]);

  const handleExpand = useCallback(async () => {
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);

    if (!newExpanded) return;
    if (sessionsLoaded || isLoading || !onLoadSessions) return;

    setIsLoading(true);
    try {
      const result = await onLoadSessions(PAGE_SIZE, 0);
      setSessionsLoaded(true);
      setTotalSessions(result.total);
      setHasMore(result.hasMore);
      setCurrentOffset(result.sessions.length);
    } catch (err) {
      console.error('Failed to load sessions:', err);
      setSessionsLoaded(false);
      setHasMore(false);
    } finally {
      setIsLoading(false);
    }
  }, [isExpanded, sessionsLoaded, onLoadSessions, isLoading]);

  const handleLoadMore = useCallback(async () => {
    if (!onLoadSessions || !hasMore || isLoading) return;

    setIsLoading(true);
    try {
      const result = await onLoadSessions(PAGE_SIZE, currentOffset);
      setHasMore(result.hasMore);
      setCurrentOffset(prev => prev + result.sessions.length);
    } catch (err) {
      console.error('Failed to load more sessions:', err);
    } finally {
      setIsLoading(false);
    }
  }, [onLoadSessions, currentOffset, hasMore, isLoading]);

  const handleRefreshSessions = useCallback(async () => {
    if (!onLoadSessions || isLoading) return;

    setIsLoading(true);
    try {
      const result = await onLoadSessions(PAGE_SIZE, 0);
      setSessionsLoaded(true);
      setTotalSessions(result.total);
      setHasMore(result.hasMore);
      setCurrentOffset(result.sessions.length);
    } catch (err) {
      console.error('Failed to refresh sessions:', err);
    } finally {
      setIsLoading(false);
    }
  }, [onLoadSessions, isLoading]);

  const handleRename = useCallback(() => {
    if (editName.trim() && editName !== project.name) {
      onRenameProject?.(editName.trim());
    }
    setIsEditing(false);
  }, [editName, project.name, onRenameProject]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleRename();
    if (e.key === 'Escape') {
      setEditName(project.name);
      setIsEditing(false);
    }
  };

  return (
    <div className="mb-0.5">
      <div
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
        className={cn(
          'group flex items-center gap-1.5 px-2 py-1.5 cursor-pointer transition-colors rounded mx-1',
          hasActiveSession && !isExpanded
            ? 'bg-white/10 text-white'
            : 'text-neutral-300 hover:text-white hover:bg-white/5'
        )}
      >
        <button
          onClick={handleExpand}
          className="p-0.5 hover:bg-white/10 rounded transition-colors"
        >
          <ChevronRight
            className={cn(
              'w-3.5 h-3.5 text-neutral-500 transition-transform duration-150',
              isExpanded && 'rotate-90'
            )}
          />
        </button>

        <Folder className="w-4 h-4 text-neutral-500" />

        {isEditing ? (
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={handleKeyDown}
            autoFocus
            className="flex-1 px-1.5 py-0.5 text-[13px] bg-neutral-800/80 border border-neutral-700 rounded text-white outline-none focus:border-neutral-500"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="flex-1 text-[13px] font-medium truncate">
            {project.name}
          </span>
        )}

        {!isEditing && (
          <div className={cn(
            'flex items-center gap-0.5 transition-opacity',
            showActions || isCreatingSession ? 'opacity-100' : 'opacity-0'
          )}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                void handleRefreshSessions();
              }}
              disabled={!onLoadSessions || isLoading}
              className="p-1 rounded hover:bg-white/10 text-neutral-500 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Refresh sessions"
              aria-label="Refresh sessions"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!isCreatingSession) onNewSession();
              }}
              disabled={isCreatingSession}
              className="p-1 rounded hover:bg-white/10 text-neutral-500 hover:text-white transition-colors"
            >
              {isCreatingSession ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
              className="p-1 rounded hover:bg-white/10 text-neutral-500 hover:text-white transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`Delete "${project.name}" and all its sessions?`)) {
                  onDeleteProject?.();
                }
              }}
              className="p-1 rounded hover:bg-white/10 text-neutral-500 hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      <div
        className={cn(
          'grid transition-all duration-200 ease-out',
          isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        )}
      >
        <div className="overflow-hidden">
          <div className="border-l border-neutral-800 ml-5 mt-0.5">
            {isLoading && project.sessions.length === 0 ? (
              <div className="space-y-1 py-1 animate-pulse">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-7 bg-neutral-800/50 rounded mx-1" />
                ))}
              </div>
            ) : project.sessions.length === 0 && !isCreatingSession ? (
              <div className="px-3 py-2 text-xs text-neutral-600 italic">
                No sessions
              </div>
            ) : (
              <>
                {dateGroups.map((group) => (
                  <div key={group.label}>
                    <div className="px-3 pt-2 pb-1">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-600">
                        {group.label}
                      </span>
                    </div>
                    {group.sessions.map((session) => (
                      <SessionItem
                        key={session.sessionPath}
                        session={session}
                        isActive={session.sessionPath === activeSessionPath}
                        onClick={() => onSessionSelect(session.sessionPath)}
                        onRename={(name) => onRenameSession?.(session.sessionPath, name)}
                        onDelete={() => onDeleteSession?.(session.sessionPath)}
                      />
                    ))}
                  </div>
                ))}
                {(hasMore || isLoading) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLoadMore();
                    }}
                    disabled={isLoading}
                    className="w-full px-3 py-1.5 text-[11px] text-neutral-500 hover:text-neutral-300 hover:bg-white/5 rounded transition-colors text-center disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                    {isLoading ? 'Loading...' : `+${totalSessions - project.sessions.length} more`}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const PROJECTS_PER_PAGE = 10;

function ProjectsShimmer() {
  return (
    <div className="space-y-2 px-2 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-2 px-2 py-2">
          <div className="w-4 h-4 bg-neutral-800 rounded" />
          <div className="h-4 bg-neutral-800 rounded flex-1" />
        </div>
      ))}
    </div>
  );
}

export function Sidebar({
  projects,
  activeSessionPath,
  isOpen = true,
  onClose,
  collapsed = false,
  onToggleCollapse,
  onSessionSelect,
  onNewSession,
  onNewProject,
  onRenameProject,
  onRenameSession,
  onDeleteProject,
  onDeleteSession,
  onLoadProjectSessions,
  creatingSessionInProject,
  isLoadingProjects = false,
}: SidebarProps) {
  const { theme, toggleTheme } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PROJECTS_PER_PAGE);

  const sortedProjects = useMemo(() => {
    return [...projects].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }, [projects]);

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return sortedProjects;
    const query = searchQuery.toLowerCase();
    return sortedProjects
      .map((p) => ({
        ...p,
        sessions: p.sessions.filter((s) =>
          s.name.toLowerCase().includes(query)
        ),
      }))
      .filter(
        (p) =>
          p.name.toLowerCase().includes(query) || p.sessions.length > 0
      );
  }, [sortedProjects, searchQuery]);

  const displayedProjects = useMemo(() => {
    return filteredProjects.slice(0, visibleCount);
  }, [filteredProjects, visibleCount]);

  const hasMore = filteredProjects.length > visibleCount;

  // Reset visible count when search changes
  useEffect(() => {
    setVisibleCount(PROJECTS_PER_PAGE);
  }, [searchQuery]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <>
      {/* Mobile Overlay */}
      <div
        className={cn(
          'fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity md:hidden',
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
      />
      
      {/* Sidebar */}
      <div
        className={cn(
          'fixed md:static inset-y-0 left-0 h-full bg-[#0a0a0a] border-r border-white/5 flex flex-col z-50 md:translate-x-0 overflow-hidden',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          collapsed ? 'w-[52px]' : 'w-[260px]'
        )}
        style={{ transition: 'width 250ms cubic-bezier(0.4, 0, 0.2, 1), transform 300ms ease-out' }}
      >
        {/* Header */}
        <div className={cn('border-b border-white/5 flex-shrink-0', collapsed ? 'p-1.5' : 'p-3')}>
          <div className={cn('flex items-center', collapsed ? 'flex-col gap-1.5' : 'justify-between mb-3')}>
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 overflow-hidden hover:opacity-80 transition-opacity">
              <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center shrink-0">
                <Logo className="w-5 h-5 text-black" />
              </div>
              {!collapsed && (
                <span className="text-sm font-semibold text-white tracking-tight whitespace-nowrap">
                  Chats
                </span>
              )}
            </Link>

            {/* Header Actions */}
            <div className="flex items-center gap-0.5">
              {!collapsed && (
                <>
                  <button
                    onClick={toggleTheme}
                    className="p-1.5 rounded-md hover:bg-white/5 text-neutral-500 hover:text-white transition-colors"
                    title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                  >
                    {theme === 'dark' ? (
                      <Sun className="w-4 h-4" />
                    ) : (
                      <Moon className="w-4 h-4" />
                    )}
                  </button>
                  <Link
                    to="/settings"
                    className="p-1.5 rounded-md hover:bg-white/5 text-neutral-500 hover:text-white transition-colors"
                    title="Settings"
                  >
                    <Settings className="w-4 h-4" />
                  </Link>
                </>
              )}
              <button
                onClick={onClose}
                className="md:hidden p-1.5 rounded-md hover:bg-white/5 text-neutral-500 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* New Button */}
          {!collapsed ? (
            <button
              onClick={() => setNewProjectOpen(true)}
              className="w-full flex items-center gap-2 px-3 py-2 text-neutral-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors text-[13px]"
            >
              <Plus className="w-4 h-4" />
              <span>New Project</span>
            </button>
          ) : (
            <button
              onClick={() => setNewProjectOpen(true)}
              className="w-full flex items-center justify-center p-1.5 text-neutral-500 hover:text-white hover:bg-white/5 rounded-md transition-colors"
              title="New Project"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}

          {/* Search */}
          {!collapsed && (
            <div className="mt-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-600" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="w-full pl-8 pr-3 py-1.5 text-[13px] bg-white/5 border border-white/5 rounded-md text-white placeholder:text-neutral-600 outline-none focus:border-white/10 transition-colors"
                />
              </div>
            </div>
          )}
        </div>

        {/* Projects List */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-2">
          {isLoadingProjects ? (
            // Loading State
            <ProjectsShimmer />
          ) : collapsed ? (
            // Collapsed View - Compact Icons
            projects.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40">
                <Folder className="w-4 h-4 text-neutral-700" />
              </div>
            ) : (
              <div className="space-y-0.5 px-1">
                {projects.map((project) => {
                  const hasActiveSession = project.sessions.some((s) => s.sessionPath === activeSessionPath);
                  return (
                    <button
                      key={project.id}
                      onClick={() => {
                        const session = project.sessions.find((s) => s.sessionPath === activeSessionPath) || project.sessions[0];
                        if (session) {
                          onSessionSelect(project.id, session.sessionPath);
                        } else {
                          onNewSession(project.id);
                        }
                      }}
                      className={cn(
                        'w-full flex items-center justify-center p-1.5 rounded-md transition-colors',
                        hasActiveSession
                          ? 'bg-white/10 text-white'
                          : 'text-neutral-500 hover:text-neutral-300 hover:bg-white/5'
                      )}
                      title={`${project.name} (${project.sessions.length})`}
                    >
                      <Folder className="w-4 h-4" />
                    </button>
                  );
                })}
              </div>
            )
          ) : projects.length === 0 ? (
            // Empty State
            <div className="flex flex-col items-center justify-center h-40 text-center px-4">
              <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center mb-3">
                <Folder className="w-5 h-5 text-neutral-600" />
              </div>
              <p className="text-sm text-neutral-500 mb-1">No projects yet</p>
              <p className="text-xs text-neutral-600">
                Create one to get started
              </p>
            </div>
          ) : filteredProjects.length === 0 ? (
            // No Search Results
            <div className="flex flex-col items-center justify-center h-40 text-center px-4">
              <Search className="w-6 h-6 text-neutral-700 mb-2" />
              <p className="text-sm text-neutral-500">No results</p>
            </div>
          ) : (
            // Project List
            <div className="space-y-0.5">
              {displayedProjects.map((project) => (
                <ProjectFolder
                  key={project.id}
                  project={project}
                  activeSessionPath={activeSessionPath}
                  onSessionSelect={(sessionId) =>
                    onSessionSelect(project.id, sessionId)
                  }
                  onNewSession={() => onNewSession(project.id)}
                  onRenameProject={(name) =>
                    onRenameProject?.(project.id, name)
                  }
                  onRenameSession={onRenameSession}
                  onDeleteProject={() => onDeleteProject?.(project.id)}
                  onDeleteSession={onDeleteSession}
                  onLoadSessions={onLoadProjectSessions ? (limit, offset) => onLoadProjectSessions(project.id, limit, offset) : undefined}
                  isCreatingSession={creatingSessionInProject === project.id}
                />
              ))}
              {hasMore && (
                <button
                  onClick={() => setVisibleCount(prev => prev + PROJECTS_PER_PAGE)}
                  className="w-full px-3 py-2 text-xs text-neutral-500 hover:text-neutral-300 hover:bg-white/5 rounded-lg transition-colors text-center"
                >
                  Load more ({filteredProjects.length - visibleCount} remaining)
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={cn('border-t border-white/5 flex-shrink-0', collapsed ? 'p-1.5' : 'p-3')}>
          <div className={cn('flex items-center', collapsed ? 'justify-center' : 'justify-between')}>
            {!collapsed && (
              <div className="flex items-center gap-2 text-[11px] text-neutral-600">
                <span className="flex items-center gap-1">
                  <Command className="w-3 h-3" />
                  K
                </span>
                <span className="text-neutral-700">·</span>
                <span>{projects.reduce((acc, p) => acc + p.sessions.length, 0)} chats</span>
              </div>
            )}
            <button
              onClick={onToggleCollapse}
              className={cn(
                'p-1.5 rounded-md hover:bg-white/5 text-neutral-500 hover:text-white transition-colors',
                collapsed && 'rotate-180'
              )}
              title={collapsed ? 'Expand' : 'Collapse'}
            >
              <PanelLeft className="w-4 h-4" />
            </button>
          </div>
        </div>

        <NewProjectDialog
          open={newProjectOpen}
          onOpenChange={setNewProjectOpen}
          onCreate={onNewProject}
        />
      </div>
    </>
  );
}

export type { SessionStatus, ProjectMode, Session, Project, SidebarProps } from './types';
