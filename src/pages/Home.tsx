import { useState, useCallback } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { MessageSquare, FolderPlus, ArrowRight, Sparkles, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api/client';

interface LayoutContext {
  onOpenSidebar: () => void;
  onOpenDiffPanel: () => void;
  projects: { id: string; name: string; path?: string }[];
  onNewProject: (name: string, path: string, mode: 'plain' | 'git-worktree') => void;
  refreshProjects: () => Promise<void>;
}

export function Home() {
  const navigate = useNavigate();
  const context = useOutletContext<LayoutContext>();
  const { onOpenSidebar, projects, refreshProjects } = context;
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleQuickStart = useCallback(async (projectId: string, projectPath?: string) => {
    setIsCreating(true);
    setError(null);
    try {
      const session = await api.createSession(projectId, 'New Session', projectPath);
      navigate(`/session/${encodeURIComponent(session.sessionPath)}`);
    } catch (err) {
      console.error('Failed to create session:', err);
      const message = err instanceof Error ? err.message : 'Failed to create session';
      if (message.includes('not found')) {
        setError('Project not found. Refreshing list...');
        await refreshProjects();
        setError(null);
      } else {
        setError(message);
      }
    } finally {
      setIsCreating(false);
    }
  }, [navigate, refreshProjects]);

  const hasProjects = projects && projects.length > 0;

  return (
    <>
      <header className="shrink-0">
        <div className="max-w-2xl mx-auto px-4 h-12 flex items-center">
          <button
            onClick={onOpenSidebar}
            className="md:hidden p-1.5 -ml-1.5 rounded hover:bg-muted text-muted-foreground transition-colors"
            aria-label="Open sidebar"
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-8">
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mx-auto">
              <Sparkles className="w-6 h-6 text-muted-foreground" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">Welcome to Pi Agent</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {hasProjects
                ? 'Start a new session in one of your projects, or create a new project to begin.'
                : 'Create a project to get started with your first coding session.'}
            </p>
          </div>

          {error && (
            <div className="px-3 py-2 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
              {error}
            </div>
          )}

          {hasProjects ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Quick start</p>
              <div className="space-y-1.5">
                {projects.slice(0, 5).map((project) => (
                  <button
                    key={project.id}
                    onClick={() => handleQuickStart(project.id, project.path)}
                    disabled={isCreating}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border/50 hover:bg-muted/50 hover:border-border transition-colors text-left group disabled:opacity-50"
                  >
                    <MessageSquare className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium block truncate">{project.name}</span>
                      {project.path && (
                        <span className="text-xs text-muted-foreground block truncate">{project.path}</span>
                      )}
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </button>
                ))}
              </div>
              {projects.length > 5 && (
                <button
                  onClick={onOpenSidebar}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  +{projects.length - 5} more projects in sidebar
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <Button
                onClick={onOpenSidebar}
                className="gap-2"
              >
                <FolderPlus className="w-4 h-4" />
                Create your first project
              </Button>
              <p className="text-xs text-muted-foreground">
                Or use the sidebar to browse and manage projects
              </p>
            </div>
          )}

          <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground pt-2">
            <span className="px-2 py-1 bg-muted/50 rounded">/commands</span>
            <span className="px-2 py-1 bg-muted/50 rounded">@mentions</span>
            <span className="px-2 py-1 bg-muted/50 rounded">drag & drop files</span>
          </div>
        </div>
      </main>
    </>
  );
}
