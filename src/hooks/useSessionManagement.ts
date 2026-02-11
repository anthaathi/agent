import { useState, useCallback, useEffect } from 'react';

interface PinnedSession {
  id: string;
  title: string;
  projectId: string;
  pinnedAt: number;
}

const STORAGE_KEY = 'session.management';

interface SessionManagementState {
  pinned: PinnedSession[];
  archived: string[];
}

function loadState(): SessionManagementState {
  if (typeof window === 'undefined') {
    return { pinned: [], archived: [] };
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as SessionManagementState;
    }
  } catch {
    // Ignore parse errors
  }

  return { pinned: [], archived: [] };
}

function saveState(state: SessionManagementState): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

export function useSessionManagement() {
  const [state, setState] = useState<SessionManagementState>(loadState);

  useEffect(() => {
    saveState(state);
  }, [state]);

  const pinSession = useCallback((session: { id: string; title: string; projectId: string }) => {
    setState((prev) => ({
      ...prev,
      pinned: [
        ...prev.pinned.filter((p) => p.id !== session.id),
        { ...session, pinnedAt: Date.now() },
      ].sort((a, b) => b.pinnedAt - a.pinnedAt),
    }));
  }, []);

  const unpinSession = useCallback((sessionId: string) => {
    setState((prev) => ({
      ...prev,
      pinned: prev.pinned.filter((p) => p.id !== sessionId),
    }));
  }, []);

  const isPinned = useCallback(
    (sessionId: string) => state.pinned.some((p) => p.id === sessionId),
    [state.pinned]
  );

  const archiveSession = useCallback((sessionId: string) => {
    setState((prev) => ({
      ...prev,
      archived: [...new Set([...prev.archived, sessionId])],
      pinned: prev.pinned.filter((p) => p.id !== sessionId),
    }));
  }, []);

  const unarchiveSession = useCallback((sessionId: string) => {
    setState((prev) => ({
      ...prev,
      archived: prev.archived.filter((id) => id !== sessionId),
    }));
  }, []);

  const isArchived = useCallback(
    (sessionId: string) => state.archived.includes(sessionId),
    [state.archived]
  );

  const renameSession = useCallback(async (sessionId: string, newTitle: string): Promise<void> => {
    // This will be implemented with API call
    const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle }),
    });

    if (!response.ok) {
      throw new Error('Failed to rename session');
    }

    // Update pinned session title if exists
    setState((prev) => ({
      ...prev,
      pinned: prev.pinned.map((p) =>
        p.id === sessionId ? { ...p, title: newTitle } : p
      ),
    }));
  }, []);

  return {
    pinnedSessions: state.pinned,
    archivedSessionIds: state.archived,
    pinSession,
    unpinSession,
    isPinned,
    archiveSession,
    unarchiveSession,
    isArchived,
    renameSession,
  };
}
