import { useEffect, useRef, useState, useCallback } from 'react';
import { init, Terminal, FitAddon } from 'ghostty-web';
import { X, Maximize2, Minimize2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

// Unique ID generator
let tabCounter = 0;
const generateTabId = () => `term-${++tabCounter}-${Date.now()}`;

interface TerminalTab {
  id: string;
  name: string;
  terminal?: Terminal;
  fitAddon?: FitAddon;
  disposed?: boolean;
}

interface TerminalPanelProps {
  isOpen: boolean;
  onClose: () => void;
  minHeight?: number;
  maxHeight?: number;
}

export function TerminalPanel({
  isOpen,
  onClose,
  minHeight = 150,
  maxHeight = 600,
}: TerminalPanelProps) {
  const containerRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [height, setHeight] = useState(280);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const disposedTerminalsRef = useRef<Set<string>>(new Set());
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const lineBuffersRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (isOpen && tabs.length === 0) {
      addTab();
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      resizeObserverRef.current?.disconnect();
      tabs.forEach(tab => {
        if (tab.terminal && !tab.disposed) {
          tab.terminal.dispose();
        }
      });
    };
  }, []);

  const addTab = useCallback(async () => {
    try {
      await init();
      const id = generateTabId();
      const newTab: TerminalTab = {
        id,
        name: `Terminal ${tabs.length + 1}`,
      };
      setTabs(prev => [...prev, newTab]);
      setActiveTabId(id);
    } catch (error) {
      console.error('Failed to create terminal:', error);
    }
  }, [tabs.length]);

  const removeTab = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const tab = tabs.find(t => t.id === id);
    if (tab?.terminal && !tab.disposed) {
      try {
        tab.terminal.dispose();
      } catch {
        // Already disposed
      }
      disposedTerminalsRef.current.add(id);
    }
    setTabs(prev => {
      const newTabs = prev.filter(t => t.id !== id);
      if (activeTabId === id && newTabs.length > 0) {
        setActiveTabId(newTabs[newTabs.length - 1].id);
      } else if (newTabs.length === 0) {
        setActiveTabId(null);
        onClose();
      }
      return newTabs;
    });
  }, [tabs, activeTabId, onClose]);

  useEffect(() => {
    if (!activeTabId) return;

    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab || tab.terminal || tab.disposed) return;
    if (disposedTerminalsRef.current.has(activeTabId)) return;

    const container = containerRefs.current.get(activeTabId);
    if (!container) return;

    const tabId = activeTabId;

    try {
      const term = new Terminal({
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

      term.loadAddon(fitAddon);
      term.open(container);
      
      // Delay fit to ensure container is properly sized
      setTimeout(() => {
        try {
          fitAddon.fit();
          term.focus();
        } catch {
          // Ignore fit errors
        }
      }, 50);

      term.writeln('\x1b[1;32m→ Terminal ready\x1b[0m');
      term.write('$ ');
      lineBuffersRef.current.set(tabId, '');

      const handleInput = (input: string) => {
        let buffer = lineBuffersRef.current.get(tabId) || '';

        for (const ch of input) {
          if (ch === '\r' || ch === '\n') {
            term.write('\r\n');
            const command = buffer.trim();
            buffer = '';
            
            if (command) {
              // Echo command execution
              if (command === 'clear' || command === 'cls') {
                term.clear();
              } else if (command === 'help') {
                term.writeln('\x1b[36mAvailable commands:\x1b[0m');
                term.writeln('  clear, cls  Clear the terminal');
                term.writeln('  help        Show this help message');
              } else {
                term.writeln(`\x1b[90mCommand not found: ${command}\x1b[0m`);
              }
            }
            
            term.write('$ ');
            continue;
          }

          if (ch === '\u007f' || ch === '\b' || ch === '\u0008') {
            if (buffer.length > 0) {
              buffer = buffer.slice(0, -1);
              term.write('\b \b');
            }
            continue;
          }

          if (ch === '\u0003') {
            term.write('^C\r\n');
            buffer = '';
            term.write('$ ');
            continue;
          }

          if (ch === '\u000c') {
            term.clear();
            term.write('$ ');
            buffer = '';
            continue;
          }

          if (ch === '\u001b') {
            continue;
          }

          if (ch >= ' ' || ch === '\t') {
            buffer += ch;
            term.write(ch);
          }
        }

        lineBuffersRef.current.set(tabId, buffer);
      };

      term.onData(handleInput);

      setTabs(prev => prev.map(t =>
        t.id === tabId ? { ...t, terminal: term, fitAddon } : t
      ));
    } catch (error) {
      console.error('Failed to create terminal:', error);
    }
  }, [activeTabId, tabs]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeRef.current = {
      startY: e.clientY,
      startHeight: height,
    };
  }, [height]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const deltaY = resizeRef.current.startY - e.clientY;
      const newHeight = Math.max(minHeight, Math.min(maxHeight, resizeRef.current.startHeight + deltaY));
      setHeight(newHeight);
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

  // Fit terminal when height changes
  useEffect(() => {
    if (!activeTabId) return;

    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab?.fitAddon || activeTab.disposed) return;
    if (disposedTerminalsRef.current.has(activeTabId)) return;

    const rafId = requestAnimationFrame(() => {
      try {
        activeTab.fitAddon?.fit();
      } catch {
        disposedTerminalsRef.current.add(activeTabId);
      }
    });

    return () => cancelAnimationFrame(rafId);
  }, [height, isExpanded, tabs, activeTabId]);

  // Resize observer for container changes
  useEffect(() => {
    resizeObserverRef.current?.disconnect();

    if (!activeTabId) return;

    const activeTab = tabs.find(t => t.id === activeTabId);
    const container = activeTabId ? containerRefs.current.get(activeTabId) : null;

    if (!activeTab?.fitAddon || !container) return;

    resizeObserverRef.current = new ResizeObserver(() => {
      activeTab.fitAddon?.fit();
    });

    resizeObserverRef.current.observe(container);

    return () => {
      resizeObserverRef.current?.disconnect();
    };
  }, [activeTabId, tabs]);

  useEffect(() => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab?.terminal && !activeTab.disposed) {
      activeTab.terminal.focus();
    }
  }, [activeTabId, tabs]);

  if (!isOpen) return null;

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

      {/* VS Code-style tab bar */}
      <div className="flex items-center justify-between bg-[#010409] border-b border-[#30363d] shrink-0">
        <div className="flex items-center gap-0 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 text-xs border-r border-[#30363d] min-w-[120px] max-w-[200px] group',
                activeTabId === tab.id
                  ? 'bg-[#0d1117] text-[#e6edf3]'
                  : 'bg-[#010409] text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#161b22]'
              )}
            >
              <span className="truncate flex-1 text-left">{tab.name}</span>
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

        <div className="flex items-center gap-0.5 shrink-0 px-2">
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

      {/* Terminal container - fills entire area */}
      <div 
        className="flex-1 relative overflow-hidden cursor-text"
        onClick={() => {
          const activeTab = tabs.find(t => t.id === activeTabId);
          if (activeTab?.terminal && !activeTab.disposed) {
            activeTab.terminal.focus();
          }
        }}
      >
        {tabs.map((tab) => (
          <div
            key={tab.id}
            ref={(el) => {
              if (el) containerRefs.current.set(tab.id, el);
              else containerRefs.current.delete(tab.id);
            }}
            className={cn(
              'terminal-host absolute inset-0',
              activeTabId === tab.id ? 'block' : 'hidden'
            )}
            style={{ 
              width: '100%', 
              height: '100%',
            }}
          />
        ))}
      </div>
    </div>
  );
}
