import { useRef, useState, useCallback, useEffect, useLayoutEffect, forwardRef, useImperativeHandle, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp, Paperclip, Image, FileText, File as FileIcon, FileCode, FileArchive, FileVideo, FileAudio, FileSpreadsheet, AlertCircle, ChevronDown, Loader2, X, Globe, FolderTree, FileSearch, Terminal, AtSign, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { ProseMirrorEditor, type ProseMirrorEditorRef, type TriggerInfo } from './ProseMirrorEditor';
import { useAttachments } from './useAttachments';
import type { ChatInputProps, Attachment, Provider, SlashCommand, MentionItem } from './types';

const defaultProviders: Provider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', capabilities: ['vision', '128k'] },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', capabilities: ['vision', '128k'] },
      { id: 'o1-preview', name: 'o1 Preview', capabilities: ['reasoning', '128k'] },
      { id: 'o1-mini', name: 'o1 Mini', capabilities: ['reasoning', '128k'] },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    models: [
      { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', capabilities: ['vision', '200k'] },
      { id: 'claude-3-5-haiku', name: 'Claude 3.5 Haiku', capabilities: ['200k'] },
      { id: 'claude-3-opus', name: 'Claude 3 Opus', capabilities: ['vision', '200k'] },
    ],
  },
  {
    id: 'google',
    name: 'Google',
    models: [
      { id: 'gemini-1-5-pro', name: 'Gemini 1.5 Pro', capabilities: ['vision', '2m'] },
      { id: 'gemini-1-5-flash', name: 'Gemini 1.5 Flash', capabilities: ['vision', '1m'] },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek V3', capabilities: ['64k'] },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1', capabilities: ['reasoning', '64k'] },
    ],
  },
];

const defaultSlashCommands: SlashCommand[] = [
  { id: 'help', name: 'help', description: 'Show available commands', shortcut: '/help' },
  { id: 'clear', name: 'clear', description: 'Clear conversation history', shortcut: '/clear' },
  { id: 'compact', name: 'compact', description: 'Toggle compact mode', shortcut: '/compact' },
  { id: 'model', name: 'model', description: 'Change the AI model', shortcut: '/model' },
  { id: 'edit', name: 'edit', description: 'Edit a file', shortcut: '/edit' },
  { id: 'run', name: 'run', description: 'Run a command', shortcut: '/run' },
  { id: 'search', name: 'search', description: 'Search in codebase', shortcut: '/search' },
  { id: 'settings', name: 'settings', description: 'Open settings', shortcut: '/settings' },
];

const defaultMentions: MentionItem[] = [
  { id: 'file', name: 'file', description: 'Reference a specific file', icon: 'FileText', color: '' },
  { id: 'codebase', name: 'codebase', description: 'Search entire codebase', icon: 'FolderTree', color: '' },
  { id: 'web', name: 'web', description: 'Search the web', icon: 'Globe', color: '' },
  { id: 'docs', name: 'docs', description: 'Search documentation', icon: 'FileSearch', color: '' },
];

const MentionIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  FileText,
  FolderTree,
  Globe,
  FileSearch,
};

function createFileList(files: File[]): FileList {
  const dt = new DataTransfer();
  files.forEach(f => dt.items.add(f));
  return dt.files;
}

function getFileIconAndColor(filename: string, mimeType: string): { icon: string; color: string } {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  
  // Images
  if (mimeType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) {
    return { icon: 'Image', color: 'text-blue-500' };
  }
  
  // Code files
  if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'go', 'rs', 'php', 'rb'].includes(ext)) {
    return { icon: 'FileCode', color: 'text-yellow-500' };
  }
  
  // Documents
  if (['pdf'].includes(ext) || mimeType === 'application/pdf') {
    return { icon: 'FileText', color: 'text-red-500' };
  }
  if (['doc', 'docx'].includes(ext)) {
    return { icon: 'FileText', color: 'text-blue-600' };
  }
  if (['xls', 'xlsx', 'csv'].includes(ext)) {
    return { icon: 'FileSpreadsheet', color: 'text-green-600' };
  }
  
  // Archives
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
    return { icon: 'FileArchive', color: 'text-orange-500' };
  }
  
  // Video/Audio
  if (mimeType.startsWith('video/') || ['mp4', 'mov', 'avi', 'mkv'].includes(ext)) {
    return { icon: 'FileVideo', color: 'text-purple-500' };
  }
  if (mimeType.startsWith('audio/') || ['mp3', 'wav', 'ogg'].includes(ext)) {
    return { icon: 'FileAudio', color: 'text-pink-500' };
  }
  
  return { icon: 'FileIcon', color: 'text-muted-foreground' };
}

const FileIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  FileIcon,
  FileText,
  FileCode,
  FileArchive,
  FileVideo,
  FileAudio,
  FileSpreadsheet,
  Image,
};

function AttachmentPreview({ attachment, onRemove }: { attachment: Attachment; onRemove: () => void }) {
  const { icon, color } = getFileIconAndColor(attachment.name, attachment.file.type);
  const IconComponent = FileIconMap[icon] || FileIcon;

  return (
    <div className="group relative flex items-center gap-2.5 px-3 py-2 bg-secondary rounded-md border border-border">
      <div className="w-8 h-8 rounded bg-background flex items-center justify-center">
        <IconComponent className={cn('w-4 h-4', color)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate text-foreground">{attachment.name}</p>
        <p className="text-[10px] text-muted-foreground">{(attachment.size / 1024).toFixed(0)} KB</p>
      </div>
      {attachment.status === 'uploading' && (
        <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
      )}
      {attachment.status === 'error' && (
        <AlertCircle className="w-3.5 h-3.5 text-destructive" />
      )}
      <button
        onClick={onRemove}
        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-background rounded transition-opacity"
      >
        <X className="w-3 h-3 text-foreground" />
      </button>
    </div>
  );
}

function ModelSelector({ providers, selectedModel, onChange }: { providers: Provider[]; selectedModel: string; onChange: (modelId: string) => void }) {
  const [open, setOpen] = useState(false);

  const selected = useMemo(() => {
    for (const provider of providers) {
      const model = provider.models.find(m => m.id === selectedModel);
      if (model) return { provider, model };
    }
    return providers[0]?.models[0] ? { provider: providers[0], model: providers[0].models[0] } : null;
  }, [providers, selectedModel]);

  const handleSelect = useCallback((modelId: string) => {
    onChange(modelId);
    setOpen(false);
  }, [onChange]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
      >
        <span className="font-medium">{selected?.provider.name} / {selected?.model.name}</span>
        <ChevronDown className="w-3 h-3 opacity-50" />
      </button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Select Model" description="Choose a model">
        <CommandInput placeholder="Search models..." />
        <CommandList className="max-h-[320px]">
          <CommandEmpty>No models found.</CommandEmpty>
          {providers.map((provider) => (
            <CommandGroup key={provider.id} heading={provider.name}>
              {provider.models.map((model) => (
                <CommandItem
                  key={model.id}
                  value={`${provider.name} ${model.name} ${model.id}`}
                  onSelect={() => handleSelect(model.id)}
                  className="py-1.5 px-2 text-sm"
                >
                  <span className={cn('flex-1', selectedModel === model.id && 'text-primary')}>
                    {model.name}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {model.capabilities?.join(' · ')}
                  </span>
                  {selectedModel === model.id && (
                    <span className="text-[10px] text-primary ml-2">●</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}

interface TriggerMenuProps {
  type: 'slash' | 'mention';
  query: string;
  containerRect: DOMRect | null;
  docked: boolean;
  items: SlashCommand[] | MentionItem[];
  onSelect: (item: SlashCommand | MentionItem) => void;
  onClose: () => void;
}

function TriggerMenu({ type, query, containerRect, docked, items, onSelect, onClose }: TriggerMenuProps) {
  const filtered = items.filter(item => 
    item.name.toLowerCase().includes(query.toLowerCase()) || 
    item.description.toLowerCase().includes(query.toLowerCase())
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuHeight, setMenuHeight] = useState(0);

  useEffect(() => { setSelectedIndex(0); }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedIndex]);

  useLayoutEffect(() => {
    if (!menuRef.current) return;
    const nextHeight = menuRef.current.getBoundingClientRect().height;
    setMenuHeight(nextHeight);
  }, [filtered.length, query, docked]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!containerRect) return;
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex(prev => Math.min(prev + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        if (filtered[selectedIndex]) {
          onSelect(filtered[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [filtered, selectedIndex, onSelect, onClose, containerRect]);

  if (!containerRect || filtered.length === 0) return null;

  const gap = docked ? 0 : 8;
  const seamOverlap = docked ? 1 : 0;
  const top = Math.round(containerRect.top - menuHeight - gap + seamOverlap);
  const left = Math.round(containerRect.left);
  const width = Math.round(containerRect.width);

  return createPortal(
    <div
      className="fixed z-[9999]"
      style={{ top, left, width, visibility: menuHeight ? 'visible' : 'hidden' }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div
        ref={menuRef}
        className={cn(
          'bg-muted/40 border border-border/40 rounded-2xl overflow-hidden w-full max-h-[400px] overflow-y-auto',
          docked && 'bg-muted/60 rounded-b-none border-b-0'
        )}
      >
        <div
          className={cn(
            'flex items-center gap-2 px-4 py-2 border-b border-border/30 bg-muted/30',
            docked && 'bg-muted/60'
          )}
        >
          {type === 'slash' ? (
            <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <AtSign className="w-3.5 h-3.5 text-muted-foreground" />
          )}
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            {type === 'slash' ? 'Commands' : 'Mentions'}
          </span>
        </div>
        <div>
          {filtered.map((item, index) => {
            const isSlashCommand = 'shortcut' in item;
            const Icon = isSlashCommand ? Terminal : MentionIconMap[(item as MentionItem).icon] || FileText;
            
            return (
              <button
                key={item.id}
                ref={selectedIndex === index ? selectedRef : null}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(item);
                }}
                onMouseEnter={() => setSelectedIndex(index)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/60',
                  selectedIndex === index ? 'bg-muted' : ''
                )}
              >
                <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0 flex items-center gap-3">
                  <span className="text-sm font-medium font-mono shrink-0">
                    {type === 'slash' ? '/' : '@'}{item.name}
                  </span>
                  <span className="text-xs text-muted-foreground truncate">{item.description}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}

export const ChatInput = forwardRef<ProseMirrorEditorRef, ChatInputProps>(function ChatInput({
  providers = defaultProviders,
  selectedModel: propSelectedModel,
  onModelChange,
  onSend,
  onStop,
  onSlashCommand,
  onMention,
  slashCommands = defaultSlashCommands,
  mentions = defaultMentions,
  placeholder = 'Message...',
  disabled = false,
  loading = false,
  maxFileSize,
  allowedFileTypes,
  className,
}: ChatInputProps, ref) {
  const [selectedModel, setSelectedModel] = useState(propSelectedModel || providers[0]?.models[0]?.id);

  // Update selected model when prop changes (e.g., after loading from session)
  useEffect(() => {
    if (propSelectedModel) {
      setSelectedModel(propSelectedModel);
    }
  }, [propSelectedModel]);
  const [content, setContent] = useState({ text: '', markdown: '' });
  const [triggerInfo, setTriggerInfo] = useState<TriggerInfo | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragCounter = useRef(0);
  
  const { attachments, addAttachments, removeAttachment, clearAttachments } = useAttachments({
    maxFileSize,
    allowedFileTypes,
    onError: console.error,
  });

  // Forward the ref to the ProseMirrorEditor
  const editorRef = useRef<ProseMirrorEditorRef>(null);

  useImperativeHandle(ref, () => ({
    focus: () => editorRef.current?.focus(),
    getContent: () => editorRef.current?.getContent() || { text: '', markdown: '' },
    clear: () => editorRef.current?.clear(),
    insertText: (text: string) => editorRef.current?.insertText(text),
    deleteBackward: (chars: number) => editorRef.current?.deleteBackward(chars),
  }), []);

  const handleModelChange = useCallback((modelId: string) => {
    setSelectedModel(modelId);
    onModelChange?.(modelId);
  }, [onModelChange]);

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    addAttachments(event.target.files);
    event.target.value = '';
    setTimeout(() => editorRef.current?.focus(), 0);
  }, [addAttachments]);

  const handleSend = useCallback(async () => {
    const editorContent = editorRef.current?.getContent() || content;
    if ((!editorContent.text.trim() && attachments.length === 0) || loading) return;
    
    await onSend?.({
      text: editorContent.text.trim(),
      markdown: editorContent.markdown,
      attachments: [...attachments],
      mentions: [],
    });
    
    clearAttachments();
    editorRef.current?.clear();
  }, [content, attachments, loading, onSend, clearAttachments]);

  const [containerRect, setContainerRect] = useState<DOMRect | null>(null);

  const handleTrigger = useCallback((info: TriggerInfo | null) => {
    if (info) {
      setTriggerInfo(info);
      if (containerRef.current) {
        setContainerRect(containerRef.current.getBoundingClientRect());
      }
    } else {
      setTriggerInfo(null);
    }
  }, []);

  const handleTriggerSelect = useCallback((item: SlashCommand | MentionItem) => {
    const queryLen = triggerInfo?.query.length || 0;
    
    if ('shortcut' in item) {
      editorRef.current?.deleteBackward(queryLen + 1);
      onSlashCommand?.(item);
    } else {
      // For mentions, just insert the text directly into the editor
      editorRef.current?.deleteBackward(queryLen + 1);
      editorRef.current?.insertText(`@${item.name} `);
      onMention?.(item);
    }
    
    setTriggerInfo(null);
    setTimeout(() => editorRef.current?.focus(), 0);
  }, [triggerInfo, onSlashCommand, onMention]);

  const handleTriggerClose = useCallback(() => {
    setTriggerInfo(null);
  }, []);

  const MAX_PASTE_LINES = 10;

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const files = e.clipboardData?.files;
      if (files && files.length > 0) {
        e.preventDefault();
        addAttachments(files);
        return;
      }
      const text = e.clipboardData?.getData('text');
      if (text) {
        const lineCount = text.split(/\r\n|\r|\n/).length;
        if (lineCount > MAX_PASTE_LINES) {
          e.preventDefault();
          const blob = new Blob([text], { type: 'text/plain' });
          const file = new File([blob], 'pasted-text.txt', { type: 'text/plain', lastModified: Date.now() });
          addAttachments(createFileList([file]));
        }
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [addAttachments]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDraggingOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) {
      setIsDraggingOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDraggingOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      addAttachments(files);
    }
  }, [addAttachments]);

  const hasContent = content.text.trim().length > 0 || attachments.length > 0;

  const isDocked = triggerInfo !== null;

  return (
    <div 
      ref={containerRef}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={cn(
        'relative bg-muted/40 rounded-2xl transition-all duration-200 border border-transparent',
        'focus-within:bg-muted/60 focus-within:border-border/40',
        isDocked && 'rounded-t-none border-t-0 border-border/40',
        isDraggingOver && 'bg-primary/5 border-primary/30',
        className
      )}
    >
      {isDraggingOver && (
        <div className="absolute inset-0 rounded-2xl border-2 border-dashed border-primary/50 bg-primary/5 flex items-center justify-center z-10 pointer-events-none">
          <span className="text-sm font-medium text-primary">Drop file to attach</span>
        </div>
      )}
      {triggerInfo && containerRect && (
        <TriggerMenu
          type={triggerInfo.type!}
          query={triggerInfo.query}
          containerRect={containerRect}
          docked={isDocked}
          items={triggerInfo.type === 'slash' ? slashCommands : mentions}
          onSelect={handleTriggerSelect}
          onClose={handleTriggerClose}
        />
      )}

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-2">
          {attachments.map(att => (
            <AttachmentPreview
              key={att.id}
              attachment={att}
              onRemove={() => removeAttachment(att.id)}
            />
          ))}
        </div>
      )}

      <ProseMirrorEditor
        ref={editorRef}
        placeholder={placeholder}
        disabled={disabled}
        onChange={setContent}
        onTrigger={handleTrigger}
        onSubmit={handleSend}
      />

      <div className="flex items-center justify-between px-2 pb-2">
        <div className="flex items-center">
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
          >
            <Paperclip className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => {
              if (fileInputRef.current) {
                fileInputRef.current.accept = 'image/*';
                fileInputRef.current.click();
                fileInputRef.current.accept = '';
              }
            }}
            disabled={disabled}
          >
            <Image className="w-4 h-4" />
          </Button>
        </div>
        
        <div className="flex items-center gap-2">
          <ModelSelector providers={providers} selectedModel={selectedModel} onChange={handleModelChange} />
          {loading ? (
            <Button
              size="icon"
              className="h-7 w-7 rounded-full bg-foreground text-background hover:bg-foreground/90 transition-transform active:scale-90"
              onClick={onStop}
            >
              <Square className="w-3 h-3 fill-current" />
            </Button>
          ) : (
            <Button
              size="icon"
              className={cn(
                'h-7 w-7 rounded-full transition-transform active:scale-90',
                hasContent 
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90' 
                  : 'bg-muted text-muted-foreground'
              )}
              onClick={handleSend}
              disabled={disabled}
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
});

ChatInput.displayName = 'ChatInput';

export default ChatInput;
