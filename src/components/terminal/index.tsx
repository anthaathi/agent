import { useEffect, useRef, useState, useCallback } from 'react';
import { init, Terminal, FitAddon, type IDisposable } from 'ghostty-web';
import { X, Maximize2, Minimize2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

type TabStatus = 'connecting' | 'connected' | 'error';

interface TerminalTab {
  id: string;
  status: TabStatus;
  error?: string;
}

interface TerminalRuntime {
  terminal: Terminal;
  fitAddon: FitAddon;
  socket: WebSocket | null;
  dataDisposable?: IDisposable;
  resizeDisposable?: IDisposable;
  disposed: boolean;
}

interface TerminalServerMessage {
  type: 'ready' | 'output' | 'exit' | 'error' | 'pong';
  data?: string;
  message?: string;
  cwd?: string;
  exitCode?: number | null;
}

interface PersistedTerminalState {
  terminalIds: string[];
  activeTabId: string | null;
  height: number;
  isExpanded: boolean;
}

interface TerminalPanelProps {
  isOpen: boolean;
  onClose: () => void;
  sessionPath?: string;
  minHeight?: number;
  maxHeight?: number;
}

function generateTabId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `terminal-${crypto.randomUUID()}`;
  }
  return `terminal-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getStorageKey(sessionPath?: string): string | null {
  if (!sessionPath) {
    return null;
  }
  return `pi-terminal-tabs:${sessionPath}`;
}

function loadPersistedTerminalState(sessionPath?: string): PersistedTerminalState {
  const storageKey = getStorageKey(sessionPath);
  if (!storageKey || typeof window === 'undefined') {
    return { terminalIds: [], activeTabId: null, height: 280, isExpanded: false };
  }

  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) {
      return { terminalIds: [], activeTabId: null, height: 280, isExpanded: false };
    }

    const parsed = JSON.parse(raw) as Partial<PersistedTerminalState>;
    const terminalIds = Array.isArray(parsed.terminalIds)
      ? parsed.terminalIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : [];

    const activeTabId = typeof parsed.activeTabId === 'string' ? parsed.activeTabId : null;
    const height = typeof parsed.height === 'number' && Number.isFinite(parsed.height) ? parsed.height : 280;
    const isExpanded = Boolean(parsed.isExpanded);

    return {
      terminalIds,
      activeTabId: activeTabId && terminalIds.includes(activeTabId) ? activeTabId : terminalIds[0] ?? null,
      height,
      isExpanded,
    };
  } catch {
    return { terminalIds: [], activeTabId: null, height: 280, isExpanded: false };
  }
}

function buildTerminalWsUrl(sessionPath: string, terminalId: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const encodedPath = encodeURIComponent(sessionPath);
  const encodedTerminalId = encodeURIComponent(terminalId);
  return `${protocol}//${window.location.host}/ws/terminal/${encodedPath}?terminalId=${encodedTerminalId}`;
}

export function TerminalPanel({
  isOpen,
  onClose,
  sessionPath,
  minHeight = 150,
  maxHeight = 600,
}: TerminalPanelProps) {
  const persistedStateRef = useRef<PersistedTerminalState>(loadPersistedTerminalState(sessionPath));
  const containerRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const runtimesRef = useRef<Map<string, TerminalRuntime>>(new Map());
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const initPromiseRef = useRef<Promise<void> | null>(null);
  const resizeRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const [tabs, setTabs] = useState<TerminalTab[]>(() =>
    persistedStateRef.current.terminalIds.map((id) => ({ id, status: 'connecting' }))
  );
  const [activeTabId, setActiveTabId] = useState<string | null>(() => {
    const initialActive = persistedStateRef.current.activeTabId;
    if (initialActive && persistedStateRef.current.terminalIds.includes(initialActive)) {
      return initialActive;
    }
    return persistedStateRef.current.terminalIds[0] ?? null;
  });
  const [height, setHeight] = useState(() =>
    Math.max(minHeight, Math.min(maxHeight, persistedStateRef.current.height))
  );
  const [isExpanded, setIsExpanded] = useState(() => persistedStateRef.current.isExpanded);
  const [isResizing, setIsResizing] = useState(false);

  const ensureTerminalInit = useCallback(() => {
    if (!initPromiseRef.current) {
      initPromiseRef.current = init();
    }
    return initPromiseRef.current;
  }, []);

  const updateTab = useCallback((tabId: string, updates: Partial<TerminalTab>) => {
    setTabs((prev) => prev.map((tab) => (tab.id === tabId ? { ...tab, ...updates } : tab)));
  }, []);

  const cleanupRuntime = useCallback((tabId: string, closeRemote: boolean) => {
    const runtime = runtimesRef.current.get(tabId);
    if (!runtime || runtime.disposed) {
      return;
    }

    runtime.disposed = true;

    runtime.dataDisposable?.dispose();
    runtime.resizeDisposable?.dispose();

    if (runtime.socket && runtime.socket.readyState === WebSocket.OPEN) {
      if (closeRemote) {
        runtime.socket.send(JSON.stringify({ type: 'close' }));
      }
      runtime.socket.close(1000, closeRemote ? 'Terminal tab closed' : 'Terminal detached');
    }

    runtime.socket = null;

    try {
      runtime.terminal.dispose();
    } catch {
      // no-op
    }

    runtimesRef.current.delete(tabId);
  }, []);

  const addTab = useCallback(() => {
    const id = generateTabId();
    setTabs((prev) => [...prev, { id, status: 'connecting' }]);
    setActiveTabId(id);
  }, []);

  const removeTab = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    cleanupRuntime(id, true);

    setTabs((prev) => {
      const nextTabs = prev.filter((tab) => tab.id !== id);
      if (activeTabId === id) {
        if (nextTabs.length === 0) {
          setActiveTabId(null);
          onClose();
        } else {
          setActiveTabId(nextTabs[nextTabs.length - 1].id);
        }
      }
      return nextTabs;
    });
  }, [activeTabId, cleanupRuntime, onClose]);

  useEffect(() => {
    if (!sessionPath || typeof window === 'undefined') {
      return;
    }

    const storageKey = getStorageKey(sessionPath);
    if (!storageKey) {
      return;
    }

    const payload: PersistedTerminalState = {
      terminalIds: tabs.map((tab) => tab.id),
      activeTabId: activeTabId && tabs.some((tab) => tab.id === activeTabId) ? activeTabId : tabs[0]?.id ?? null,
      height,
      isExpanded,
    };

    window.sessionStorage.setItem(storageKey, JSON.stringify(payload));
  }, [sessionPath, tabs, activeTabId, height, isExpanded]);

  useEffect(() => {
    if (isOpen && tabs.length === 0) {
      addTab();
    }
  }, [isOpen, tabs.length, addTab]);

  useEffect(() => {
    if (!activeTabId) {
      return;
    }

    if (runtimesRef.current.has(activeTabId)) {
      const runtime = runtimesRef.current.get(activeTabId);
      if (runtime && !runtime.disposed) {
        runtime.terminal.focus();
      }
      return;
    }

    const tab = tabs.find((t) => t.id === activeTabId);
    const container = containerRefs.current.get(activeTabId);

    if (!tab || !container) {
      return;
    }

    let cancelled = false;

    const setupTerminal = async () => {
      try {
        await ensureTerminalInit();

        if (cancelled || runtimesRef.current.has(activeTabId)) {
          return;
        }

        const latestContainer = containerRefs.current.get(activeTabId);
        if (!latestContainer) {
          return;
        }

        const terminal = new Terminal({
          fontSize: 14,
          fontFamily: 'JetBrains Mono, Fira Code, Cascadia Code, Consolas, Monaco, Menlo, monospace',
          cursorBlink: true,
          cursorStyle: 'bar',
          convertEol: true,
          theme: {
            background: '#0d1117',
            foreground: '#e6edf3',
            cursor: '#e6edf3',
            black: '#010409',
            red: '#ff7b72',
            green: '#3fb950',
            yellow: '#d29922',
            blue: '#58a6ff',
            magenta: '#f778ba',
            cyan: '#a5d6ff',
            white: '#b0b8bf',
            brightBlack: '#6e7681',
            brightRed: '#ffa198',
            brightGreen: '#56d364',
            brightYellow: '#e3b341',
            brightBlue: '#79c0ff',
            brightMagenta: '#f088b3',
            brightCyan: '#b3e0ff',
            brightWhite: '#ffffff',
          },
          scrollback: 5000,
        });

        const fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);
        terminal.open(latestContainer);

        const runtime: TerminalRuntime = {
          terminal,
          fitAddon,
          socket: null,
          disposed: false,
        };

        runtimesRef.current.set(activeTabId, runtime);

        requestAnimationFrame(() => {
          if (runtime.disposed) {
            return;
          }
          fitAddon.fit();
          terminal.focus();
        });

        if (!sessionPath) {
          terminal.writeln('\x1b[31mNo active session selected.\x1b[0m');
          updateTab(activeTabId, { status: 'error', error: 'No active session' });
          return;
        }

        const socket = new WebSocket(buildTerminalWsUrl(sessionPath, activeTabId));
        runtime.socket = socket;

        const sendJson = (payload: Record<string, unknown>) => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(payload));
          }
        };

        runtime.dataDisposable = terminal.onData((data) => {
          sendJson({ type: 'input', data });
        });

        runtime.resizeDisposable = terminal.onResize(({ cols, rows }) => {
          sendJson({ type: 'resize', cols, rows });
        });

        socket.onopen = () => {
          if (runtime.disposed) {
            return;
          }
          updateTab(activeTabId, { status: 'connected', error: undefined });
          sendJson({ type: 'resize', cols: terminal.cols, rows: terminal.rows });
        };

        socket.onmessage = (event) => {
          if (runtime.disposed) {
            return;
          }

          let message: TerminalServerMessage;

          try {
            message = JSON.parse(event.data) as TerminalServerMessage;
          } catch {
            updateTab(activeTabId, { status: 'error', error: 'Invalid terminal server message' });
            return;
          }

          if (message.type === 'ready') {
            if (message.cwd) {
              terminal.writeln(`\x1b[90m${message.cwd}\x1b[0m`);
            }
            return;
          }

          if (message.type === 'output') {
            if (typeof message.data === 'string') {
              terminal.write(message.data);
            }
            return;
          }

          if (message.type === 'error') {
            const errorText = message.message || 'Terminal error';
            updateTab(activeTabId, { status: 'error', error: errorText });
            terminal.writeln(`\r\n\x1b[31m${errorText}\x1b[0m`);
            return;
          }

          if (message.type === 'exit') {
            const exitCode = message.exitCode ?? 0;
            updateTab(activeTabId, { status: 'error', error: `Exited (${exitCode})` });
            terminal.writeln(`\r\n\x1b[33mProcess exited with code ${exitCode}\x1b[0m`);
          }
        };

        socket.onerror = () => {
          if (!runtime.disposed) {
            updateTab(activeTabId, { status: 'error', error: 'Terminal connection error' });
          }
        };

        socket.onclose = (event) => {
          if (runtime.disposed) {
            return;
          }

          if (event.code !== 1000) {
            const errorText = event.reason || 'Terminal disconnected';
            updateTab(activeTabId, { status: 'error', error: errorText });
          }
        };
      } catch (error) {
        console.error('Failed to initialize terminal', error);
        updateTab(activeTabId, {
          status: 'error',
          error: error instanceof Error ? error.message : 'Failed to initialize terminal',
        });
      }
    };

    void setupTerminal();

    return () => {
      cancelled = true;
    };
  }, [activeTabId, tabs, sessionPath, ensureTerminalInit, updateTab]);

  useEffect(() => {
    return () => {
      resizeObserverRef.current?.disconnect();
      for (const tabId of Array.from(runtimesRef.current.keys())) {
        cleanupRuntime(tabId, false);
      }
    };
  }, [cleanupRuntime]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeRef.current = {
      startY: e.clientY,
      startHeight: height,
    };
  }, [height]);

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current) {
        return;
      }
      const deltaY = resizeRef.current.startY - e.clientY;
      const nextHeight = Math.max(minHeight, Math.min(maxHeight, resizeRef.current.startHeight + deltaY));
      setHeight(nextHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      resizeRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, minHeight, maxHeight]);

  useEffect(() => {
    if (!activeTabId) {
      return;
    }

    const runtime = runtimesRef.current.get(activeTabId);
    if (!runtime || runtime.disposed) {
      return;
    }

    const rafId = requestAnimationFrame(() => {
      if (runtime.disposed) {
        return;
      }

      try {
        runtime.fitAddon.fit();
        if (runtime.socket?.readyState === WebSocket.OPEN) {
          runtime.socket.send(JSON.stringify({
            type: 'resize',
            cols: runtime.terminal.cols,
            rows: runtime.terminal.rows,
          }));
        }
      } catch {
        updateTab(activeTabId, { status: 'error', error: 'Failed to resize terminal' });
      }
    });

    return () => cancelAnimationFrame(rafId);
  }, [height, isExpanded, activeTabId, updateTab]);

  useEffect(() => {
    resizeObserverRef.current?.disconnect();

    if (!activeTabId) {
      return;
    }

    const runtime = runtimesRef.current.get(activeTabId);
    const container = containerRefs.current.get(activeTabId);

    if (!runtime || runtime.disposed || !container) {
      return;
    }

    resizeObserverRef.current = new ResizeObserver(() => {
      if (runtime.disposed) {
        return;
      }

      runtime.fitAddon.fit();
      if (runtime.socket?.readyState === WebSocket.OPEN) {
        runtime.socket.send(JSON.stringify({
          type: 'resize',
          cols: runtime.terminal.cols,
          rows: runtime.terminal.rows,
        }));
      }
    });

    resizeObserverRef.current.observe(container);

    return () => {
      resizeObserverRef.current?.disconnect();
    };
  }, [activeTabId]);

  useEffect(() => {
    if (!activeTabId) {
      return;
    }

    const runtime = runtimesRef.current.get(activeTabId);
    if (runtime && !runtime.disposed) {
      runtime.terminal.focus();
    }
  }, [activeTabId]);

  if (!isOpen) {
    return null;
  }

  const activeTab = tabs.find((tab) => tab.id === activeTabId);

  return (
    <div
      className={cn(
        'bg-[#0d1117] border-t border-border flex flex-col shrink-0 animate-in slide-in-from-bottom-4 duration-300 ease-out',
        isExpanded ? 'fixed inset-0 z-50' : 'relative',
        isResizing && 'select-none'
      )}
      style={{ height: isExpanded ? '100vh' : height }}
    >
      {!isExpanded && (
        <div
          onMouseDown={handleResizeStart}
          className="absolute top-0 left-0 right-0 h-1 cursor-row-resize z-10 hover:bg-blue-500/30 transition-colors"
          title="Drag to resize"
        />
      )}

      <div className="flex items-center justify-between bg-[#010409] border-b border-[#30363d] shrink-0">
        <div className="flex items-center gap-0 overflow-x-auto no-scrollbar">
          {tabs.map((tab, index) => (
            <button
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 text-xs border-r border-[#30363d] min-w-[120px] max-w-[220px] group',
                activeTabId === tab.id
                  ? 'bg-[#0d1117] text-[#e6edf3]'
                  : 'bg-[#010409] text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22]'
              )}
            >
              <span
                className={cn(
                  'w-1.5 h-1.5 rounded-full shrink-0',
                  tab.status === 'connected' ? 'bg-emerald-400' : tab.status === 'connecting' ? 'bg-amber-400' : 'bg-rose-400'
                )}
              />
              <span className="truncate flex-1 text-left">Terminal {index + 1}</span>
              {tabs.length > 1 && (
                <span
                  onClick={(e) => removeTab(tab.id, e)}
                  className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[#f85149]/20 hover:text-[#f85149] transition-opacity"
                >
                  <X className="w-3 h-3" />
                </span>
              )}
            </button>
          ))}
          <button
            onClick={addTab}
            className="px-2 py-2 text-[#8b949e] hover:text-[#e6edf3] transition-colors"
            title="New terminal"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0 px-2">
          {activeTab?.error && (
            <span className="text-[10px] text-rose-300 max-w-[220px] truncate">{activeTab.error}</span>
          )}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#30363d]/50 transition-colors"
            title={isExpanded ? 'Minimize' : 'Maximize'}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#30363d]/50 transition-colors"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div
        className="flex-1 relative overflow-hidden cursor-text"
        onClick={() => {
          if (!activeTabId) {
            return;
          }
          const runtime = runtimesRef.current.get(activeTabId);
          if (runtime && !runtime.disposed) {
            runtime.terminal.focus();
          }
        }}
      >
        {tabs.map((tab) => (
          <div
            key={tab.id}
            ref={(el) => {
              if (el) {
                containerRefs.current.set(tab.id, el);
              } else {
                containerRefs.current.delete(tab.id);
              }
            }}
            className={cn(
              'terminal-host absolute inset-0',
              activeTabId === tab.id ? 'block' : 'hidden'
            )}
            style={{ width: '100%', height: '100%' }}
          />
        ))}
      </div>
    </div>
  );
}
