import { useState, useCallback, useEffect, useMemo } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router-dom';
import { Sidebar, type Project, type Session } from '@/components/sidebar';
import { GitDiffPanel } from '@/components/git-diff';
import { CommandPalette } from '@/components/command-palette/CommandPalette';
import { useCommandPalette } from '@/hooks/useCommandPalette';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { api, type Project as ApiProject, type Session as ApiSession } from '@/lib/api/client';

function mapApiProjectToProject(apiProject: ApiProject): Project {
  return {
    id: apiProject.id,
    name: apiProject.name,
    path: apiProject.path,
    mode: 'plain',
    createdAt: new Date(apiProject.createdAt),
    updatedAt: new Date(apiProject.updatedAt),
    sessions: [],
  };
}

function mapApiSessions(apiSessions: ApiSession[]): Session[] {
  return apiSessions.map(session => ({
    sessionPath: session.sessionPath,
    name: session.name,
    createdAt: new Date(session.createdAt),
    updatedAt: new Date(session.lastActivity),
    messageCount: 0,
  }));
}

export function Layout() {
  const navigate = useNavigate();
  const { id: sessionPath } = useParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeSessionPath, setActiveSessionPath] = useState<string>(sessionPath || '');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [diffPanelOpen, setDiffPanelOpen] = useState(false);
  const [diffPanelCollapsed, setDiffPanelCollapsed] = useState(false);
  const [creatingSessionInProject, setCreatingSessionInProject] = useState<string | null>(null);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);

  // Get cwd for active session's project
  const activeCwd = (() => {
    if (!activeSessionPath || !projects.length) return undefined;
    for (const project of projects) {
      if (project.sessions.some(s => s.sessionPath === activeSessionPath)) {
        return project.path;
      }
    }
    return undefined;
  })();

  // Sync activeSessionPath with URL
  useEffect(() => {
    setActiveSessionPath(sessionPath || '');
  }, [sessionPath]);

  // Refresh projects from API
  const refreshProjects = useCallback(async () => {
    setIsLoadingProjects(true);
    try {
      const apiProjects = await api.getProjects();
      setProjects(apiProjects.map(mapApiProjectToProject));
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setIsLoadingProjects(false);
    }
  }, []);

  // Fetch projects from API on mount only
  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  // Load sessions for active session's project (separate effect)
  useEffect(() => {
    if (!sessionPath) return;

    const loadActiveSessionProject = async () => {
      try {
        const sessionInfo = await api.getSession(sessionPath);
        if (sessionInfo?.projectId) {
          // Check if this project already has sessions loaded
          const project = projects.find(p => p.id === sessionInfo.projectId);
          if (project && project.sessions.length > 0) return;

          const result = await api.loadProjectSessions(sessionInfo.projectId, 10, 0);
          const sessions = mapApiSessions(result.sessions);
          setProjects(prev => prev.map(p => 
            p.id === sessionInfo.projectId 
              ? { ...p, sessions } 
              : p
          ));
        }
      } catch (err) {
        console.error('Failed to load active session project:', err);
      }
    };
    
    // Only run if we have projects loaded
    if (projects.length > 0) {
      loadActiveSessionProject();
    }
  }, [sessionPath, projects.length]);

  const handleSessionSelect = useCallback((_projectId: string, selectedSessionPath: string) => {
    setActiveSessionPath(selectedSessionPath);
    navigate(`/session/${encodeURIComponent(selectedSessionPath)}`);
  }, [navigate]);

  const handleNewSession = useCallback(async (projectId: string) => {
    setCreatingSessionInProject(projectId);
    try {
      const project = projects.find(p => p.id === projectId);
      const newSession = await api.createSession(projectId, 'New Session', project?.path);
      const now = new Date();
      setProjects(prev =>
        prev.map(p =>
          p.id === projectId
            ? { ...p, updatedAt: now, sessions: [{
                sessionPath: newSession.sessionPath,
                name: newSession.name,
                createdAt: new Date(newSession.createdAt),
                updatedAt: new Date(newSession.lastActivity),
                messageCount: 0,
              }, ...p.sessions] }
            : p
        )
      );
      setActiveSessionPath(newSession.sessionPath);
      navigate(`/session/${encodeURIComponent(newSession.sessionPath)}`);
    } catch (error) {
      console.error('Failed to create session:', error);
      const message = error instanceof Error ? error.message : 'Failed to create session';
      if (message.includes('not found')) {
        await refreshProjects();
      }
    } finally {
      setCreatingSessionInProject(null);
    }
  }, [navigate, projects, refreshProjects]);

  const handleNewProject = useCallback(async (name: string, path: string, _mode: 'plain' | 'git-worktree') => {
    try {
      const newProject = await api.createProject(name, path);
      setProjects(prev => [...prev, {
        id: newProject.id,
        name: newProject.name,
        path: newProject.path,
        mode: 'plain',
        createdAt: new Date(newProject.createdAt),
        updatedAt: new Date(newProject.updatedAt || newProject.createdAt),
        sessions: [],
      }]);
    } catch (error) {
      console.error('Failed to create project:', error);
    }
  }, []);

  const handleRenameProject = useCallback((projectId: string, newName: string) => {
    setProjects(prev =>
      prev.map(p => (p.id === projectId ? { ...p, name: newName } : p))
    );
  }, []);

  const handleRenameSession = useCallback((renamedSessionPath: string, newName: string) => {
    setProjects(prev =>
      prev.map(p => ({
        ...p,
        sessions: p.sessions.map(s =>
          s.sessionPath === renamedSessionPath ? { ...s, name: newName } : s
        ),
      }))
    );
  }, []);

  const handleDeleteProject = useCallback(async (projectId: string) => {
    try {
      await api.deleteProject(projectId);
      setProjects(prev => prev.filter(p => p.id !== projectId));
      const deletedProject = projects.find(p => p.id === projectId);
      if (deletedProject?.sessions.some(s => s.sessionPath === activeSessionPath)) {
        setActiveSessionPath('');
        navigate('/');
      }
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  }, [projects, activeSessionPath, navigate]);

  const handleDeleteSession = useCallback(async (deletedSessionPath: string) => {
    try {
      await api.deleteSession(deletedSessionPath);
      setProjects(prev =>
        prev.map(p => ({
          ...p,
          sessions: p.sessions.filter(s => s.sessionPath !== deletedSessionPath),
        }))
      );
      if (deletedSessionPath === activeSessionPath) {
        setActiveSessionPath('');
        navigate('/');
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  }, [activeSessionPath, navigate]);

  const handleLoadProjectSessions = useCallback(async (
    projectId: string,
    limit: number,
    offset: number
  ): Promise<{ sessions: Session[]; total: number; hasMore: boolean }> => {
    try {
      const result = await api.loadProjectSessions(projectId, limit, offset);
      const newSessions = mapApiSessions(result.sessions);

      // Update project with loaded sessions (deduplicate by path)
      setProjects(prev =>
        prev.map(p => {
          if (p.id !== projectId) return p;

          if (offset === 0) {
            // First page - replace all sessions
            return { ...p, sessions: newSessions };
          }

          // Subsequent pages - merge and deduplicate
          const existingPaths = new Set(p.sessions.map(s => s.sessionPath));
          const uniqueNewSessions = newSessions.filter(s => !existingPaths.has(s.sessionPath));
          return { ...p, sessions: [...p.sessions, ...uniqueNewSessions] };
        })
      );

      return { sessions: newSessions, total: result.total, hasMore: result.hasMore };
    } catch (error) {
      console.error('Failed to load project sessions:', error);
      return { sessions: [], total: 0, hasMore: false };
    }
  }, []);

  // Command palette
  const allSessions = useMemo(() =>
    projects.flatMap(p => p.sessions.map(s => ({
      id: s.sessionPath,
      title: s.name,
      projectId: p.id,
    }))),
    [projects]
  );

  const { isOpen: commandPaletteOpen, open: openCommandPalette, close: closeCommandPalette, commands } = useCommandPalette(
    projects.map(p => ({ id: p.id, name: p.name })),
    allSessions,
    undefined,
    () => setSidebarOpen(true),
    () => setDiffPanelOpen(prev => !prev)
  );

  // Keyboard shortcuts
  useKeyboardShortcuts([
    { key: 'k', ctrl: true, handler: openCommandPalette },
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateViewportVars = () => {
      const root = document.documentElement;
      const vv = window.visualViewport;

      if (!vv) {
        root.style.setProperty('--app-height', `${window.innerHeight}px`);
        root.style.setProperty('--app-bottom-inset', '0px');
        return;
      }

      const height = vv.height;
      const bottomInset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);

      root.style.setProperty('--app-height', `${height}px`);
      root.style.setProperty('--app-bottom-inset', `${bottomInset}px`);
    };

    updateViewportVars();

    window.addEventListener('resize', updateViewportVars);
    window.addEventListener('orientationchange', updateViewportVars);

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateViewportVars);
      window.visualViewport.addEventListener('scroll', updateViewportVars);
    }

    return () => {
      window.removeEventListener('resize', updateViewportVars);
      window.removeEventListener('orientationchange', updateViewportVars);

      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateViewportVars);
        window.visualViewport.removeEventListener('scroll', updateViewportVars);
      }
    };
  }, []);

  return (
    <div
      className="bg-background flex overflow-hidden"
      style={{ height: 'var(--app-height, 100vh)' }}
    >
      <Sidebar
        projects={projects}
        activeSessionPath={activeSessionPath}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        onSessionSelect={handleSessionSelect}
        onNewSession={handleNewSession}
        onNewProject={handleNewProject}
        onRenameProject={handleRenameProject}
        onRenameSession={handleRenameSession}
        onDeleteProject={handleDeleteProject}
        onDeleteSession={handleDeleteSession}
        onLoadProjectSessions={handleLoadProjectSessions}
        creatingSessionInProject={creatingSessionInProject}
        isLoadingProjects={isLoadingProjects}
      />
      <div className="flex-1 flex flex-col min-w-0 relative">
        <Outlet context={{
          onOpenSidebar: () => setSidebarOpen(true),
          onOpenDiffPanel: () => setDiffPanelOpen(!diffPanelOpen),
          projects,
          onNewProject: handleNewProject,
          refreshProjects,
        }} />
      </div>

      {diffPanelOpen && (
        <GitDiffPanel
          isOpen={diffPanelOpen}
          onClose={() => setDiffPanelOpen(false)}
          collapsed={diffPanelCollapsed}
          onToggleCollapse={() => setDiffPanelCollapsed(!diffPanelCollapsed)}
          cwd={activeCwd}
        />
      )}

      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={closeCommandPalette}
        commands={commands}
      />
    </div>
  );
}
