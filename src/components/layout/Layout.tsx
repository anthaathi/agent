import { useState, useCallback, useEffect } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router-dom';
import { Sidebar, type Project, type Session } from '@/components/sidebar';
import { GitDiffPanel } from '@/components/git-diff';

const defaultProjects: Project[] = [
  {
    id: '1',
    name: 'My Project',
    mode: 'plain',
    createdAt: new Date(),
    sessions: [
      {
        id: 's1',
        name: 'Welcome',
        createdAt: new Date(),
        updatedAt: new Date(),
        messageCount: 5,
      },
    ],
  },
];

export function Layout() {
  const navigate = useNavigate();
  const { id: sessionId } = useParams();
  const [projects, setProjects] = useState<Project[]>(defaultProjects);
  const [activeSessionId, setActiveSessionId] = useState<string>(sessionId || 's1');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [diffPanelOpen, setDiffPanelOpen] = useState(false);
  const [diffPanelCollapsed, setDiffPanelCollapsed] = useState(false);

  const handleSessionSelect = useCallback((_projectId: string, sessionId: string) => {
    setActiveSessionId(sessionId);
    navigate(`/session/${sessionId}`);
  }, [navigate]);

  const handleNewSession = useCallback((projectId: string) => {
    const newSession: Session = {
      id: `s${Date.now()}`,
      name: `New Session`,
      createdAt: new Date(),
      updatedAt: new Date(),
      messageCount: 0,
    };
    setProjects(prev =>
      prev.map(p =>
        p.id === projectId
          ? { ...p, sessions: [...p.sessions, newSession] }
          : p
      )
    );
    setActiveSessionId(newSession.id);
    navigate(`/session/${newSession.id}`);
  }, [navigate]);

  const handleNewProject = useCallback((name: string, path: string, mode: 'plain' | 'git-worktree') => {
    const newProject: Project = {
      id: `p${Date.now()}`,
      name,
      path: path || undefined,
      mode,
      createdAt: new Date(),
      sessions: [],
    };
    setProjects(prev => [...prev, newProject]);
  }, []);

  const handleRenameProject = useCallback((projectId: string, newName: string) => {
    setProjects(prev =>
      prev.map(p => (p.id === projectId ? { ...p, name: newName } : p))
    );
  }, []);

  const handleRenameSession = useCallback((sessionId: string, newName: string) => {
    setProjects(prev =>
      prev.map(p => ({
        ...p,
        sessions: p.sessions.map(s =>
          s.id === sessionId ? { ...s, name: newName } : s
        ),
      }))
    );
  }, []);

  const handleDeleteProject = useCallback((projectId: string) => {
    setProjects(prev => prev.filter(p => p.id !== projectId));
    const deletedProject = projects.find(p => p.id === projectId);
    if (deletedProject?.sessions.some(s => s.id === activeSessionId)) {
      setActiveSessionId('');
      navigate('/');
    }
  }, [projects, activeSessionId, navigate]);

  const handleDeleteSession = useCallback((sessionId: string) => {
    setProjects(prev =>
      prev.map(p => ({
        ...p,
        sessions: p.sessions.filter(s => s.id !== sessionId),
      }))
    );
    if (sessionId === activeSessionId) {
      setActiveSessionId('');
      navigate('/');
    }
  }, [activeSessionId, navigate]);

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
        activeSessionId={activeSessionId}
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
      />
      <div className="flex-1 flex flex-col min-w-0 relative">
        <Outlet context={{
          onOpenSidebar: () => setSidebarOpen(true),
          onOpenDiffPanel: () => setDiffPanelOpen(!diffPanelOpen),
        }} />
      </div>

      {diffPanelOpen && (
        <GitDiffPanel
          isOpen={diffPanelOpen}
          onClose={() => setDiffPanelOpen(false)}
          collapsed={diffPanelCollapsed}
          onToggleCollapse={() => setDiffPanelCollapsed(!diffPanelCollapsed)}
        />
      )}
    </div>
  );
}
