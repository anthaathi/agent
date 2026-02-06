import { useRef, useState, useEffect, useCallback, useMemo, type ComponentType } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import { Streamdown } from 'streamdown';
import { code } from '@streamdown/code';
import { Globe, FileText, FolderTree, FileSearch, Image, Terminal, Menu, GitBranch, RefreshCw } from 'lucide-react';
import { ChatInput } from '@/components/chat-input';
import type { Attachment, SlashCommand, MentionItem, ProseMirrorEditorRef, Provider } from '@/components/chat-input';

import { TerminalPanel } from '@/components/terminal';
import { ToolGroup, ThinkingBlock } from '@/components/ToolExecution';
import { PiSessionClient, type ToolCallState, type PiSessionState, type StreamingContentItem, type PiServerEvent, type ImageAttachment } from '@/lib/pi-session-client';
import { api } from '@/lib/api/client';
import { cn, fileToBase64 } from '@/lib/utils';
import { parseMessageContent } from '@/lib/utils/message-parser';

interface MessageImage {
  data: string;
  mimeType: string;
  name?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  thinkingBlocks?: string[];
  toolCalls?: ToolCallState[];
  contentOrder?: StreamingContentItem[];
  attachments: Attachment[];
  images?: MessageImage[]; // Base64 images from history/cross-window
  mentions: string[];
  timestamp: Date;
}

// Generate unique message ID
function newMessageId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
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

function MessageShimmer({ visible }: { visible: boolean }) {
  if (!visible) return null;
  
  return (
    <div className="absolute inset-0 z-10 bg-background">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4 animate-pulse">
        {/* User message shimmer */}
        <div className="flex flex-col items-end">
          <div className="max-w-[70%]">
            <div className="h-10 bg-muted/50 rounded-2xl rounded-br-md w-48" />
          </div>
        </div>
        {/* Assistant message shimmer */}
        <div className="space-y-2">
          <div className="h-4 bg-muted/30 rounded w-24" />
          <div className="space-y-1.5">
            <div className="h-3 bg-muted/40 rounded w-full" />
            <div className="h-3 bg-muted/40 rounded w-5/6" />
            <div className="h-3 bg-muted/40 rounded w-4/6" />
          </div>
        </div>
        {/* Another user message */}
        <div className="flex flex-col items-end">
          <div className="max-w-[70%]">
            <div className="h-8 bg-muted/50 rounded-2xl rounded-br-md w-32" />
          </div>
        </div>
        {/* Another assistant message */}
        <div className="space-y-2">
          <div className="h-4 bg-muted/30 rounded w-20" />
          <div className="space-y-1.5">
            <div className="h-3 bg-muted/40 rounded w-full" />
            <div className="h-3 bg-muted/40 rounded w-3/4" />
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ 
  message, 
  isThinkingStreaming = false,
  isStreaming = false,
}: { 
  message: Message; 
  isThinkingStreaming?: boolean;
  isStreaming?: boolean;
}) {
  const isUser = message.role === 'user';
  
  const renderAssistantContent = () => {
    const contentOrder = message.contentOrder;
    
    if (contentOrder && contentOrder.length > 0) {
      return contentOrder.map((item, idx) => {
        if (item.type === 'thinking') {
          const thinking = message.thinkingBlocks?.[item.index];
          if (!thinking) return null;
          const isLastThinking = !contentOrder.slice(idx + 1).some(c => c.type === 'thinking');
          return (
            <ThinkingBlock 
              key={`thinking-${item.index}`}
              thinking={thinking}
              isStreaming={isThinkingStreaming && isLastThinking}
            />
          );
        } else if (item.type === 'toolCall') {
          const tool = message.toolCalls?.find(t => t.id === item.id);
          if (!tool) return null;
          return (
            <ToolGroup
              key={`tool-${item.id}`}
              thinking={undefined}
              tools={[{
                toolCallId: tool.id,
                toolName: tool.name,
                arguments: tool.arguments,
                result: tool.result,
                isError: tool.isError,
                isRunning: tool.isRunning,
                startTime: tool.startTime,
                endTime: tool.endTime,
              }]}
              isStreaming={tool.isRunning}
            />
          );
        } else if (item.type === 'text') {
          if (!message.text) return null;
          return (
            <div key="text">
              <Streamdown
                plugins={{ code }}
                className="prose prose-sm dark:prose-invert max-w-none [&_pre]:border [&_pre]:border-border/40 [&_pre]:rounded-lg [&_pre]:p-4 [&_pre]:overflow-x-auto [&_pre]:max-w-full [&_pre]:my-2 [&_code]:before:content-none [&_code]:after:content-none [&_code]:bg-muted/50 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:rounded-none [&_.shiki]:text-xs [&_.shiki]:leading-relaxed [&_[data-streamdown='code-block-header']]:!px-3"
              >
                {message.text}
              </Streamdown>
            </div>
          );
        }
        return null;
      });
    }
    
    // Fallback for messages without contentOrder (loaded from history)
    return (
      <>
        {message.thinkingBlocks?.map((thinking, idx) => (
          <ThinkingBlock key={`thinking-${idx}`} thinking={thinking} isStreaming={false} />
        ))}
        {message.toolCalls?.map(tool => (
          <ToolGroup
            key={`tool-${tool.id}`}
            thinking={undefined}
            tools={[{
              toolCallId: tool.id,
              toolName: tool.name,
              arguments: tool.arguments,
              result: tool.result,
              isError: tool.isError,
              isRunning: tool.isRunning,
              startTime: tool.startTime,
              endTime: tool.endTime,
            }]}
          />
        ))}
        {message.text && (
          <div>
            <Streamdown
              plugins={{ code }}
              className="prose prose-sm dark:prose-invert max-w-none [&_pre]:border [&_pre]:border-border/40 [&_pre]:rounded-lg [&_pre]:p-4 [&_pre]:overflow-x-auto [&_pre]:max-w-full [&_pre]:my-2 [&_code]:before:content-none [&_code]:after:content-none [&_code]:bg-muted/50 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:rounded-none [&_.shiki]:text-xs [&_.shiki]:leading-relaxed [&_[data-streamdown='code-block-header']]:!px-3"
            >
              {message.text}
            </Streamdown>
          </div>
        )}
      </>
    );
  };
  
  // Check if there are any image thumbnails to show
  const hasAttachments = message.attachments.length > 0;
  const hasImages = message.images && message.images.length > 0;
  const hasThumbnails = hasAttachments || hasImages;
  
  return (
    <div className={cn(
      !isStreaming && "animate-in fade-in-0 slide-in-from-bottom-2 duration-200",
      isUser ? "flex flex-col items-end" : ""
    )}>
      <div className={cn("max-w-[85%]", !isUser && "w-full")}>
        {(message.mentions.length > 0 || hasThumbnails) && (
          <div className={cn("flex flex-wrap gap-1 mb-1.5", isUser ? "justify-end" : "")}>
            {message.mentions.map(id => <MentionBadge key={id} mentionId={id} />)}
            {message.attachments.map(att => <AttachmentThumb key={att.id} attachment={att} />)}
            {message.images?.map((_img, idx) => (
              <span key={`img-${idx}`} className="inline-flex items-center gap-1.5 px-2 py-1 bg-muted/50 rounded text-[11px]">
                <Image className="w-3 h-3 text-muted-foreground" />
                <span className="truncate max-w-[100px]">Image</span>
              </span>
            ))}
          </div>
        )}
        
        <div className={cn(
          "text-sm leading-relaxed",
          isUser
            ? "inline-block px-3.5 py-2 bg-foreground text-background rounded-2xl rounded-br-md max-w-full"
            : "block"
        )}>
          {isUser ? (
            <div className="space-y-2">
              {message.text}
              {message.images && message.images.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {message.images.map((img, idx) => (
                    <img
                      key={idx}
                      src={`data:${img.mimeType};base64,${img.data}`}
                      alt={img.name || `Image ${idx + 1}`}
                      className="max-w-[200px] max-h-[200px] rounded-lg object-cover"
                    />
                  ))}
                </div>
              )}
              {message.attachments.filter(att => att.type === 'image').map(att => (
                att.previewUrl && (
                  <img
                    key={att.id}
                    src={att.previewUrl}
                    alt={att.name}
                    className="max-w-[200px] max-h-[200px] rounded-lg object-cover mt-2"
                  />
                )
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {renderAssistantContent()}
            </div>
          )}
        </div>
        
        {isUser && (
          <div className="text-[10px] text-muted-foreground mt-1 text-right">
            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>
    </div>
  );
}

// Default state for when client is not connected
const DEFAULT_PI_STATE: PiSessionState = {
  isConnected: false,
  isLoading: false,
  error: null,
  models: [],
  currentModel: undefined,
  thinkingLevel: 'medium',
  streamingMessageId: null,
  streamingText: '',
  streamingThinkingBlocks: [],
  streamingToolCalls: new Map(),
  streamingContentOrder: [],
};

// Hook to use PiSessionClient with React
function usePiSession(sessionId: string | undefined) {
  const clientRef = useRef<PiSessionClient | null>(null);
  const [state, setState] = useState(DEFAULT_PI_STATE);

  useEffect(() => {
    if (!sessionId) {
      setState(DEFAULT_PI_STATE);
      return;
    }
    
    // Create new client for this session using path-based connection
    const client = PiSessionClient.fromSessionFile(sessionId);
    clientRef.current = client;
    
    // Subscribe to state changes
    const unsubscribeState = client.subscribe((newState) => {
      setState(newState);
    });
    
    // Connect after subscribing
    client.connect();

    return () => {
      unsubscribeState();
      client.disconnect();
      clientRef.current = null;
    };
  }, [sessionId]);

  return { client: clientRef.current, state };
}

export function Session() {
  const { id: sessionId } = useParams<{ id: string }>();
  const { onOpenSidebar, onOpenDiffPanel } = useOutletContext<LayoutContext>();
  
  const { client, state: piState } = usePiSession(sessionId);
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingMessage, setStreamingMessage] = useState<Message | null>(null);
  const [inputPadding, setInputPadding] = useState(96);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputWrapRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<ProseMirrorEditorRef>(null);
  const autoScrollRef = useRef(true);
  const prevLoadingRef = useRef(false);
  const streamingCommittedRef = useRef(false);
  const initialLoadRef = useRef(true);

  const terminalPanelStorageKey = sessionId ? `pi-terminal-panel:${sessionId}` : null;

  useEffect(() => {
    if (!terminalPanelStorageKey || typeof window === 'undefined') {
      setTerminalOpen(false);
      return;
    }

    try {
      const raw = window.sessionStorage.getItem(terminalPanelStorageKey);
      if (!raw) {
        setTerminalOpen(false);
        return;
      }

      const parsed = JSON.parse(raw) as { open?: boolean };
      setTerminalOpen(Boolean(parsed.open));
    } catch {
      setTerminalOpen(false);
    }
  }, [terminalPanelStorageKey]);

  useEffect(() => {
    if (!terminalPanelStorageKey || typeof window === 'undefined') {
      return;
    }

    window.sessionStorage.setItem(
      terminalPanelStorageKey,
      JSON.stringify({ open: terminalOpen })
    );
  }, [terminalPanelStorageKey, terminalOpen]);

  // Convert models to Provider format for ChatInput
  const providers = useMemo((): Provider[] => {
    const grouped = new Map<string, Provider>();
    
    for (const model of piState.models) {
      const providerId = String(model.provider);
      let provider = grouped.get(providerId);
      
      if (!provider) {
        provider = {
          id: providerId,
          name: providerId.charAt(0).toUpperCase() + providerId.slice(1),
          models: [],
        };
        grouped.set(providerId, provider);
      }
      
      const capabilities: string[] = [];
      if (model.reasoning) capabilities.push('reasoning');
      if (model.input?.includes('image')) capabilities.push('vision');
      if (model.contextWindow) capabilities.push(`${Math.round(model.contextWindow / 1000)}k`);
      
      provider.models.push({
        id: model.id,
        name: model.name,
        capabilities,
      });
    }
    
    return Array.from(grouped.values());
  }, [piState.models]);

  const selectedModelId = piState.currentModel?.id;

  // Subscribe to events for user/assistant message boundaries
  useEffect(() => {
    if (!client) return;

    const handleEvent = (event: PiServerEvent) => {
      if (event.type === 'message_start') {
        const msgEvent = event as {
          type: 'message_start';
          message?: { role?: string; content?: unknown; timestamp?: number };
        };

        if (msgEvent.message?.role === 'user') {
          let text = '';
          const images: MessageImage[] = [];
          const content = msgEvent.message.content;

          if (Array.isArray(content)) {
            for (const block of content) {
              const typedBlock = block as { type?: string; text?: string; data?: string; mimeType?: string };
              if (typedBlock.type === 'text') {
                text += typedBlock.text || '';
              } else if (typedBlock.type === 'image') {
                images.push({
                  data: typedBlock.data || '',
                  mimeType: typedBlock.mimeType || 'image/png',
                });
              }
            }
          } else if (typeof content === 'string') {
            text = content;
          }

          setMessages(prev => {
            const eventTs = msgEvent.message?.timestamp || Date.now();
            const exists = prev.some(m =>
              m.role === 'user' &&
              m.text === text &&
              m.timestamp.getTime() === eventTs
            );
            if (exists) return prev;

            return [...prev, {
              id: newMessageId(),
              role: 'user',
              text,
              attachments: [],
              images: images.length > 0 ? images : undefined,
              mentions: [],
              timestamp: new Date(eventTs),
            }];
          });
        }
      }

      if (event.type === 'message_update') {
        const updateEvent = event as {
          type: 'message_update';
          assistantMessageEvent?: { type?: string };
        };
        if (updateEvent.assistantMessageEvent?.type === 'error') {
          streamingCommittedRef.current = true;
          setStreamingMessage(null);
        }
      }

      if (event.type === 'error') {
        streamingCommittedRef.current = true;
        setStreamingMessage(null);
      }

      if (event.type === 'message_end') {
        const msgEndEvent = event as {
          type: 'message_end';
          message?: { role?: string; content?: unknown; timestamp?: number };
        };

        if (msgEndEvent.message?.role === 'assistant' && msgEndEvent.message.content) {
          const parsed = parseMessageContent(msgEndEvent.message.content);
          const assistantMessage: Message = {
            id: newMessageId(),
            role: 'assistant',
            text: parsed.text,
            thinkingBlocks: parsed.thinkingBlocks.length > 0 ? parsed.thinkingBlocks : undefined,
            toolCalls: parsed.toolCalls.length > 0 ? parsed.toolCalls : undefined,
            contentOrder: parsed.contentOrder.length > 0 ? parsed.contentOrder : undefined,
            attachments: [],
            mentions: [],
            images: parsed.images.length > 0 ? parsed.images : undefined,
            timestamp: new Date(msgEndEvent.message.timestamp || Date.now()),
          };

          streamingCommittedRef.current = true;
          setStreamingMessage(null);
          setMessages(prev => [...prev, assistantMessage]);
        }
      }
    };

    const unsubscribe = client.subscribeToEvents(handleEvent);
    return () => unsubscribe();
  }, [client]);

  // Update streaming message from piState
  useEffect(() => {
    if (piState.isLoading) {
      if (!prevLoadingRef.current) {
        streamingCommittedRef.current = false;
      }

      if (streamingCommittedRef.current) {
        prevLoadingRef.current = piState.isLoading;
        return;
      }

      const hasContent = piState.streamingText || piState.streamingThinkingBlocks.length > 0 || piState.streamingToolCalls.size > 0;
      if (hasContent) {
        const messageId = piState.streamingMessageId || 'streaming';
        setStreamingMessage({
          id: messageId,
          role: 'assistant',
          text: piState.streamingText,
          thinkingBlocks: piState.streamingThinkingBlocks.length > 0 ? [...piState.streamingThinkingBlocks] : undefined,
          toolCalls: Array.from(piState.streamingToolCalls.values()),
          contentOrder: [...piState.streamingContentOrder],
          attachments: [],
          mentions: [],
          timestamp: new Date(),
        });
      }
    } else if (prevLoadingRef.current && !piState.isLoading && !streamingCommittedRef.current) {
      // Fallback commit if message_end was not received
      streamingCommittedRef.current = true;
      setStreamingMessage(prev => {
        if (prev && (prev.text || prev.thinkingBlocks?.length || prev.toolCalls?.length)) {
          setMessages(msgs => [...msgs, prev]);
        }
        return null;
      });
    }

    prevLoadingRef.current = piState.isLoading;
  }, [piState.isLoading, piState.streamingMessageId, piState.streamingText, piState.streamingThinkingBlocks, piState.streamingToolCalls.size, piState.streamingContentOrder]);

  const loadHistory = useCallback(async () => {
    if (!sessionId) {
      setIsLoadingHistory(false);
      return;
    }

    setIsLoadingHistory(true);
    setHistoryError(null);

    try {
      const entries = await api.getSessionMessages(sessionId);
      const loadedMessages: Message[] = [];
      const toolResultsMap = new Map<string, { content: unknown; isError: boolean }>();

      for (const entry of entries) {
        if (entry.type === 'message' && entry.message) {
          const msg = entry.message as { role: string; toolCallId?: string; content: unknown; isError?: boolean };
          if (msg.role === 'toolResult' && msg.toolCallId) {
            toolResultsMap.set(msg.toolCallId, {
              content: msg.content,
              isError: msg.isError || false,
            });
          }
        }
      }

      for (const entry of entries) {
        if (entry.type === 'message' && entry.message) {
          const msg = entry.message;
          const parsed = parseMessageContent(msg.content);

          if (msg.role === 'user' || msg.role === 'assistant') {
            const toolCallsWithResults = parsed.toolCalls.map(tc => {
              const result = toolResultsMap.get(tc.id);
              if (result) {
                const resultContent = Array.isArray(result.content)
                  ? result.content
                  : [{ type: 'text', text: String(result.content) }];
                return {
                  ...tc,
                  result: { content: resultContent },
                  isError: result.isError,
                  isRunning: false,
                };
              }
              return tc;
            });

            loadedMessages.push({
              id: entry.id,
              role: msg.role,
              text: parsed.text,
              thinkingBlocks: parsed.thinkingBlocks.length > 0 ? parsed.thinkingBlocks : undefined,
              toolCalls: toolCallsWithResults.length > 0 ? toolCallsWithResults : undefined,
              contentOrder: parsed.contentOrder.length > 0 ? parsed.contentOrder : undefined,
              attachments: [],
              images: parsed.images.length > 0 ? parsed.images : undefined,
              mentions: [],
              timestamp: new Date(entry.timestamp),
            });
          }
        }
      }

      setMessages(loadedMessages);
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      }
      setIsLoadingHistory(false);
    } catch (err) {
      console.error('Failed to load session history:', err);
      setHistoryError('Failed to load session history');
      setIsLoadingHistory(false);
    }
  }, [sessionId]);

  useEffect(() => {
    setMessages([]);
    setStreamingMessage(null);
    setHistoryError(null);
    streamingCommittedRef.current = false;
    initialLoadRef.current = true;

    if (!sessionId) {
      setIsLoadingHistory(false);
      return;
    }

    void loadHistory();
  }, [sessionId, loadHistory]);

  const handleRefreshMessages = useCallback(() => {
    if (!sessionId || isLoadingHistory || piState.isLoading) {
      return;
    }
    void loadHistory();
  }, [sessionId, isLoadingHistory, piState.isLoading, loadHistory]);

  const scrollToBottom = (behavior: ScrollBehavior = 'auto') => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior });
  };

  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - (container.scrollTop + container.clientHeight);
    autoScrollRef.current = distanceFromBottom < 80;
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
    // Skip scroll on initial load - history loading handles its own scroll
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      return;
    }
    if (autoScrollRef.current && !isLoadingHistory) {
      requestAnimationFrame(() => scrollToBottom('smooth'));
    }
  }, [messages, streamingMessage, isLoadingHistory]);

  const handleSend = useCallback(async ({ text, attachments, mentions: _mentions }: { text: string; markdown: string; attachments: Attachment[]; mentions: string[] }) => {
    if (!client) return;

    // Convert image attachments to base64
    const imageAttachments: ImageAttachment[] = [];
    for (const att of attachments) {
      if (att.type === 'image' && att.file) {
        const base64 = await fileToBase64(att.file);
        imageAttachments.push({
          type: 'image',
          data: base64,
          mimeType: att.file.type,
          name: att.name,
        });
      }
    }


    autoScrollRef.current = true;
    client.prompt(text, imageAttachments);
  }, [client]);

  const handleSlashCommand = (command: SlashCommand) => {
    if (command.id === 'clear') {
      setMessages([]);
    } else if (command.id === 'help') {
      const helpMessage: Message = {
        id: newMessageId(),
        role: 'assistant',
        text: `Commands: /help, /clear, /model\n\nMentions: @file, @codebase, @web, @docs`,
        attachments: [],
        mentions: [],
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, helpMessage]);
    }
  };

  const handleModelChange = useCallback((modelId: string) => {
    // Find the provider for this model
    const model = piState.models.find(m => m.id === modelId);
    if (model && client) {
      client.setModel(String(model.provider), modelId);
    }
  }, [client, piState.models]);

  const handleStop = useCallback(() => {
    client?.abort();
  }, [client]);

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
            <span className="font-medium text-sm">Assistant</span>
            {!piState.isConnected && (
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
              onClick={handleRefreshMessages}
              disabled={isLoadingHistory || piState.isLoading}
              className={cn(
                "flex items-center gap-1 transition-colors",
                isLoadingHistory || piState.isLoading
                  ? "text-muted-foreground/50 cursor-not-allowed"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title={piState.isLoading ? 'Wait for response to finish' : 'Refresh messages'}
            >
              <RefreshCw className={cn("w-3 h-3", isLoadingHistory && "animate-spin")} />
              <span className="hidden sm:inline">Refresh</span>
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

      {(piState.error || historyError) && (
        <div className="max-w-2xl mx-auto px-4 pb-2 space-y-2">
          {piState.error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {piState.error}
            </div>
          )}
          {historyError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {historyError}
            </div>
          )}
        </div>
      )}

      <main
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden relative"
        onScroll={handleScroll}
        style={{ scrollPaddingBottom: inputPadding }}
      >
        <MessageShimmer visible={isLoadingHistory} />
        <div
          className="max-w-3xl mx-auto px-4 py-6 space-y-4 min-h-full"
          style={{ paddingBottom: inputPadding }}
        >
          {messages.length === 0 && !streamingMessage && !piState.isLoading && !isLoadingHistory ? (
            <div className="h-full flex flex-col items-center justify-center text-center min-h-[50vh]">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mb-4">
                <FileText className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-sm mb-6">Start a conversation</p>
              <div className="flex gap-2 text-xs text-muted-foreground">
                <span className="px-2 py-1 bg-muted/50 rounded">/commands</span>
                <span className="px-2 py-1 bg-muted/50 rounded">@mentions</span>
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <MessageBubble 
                  key={msg.id} 
                  message={msg} 
                />
              ))}
              {streamingMessage && (streamingMessage.text || streamingMessage.thinkingBlocks?.length || streamingMessage.toolCalls?.length) && (
                <MessageBubble 
                  key="streaming"
                  message={streamingMessage} 
                  isThinkingStreaming={piState.isLoading && !piState.streamingText}
                  isStreaming={true}
                />
              )}
            </>
          )}
          {piState.isLoading && (!streamingMessage?.text && !streamingMessage?.thinkingBlocks?.length && !streamingMessage?.toolCalls?.length) && (
            <div className="flex items-center gap-1.5 py-2 animate-in fade-in-0">
              <span className="w-1 h-1 bg-muted-foreground/40 rounded-full animate-pulse" />
              <span className="w-1 h-1 bg-muted-foreground/40 rounded-full animate-pulse [animation-delay:150ms]" />
              <span className="w-1 h-1 bg-muted-foreground/40 rounded-full animate-pulse [animation-delay:300ms]" />
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
            onStop={handleStop}
            mentions={defaultMentions}
            providers={providers}
            selectedModel={selectedModelId}
            onModelChange={handleModelChange}
            loading={piState.isLoading}
            placeholder={piState.isConnected ? "Message..." : "Connecting..."}
          />
        </div>
      </div>

      {terminalOpen && (
        <TerminalPanel
          key={sessionId}
          isOpen={terminalOpen}
          onClose={() => setTerminalOpen(false)}
          sessionPath={sessionId}
        />
      )}
    </>
  );
}
