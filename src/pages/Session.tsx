import { useRef, useState, useEffect, useCallback, type ComponentType } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import { Sparkles, Globe, FileText, FolderTree, FileSearch, Image, Terminal, Menu, GitBranch } from 'lucide-react';
import { ChatInput } from '@/components/chat-input';
import type { Attachment, SlashCommand, MentionItem, ProseMirrorEditorRef } from '@/components/chat-input';
import { StreamingMessage } from '@/components/StreamingMessage';
import { TerminalPanel } from '@/components/terminal';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  attachments: Attachment[];
  mentions: string[];
  timestamp: Date;
}

const MentionIconMap: Record<string, ComponentType<{ className?: string }>> = {
  file: FileText,
  codebase: FolderTree,
  web: Globe,
  docs: FileSearch,
};

const defaultMentions: MentionItem[] = [
  { id: 'file', name: 'file', description: 'Reference a specific file', icon: 'FileText', color: '' },
  { id: 'codebase', name: 'codebase', description: 'Search entire codebase', icon: 'FolderTree', color: '' },
  { id: 'web', name: 'web', description: 'Search the web', icon: 'Globe', color: '' },
  { id: 'docs', name: 'docs', description: 'Search documentation', icon: 'FileSearch', color: '' },
];

interface LayoutContext {
  onOpenSidebar: () => void;
  onOpenDiffPanel: () => void;
}

interface PiEvent {
  type: string;
  [key: string]: unknown;
}

function MentionBadge({ mentionId }: { mentionId: string }) {
  const mention = defaultMentions.find(m => m.id === mentionId);
  if (!mention) return null;
  const Icon = MentionIconMap[mention.id] || FileText;
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-muted/50 rounded text-[10px] font-medium text-muted-foreground">
      <Icon className="w-2.5 h-2.5" />
      @{mention.name}
    </span>
  );
}

function AttachmentThumb({ attachment }: { attachment: Attachment }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-muted/50 rounded text-[11px]">
      {attachment.type === 'image' ? <Image className="w-3 h-3 text-muted-foreground" /> : <FileText className="w-3 h-3 text-muted-foreground" />}
      <span className="truncate max-w-[100px]">{attachment.name}</span>
    </span>
  );
}

function MessageBubble({ message, onStreamProgress }: { message: Message; onStreamProgress?: () => void }) {
  const isUser = message.role === 'user';
  return (
    <div className={cn("animate-in fade-in-0 slide-in-from-bottom-2 duration-300", isUser ? "flex flex-col items-end" : "")}>
      <div className={cn("max-w-[80%]")}>
        {(message.mentions.length > 0 || message.attachments.length > 0) && (
          <div className={cn("flex flex-wrap gap-1 mb-1.5", isUser ? "justify-end" : "")}>
            {message.mentions.map(id => <MentionBadge key={id} mentionId={id} />)}
            {message.attachments.map(att => <AttachmentThumb key={att.id} attachment={att} />)}
          </div>
        )}
        <div className={cn(
          "text-sm leading-relaxed",
          isUser
            ? "inline-block px-3.5 py-2 bg-foreground text-background rounded-2xl rounded-br-md max-w-full"
            : "block bg-muted/50 rounded-2xl rounded-bl-md px-3.5 py-2 max-w-full overflow-hidden"
        )}>
          {isUser ? (
            message.text
          ) : (
            <StreamingMessage text={message.text} typingDuration={4} onStreamProgress={onStreamProgress} />
          )}
        </div>
        <div className="text-[10px] text-muted-foreground mt-1">
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}

export function Session() {
  const { id: sessionId } = useParams<{ id: string }>();
  const { onOpenSidebar, onOpenDiffPanel } = useOutletContext<LayoutContext>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [inputPadding, setInputPadding] = useState(96);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputWrapRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<ProseMirrorEditorRef>(null);
  const autoScrollRef = useRef(true);
  const wsRef = useRef<WebSocket | null>(null);
  const streamingMessageRef = useRef<string>('');

  // WebSocket connection
  useEffect(() => {
    if (!sessionId) return;

    const ws = api.connectWebSocket(sessionId);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      console.log('WebSocket connected');
    };

    ws.onclose = () => {
      setIsConnected(false);
      console.log('WebSocket disconnected');
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setIsConnected(false);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [sessionId]);

  const handleWebSocketMessage = useCallback((data: { type: string; event?: PiEvent; message?: string }) => {
    switch (data.type) {
      case 'connected':
        console.log('Session connected');
        break;

      case 'event':
        if (data.event) {
          handlePiEvent(data.event);
        }
        break;

      case 'extension_ui_request':
        // Handle extension UI requests (select, confirm, input, etc.)
        // For now, auto-cancel or provide defaults
        if (wsRef.current && 'id' in data) {
          wsRef.current.send(JSON.stringify({
            type: 'extension_ui_response',
            id: (data as { id: string }).id,
            cancelled: true,
          }));
        }
        break;

      case 'error':
        console.error('Server error:', data.message);
        break;

      case 'disconnected':
        setIsConnected(false);
        break;
    }
  }, []);

  const handlePiEvent = useCallback((event: PiEvent) => {
    switch (event.type) {
      case 'agent_start':
        setLoading(true);
        streamingMessageRef.current = '';
        break;

      case 'message_update':
        const assistantEvent = event.assistantMessageEvent as { type: string; delta?: string; contentIndex?: number } | undefined;
        if (assistantEvent?.type === 'text_delta' && assistantEvent.delta) {
          streamingMessageRef.current += assistantEvent.delta;
          // Update the last assistant message or create new one
          setMessages(prev => {
            const lastMsg = prev[prev.length - 1];
            if (lastMsg && lastMsg.role === 'assistant' && loading) {
              return [
                ...prev.slice(0, -1),
                { ...lastMsg, text: streamingMessageRef.current },
              ];
            }
            return [
              ...prev,
              {
                id: Date.now().toString(),
                role: 'assistant',
                text: streamingMessageRef.current,
                attachments: [],
                mentions: [],
                timestamp: new Date(),
              },
            ];
          });
        }
        break;

      case 'agent_end':
        setLoading(false);
        streamingMessageRef.current = '';
        break;

      case 'tool_execution_start':
        // Could show tool execution indicator
        console.log('Tool execution:', event.toolName);
        break;

      case 'tool_execution_end':
        // Tool execution completed
        break;
    }
  }, [loading]);

  // Reset messages when session changes
  useEffect(() => {
    setMessages([]);
  }, [sessionId]);

  const scrollToBottom = (behavior: ScrollBehavior = 'auto') => {
    const container = messagesContainerRef.current;
    if (!container) return;
    if (behavior === 'smooth') {
      container.scrollTo({ top: container.scrollHeight, behavior });
    } else {
      container.scrollTop = container.scrollHeight;
    }
  };

  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - (container.scrollTop + container.clientHeight);
    autoScrollRef.current = distanceFromBottom < 80;
  };

  const handleStreamProgress = () => {
    if (!autoScrollRef.current) return;
    requestAnimationFrame(() => scrollToBottom('auto'));
  };

  useEffect(() => {
    const wrapper = inputWrapRef.current;
    if (!wrapper || typeof ResizeObserver === 'undefined') return;

    const update = () => {
      const height = wrapper.getBoundingClientRect().height;
      setInputPadding(Math.round(height + 16));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(wrapper);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (autoScrollRef.current) {
      requestAnimationFrame(() => scrollToBottom('smooth'));
    }
  }, [messages, loading]);

  const handleSend = useCallback(async ({ text, attachments, mentions }: { text: string; markdown: string; attachments: Attachment[]; mentions: string[] }) => {
    if (!sessionId || !wsRef.current) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text,
      attachments,
      mentions,
      timestamp: new Date(),
    };
    autoScrollRef.current = true;
    setMessages(prev => [...prev, userMessage]);
    setLoading(true);

    // Send prompt via WebSocket
    wsRef.current.send(JSON.stringify({
      type: 'command',
      command: {
        type: 'prompt',
        message: text,
      },
    }));
  }, [sessionId]);

  const handleSlashCommand = (command: SlashCommand) => {
    if (command.id === 'clear') {
      setMessages([]);
    } else if (command.id === 'help') {
      const helpMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        text: `Commands: /help, /clear, /model, /edit, /run, /search, /settings\n\nMentions: @file, @codebase, @web, @docs`,
        attachments: [],
        mentions: [],
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, helpMessage]);
    }
  };

  return (
    <>
      <header className="shrink-0">
        <div className="max-w-2xl mx-auto px-4 h-12 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenSidebar}
              className="md:hidden p-1.5 -ml-1.5 rounded hover:bg-muted text-muted-foreground transition-colors"
              aria-label="Open sidebar"
            >
              <Menu className="w-4 h-4" />
            </button>
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="font-medium text-sm">Assistant</span>
            {!isConnected && (
              <span className="text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                offline
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-[11px]">
            <button
              onClick={onOpenDiffPanel}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
              title="Git changes"
            >
              <GitBranch className="w-3 h-3" />
              <span className="hidden sm:inline">Changes</span>
            </button>
            <button
              onClick={() => setTerminalOpen(!terminalOpen)}
              className={cn(
                "flex items-center gap-1 transition-colors",
                terminalOpen ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
              title="Toggle terminal"
            >
              <Terminal className="w-3 h-3" />
              <span className="hidden sm:inline">Terminal</span>
            </button>
          </div>
        </div>
      </header>

      <main
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden"
        onScroll={handleScroll}
        style={{ scrollPaddingBottom: inputPadding }}
      >
        <div
          className="max-w-3xl mx-auto px-4 py-6 space-y-4 min-h-full"
          style={{ paddingBottom: inputPadding }}
        >
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center min-h-[50vh]">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mb-4">
                <Sparkles className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-sm mb-6">Start a conversation</p>
              <div className="flex gap-2 text-xs text-muted-foreground">
                <span className="px-2 py-1 bg-muted/50 rounded">/commands</span>
                <span className="px-2 py-1 bg-muted/50 rounded">@mentions</span>
              </div>
            </div>
          ) : (
            messages.map(msg => (
              <MessageBubble key={msg.id} message={msg} onStreamProgress={handleStreamProgress} />
            ))
          )}
          {loading && (
            <div className="flex items-center gap-1 px-3 py-2 bg-muted/50 rounded-2xl rounded-bl-md w-fit animate-in fade-in-0">
              <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-pulse" />
              <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-pulse [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-pulse [animation-delay:300ms]" />
            </div>
          )}
        </div>
      </main>

      <div ref={inputWrapRef} className="shrink-0 bg-background/80 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 pb-safe md:pb-3">
          <ChatInput
            ref={chatInputRef}
            onSend={handleSend}
            onSlashCommand={handleSlashCommand}
            mentions={defaultMentions}
            loading={loading}
            placeholder={isConnected ? "Message..." : "Connecting..."}
          />
        </div>
      </div>

      {/* Terminal Panel - at bottom of screen */}
      {terminalOpen && (
        <TerminalPanel
          isOpen={terminalOpen}
          onClose={() => setTerminalOpen(false)}
        />
      )}
    </>
  );
}
