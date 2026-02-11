import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Folder, Settings, Terminal, Plus, Home } from 'lucide-react';
import { formatShortcut } from './useKeyboardShortcuts';

export interface Command {
  id: string;
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  shortcut?: string;
  action: () => void;
}

export function useCommandPalette(
  projects: { id: string; name: string }[],
  sessions: { id: string; title: string; projectId: string }[],
  onNewSession?: () => void,
  onNewProject?: () => void,
  onToggleTerminal?: () => void
) {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  const commands = useMemo(() => {
    const baseCommands: Command[] = [
      {
        id: 'home',
        title: 'Go to Home',
        description: 'Navigate to the home page',
        icon: Home,
        shortcut: 'G H',
        action: () => navigate('/'),
      },
      {
        id: 'new-session',
        title: 'New Session',
        description: 'Create a new chat session',
        icon: Plus,
        shortcut: formatShortcut('n', { ctrl: true }),
        action: () => onNewSession?.(),
      },
      {
        id: 'new-project',
        title: 'New Project',
        description: 'Create a new project',
        icon: Folder,
        action: () => onNewProject?.(),
      },
      {
        id: 'toggle-terminal',
        title: 'Toggle Terminal',
        description: 'Show or hide the terminal panel',
        icon: Terminal,
        shortcut: formatShortcut('j', { ctrl: true }),
        action: () => onToggleTerminal?.(),
      },
      {
        id: 'settings',
        title: 'Settings',
        description: 'Open settings page',
        icon: Settings,
        shortcut: formatShortcut(',', { ctrl: true }),
        action: () => navigate('/settings'),
      },
    ];

    const projectCommands: Command[] = projects.map((p) => ({
      id: `project-${p.id}`,
      title: p.name,
      description: 'Open project',
      icon: Folder,
      action: () => navigate(`/?project=${p.id}`),
    }));

    const sessionCommands: Command[] = sessions.map((s) => ({
      id: `session-${s.id}`,
      title: s.title || 'Untitled Session',
      description: 'Open session',
      icon: MessageSquare,
      action: () => navigate(`/session/${s.id}`),
    }));

    return [...baseCommands, ...projectCommands, ...sessionCommands];
  }, [navigate, projects, sessions, onNewSession, onNewProject, onToggleTerminal]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  return { isOpen, open, close, toggle, commands };
}
