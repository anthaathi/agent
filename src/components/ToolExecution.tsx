import { useState, useMemo, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface ToolExecutionProps {
  toolName: string;
  toolCallId: string;
  arguments?: Record<string, unknown>;
  result?: {
    content: { type: string; text?: string }[];
    details?: unknown;
  };
  isError?: boolean;
  isRunning?: boolean;
  startTime?: number;
  endTime?: number;
}

function formatDuration(start?: number, end?: number): string | null {
  if (!start) return null;
  const ms = (end || Date.now()) - start;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatPath(path: string): string {
  const parts = path.split('/');
  if (parts.length <= 3) return path;
  return '.../' + parts.slice(-2).join('/');
}

function WritingAnimation({ content, isRunning }: { content: string; isRunning: boolean }) {
  const lines = useMemo(() => content.split('\n'), [content]);
  const prevContentLengthRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when content grows
  useEffect(() => {
    if (content.length > prevContentLengthRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
    prevContentLengthRef.current = content.length;
  }, [content]);

  const lastLineIdx = lines.length - 1;

  return (
    <div 
      ref={containerRef}
      className="font-mono text-[10px] leading-relaxed max-h-72 overflow-y-auto"
    >
      {lines.map((line, idx) => {
        const isLastLine = idx === lastLineIdx;
        const isNewLine = isRunning && isLastLine;
        
        return (
          <div 
            key={idx} 
            className={cn(
              "flex",
              isNewLine && "text-green-400",
              isNewLine && "animate-in fade-in-0 duration-100"
            )}
          >
            <span className="text-muted-foreground/40 select-none w-6 inline-block text-right mr-2 shrink-0">
              {idx + 1}
            </span>
            <span className="whitespace-pre-wrap break-all">{line || '\u00A0'}</span>
            {isNewLine && isRunning && (
              <span className="inline-block w-1.5 h-3.5 bg-green-400 ml-0.5 animate-[pulse_0.4s_ease-in-out_infinite] shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function DiffView({ oldText, newText, path }: { oldText: string; newText: string; path: string }) {
  const diff = useMemo(() => {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    const result: { type: 'add' | 'remove' | 'context'; line: string }[] = [];
    
    // Simple line-by-line diff
    let i = 0, j = 0;
    
    while (i < oldLines.length || j < newLines.length) {
      if (i >= oldLines.length) {
        result.push({ type: 'add', line: newLines[j++] });
      } else if (j >= newLines.length) {
        result.push({ type: 'remove', line: oldLines[i++] });
      } else if (oldLines[i] === newLines[j]) {
        result.push({ type: 'context', line: oldLines[i] });
        i++; j++;
      } else {
        // Look ahead to find matching lines
        let foundOld = -1, foundNew = -1;
        for (let k = 1; k < 5 && (i + k < oldLines.length || j + k < newLines.length); k++) {
          if (foundNew === -1 && j + k < newLines.length && oldLines[i] === newLines[j + k]) foundNew = k;
          if (foundOld === -1 && i + k < oldLines.length && oldLines[i + k] === newLines[j]) foundOld = k;
        }
        
        if (foundNew !== -1 && (foundOld === -1 || foundNew <= foundOld)) {
          for (let k = 0; k < foundNew; k++) result.push({ type: 'add', line: newLines[j++] });
        } else if (foundOld !== -1) {
          for (let k = 0; k < foundOld; k++) result.push({ type: 'remove', line: oldLines[i++] });
        } else {
          result.push({ type: 'remove', line: oldLines[i++] });
          result.push({ type: 'add', line: newLines[j++] });
        }
      }
    }
    
    // Collapse long context sections
    const collapsed: typeof result = [];
    let contextCount = 0;
    for (const item of result) {
      if (item.type === 'context') {
        contextCount++;
        if (contextCount <= 2) collapsed.push(item);
        else if (contextCount === 3) collapsed.push({ type: 'context', line: '...' });
      } else {
        if (contextCount > 3) {
          // Show last context line before change
          const lastContext = result[result.indexOf(item) - 1];
          if (lastContext?.type === 'context' && lastContext.line !== '...') {
            collapsed.push(lastContext);
          }
        }
        contextCount = 0;
        collapsed.push(item);
      }
    }
    
    return collapsed;
  }, [oldText, newText]);

  const additions = diff.filter(d => d.type === 'add').length;
  const deletions = diff.filter(d => d.type === 'remove').length;
  const fileName = path.split('/').pop() || path;

  return (
    <div className="rounded-md overflow-hidden border border-border/40">
      <div className="flex items-center justify-between px-2 py-1 bg-muted/50 border-b border-border/40">
        <span className="text-[10px] text-foreground/70 font-medium">{fileName}</span>
        <div className="flex items-center gap-2 text-[10px]">
          {additions > 0 && <span className="text-green-500 font-medium">+{additions}</span>}
          {deletions > 0 && <span className="text-red-500 font-medium">-{deletions}</span>}
        </div>
      </div>
      <div className="overflow-x-auto max-h-60 text-[11px] font-mono bg-background/50">
        {diff.map((d, i) => (
          <div
            key={i}
            className={cn(
              "px-2 py-px border-l-2",
              d.type === 'add' && "bg-green-500/10 border-l-green-500",
              d.type === 'remove' && "bg-red-500/10 border-l-red-500",
              d.type === 'context' && "border-l-transparent text-muted-foreground"
            )}
          >
            <span className={cn(
              "inline-block w-4 select-none",
              d.type === 'add' && "text-green-500",
              d.type === 'remove' && "text-red-500",
              d.type === 'context' && "text-muted-foreground/30"
            )}>
              {d.type === 'add' ? '+' : d.type === 'remove' ? '−' : ' '}
            </span>
            <span className={cn(
              d.type === 'add' && "text-green-400",
              d.type === 'remove' && "text-red-400"
            )}>
              {d.line || '\u00A0'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ToolExecution({ toolName, arguments: args, result, isError, isRunning, startTime, endTime }: ToolExecutionProps) {
  const [expanded, setExpanded] = useState(false);
  const wasRunningRef = useRef(false);

  // Auto-expand when tool starts running (especially for write)
  useEffect(() => {
    if (isRunning && !wasRunningRef.current) {
      if (toolName === 'write' || toolName === 'edit') {
        setExpanded(true);
      }
    }
    wasRunningRef.current = isRunning || false;
  }, [isRunning, toolName]);

  const getSummary = () => {
    if (!args) return '';
    if (toolName === 'bash') return String(args.command || '').slice(0, 60);
    if (toolName === 'read' || toolName === 'write' || toolName === 'edit') return formatPath(String(args.path || ''));
    if (toolName === 'grep') return `"${args.pattern}"`;
    return '';
  };

  const resultText = result?.content
    ?.filter((c): c is { type: 'text'; text: string } => c.type === 'text' && !!c.text)
    .map(c => c.text)
    .join('\n');

  const summary = getSummary();
  const duration = formatDuration(startTime, endTime);

  return (
    <div className={cn("text-[11px] font-mono", isError && "text-red-400")}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-left w-full py-0.5"
      >
        <span className={cn("shrink-0 w-3 text-center", isRunning && "animate-pulse")}>
          {isRunning ? '●' : isError ? '✗' : result ? '✓' : '○'}
        </span>
        <span className="text-foreground/70">{toolName}</span>
        {summary && <span className="truncate opacity-50">{summary}</span>}
        {duration && <span className="ml-auto opacity-30 text-[10px] tabular-nums">{duration}</span>}
      </button>

      {expanded && (
        <div className="mt-1 ml-4 mb-2">
          {toolName === 'edit' && args?.oldText && args?.newText ? (
            <DiffView 
              oldText={String(args.oldText)} 
              newText={String(args.newText)} 
              path={String(args.path || '')}
            />
          ) : toolName === 'bash' && args?.command ? (
            <div className="rounded-md overflow-hidden border border-border/40">
              <div className="px-2 py-1 bg-muted/50 border-b border-border/40">
                <code className="text-[10px] text-foreground/70">$ {String(args.command)}</code>
              </div>
              {resultText && (
                <pre className={cn(
                  "px-2 py-1.5 text-[10px] overflow-x-auto max-h-60 whitespace-pre-wrap bg-background/50",
                  isError && "text-red-400"
                )}>
                  {resultText}
                </pre>
              )}
            </div>
          ) : toolName === 'read' && resultText ? (
            <div className="rounded-md overflow-hidden border border-border/40">
              <div className="px-2 py-1 bg-muted/50 border-b border-border/40">
                <span className="text-[10px] text-foreground/70">{formatPath(String(args?.path || ''))}</span>
              </div>
              <pre className="px-2 py-1.5 text-[10px] overflow-x-auto max-h-60 whitespace-pre-wrap bg-background/50">
                {resultText}
              </pre>
            </div>
          ) : toolName === 'write' && args?.content ? (
            <div className="rounded-md overflow-hidden border border-border/40">
              <div className="px-2 py-1 bg-muted/50 border-b border-border/40 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-foreground/70">{formatPath(String(args?.path || ''))}</span>
                  <span className="text-[9px] text-muted-foreground">
                    {String(args.content).split('\n').length} lines
                  </span>
                </div>
                {isRunning ? (
                  <span className="text-[10px] text-green-400 flex items-center gap-1.5">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                    </span>
                    writing
                  </span>
                ) : (
                  <span className="text-[10px] text-green-500 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    saved
                  </span>
                )}
              </div>
              <div className="px-2 py-2 overflow-x-auto bg-background/50">
                {isRunning ? (
                  <WritingAnimation content={String(args.content)} isRunning={isRunning} />
                ) : (
                  <pre className="text-[10px] whitespace-pre-wrap">{String(args.content)}</pre>
                )}
              </div>
            </div>
          ) : (
            <div className={cn(
              "rounded-md p-2 text-[10px]",
              isError ? "bg-red-500/10 border border-red-500/20" : "bg-muted/30"
            )}>
              {args && Object.keys(args).length > 0 && !resultText && (
                <div className="space-y-0.5">
                  {Object.entries(args).map(([key, value]) => (
                    <div key={key}>
                      <span className="text-muted-foreground">{key}: </span>
                      <span className="text-foreground/80 whitespace-pre-wrap">
                        {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {resultText && (
                <pre className={cn(
                  "overflow-x-auto max-h-60 whitespace-pre-wrap",
                  isError && "text-red-400"
                )}>
                  {resultText}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ThinkingBlockProps {
  thinking: string;
  isStreaming?: boolean;
  className?: string;
}

export function ThinkingBlock({ thinking, isStreaming = false, className }: ThinkingBlockProps) {
  const [isExpanded, setIsExpanded] = useState(isStreaming);
  const wasStreamingRef = useRef(isStreaming);
  
  // Open when streaming starts, auto-collapse when streaming ends
  useEffect(() => {
    if (isStreaming && !wasStreamingRef.current) {
      setIsExpanded(true);
    } else if (wasStreamingRef.current && !isStreaming && thinking) {
      const timer = setTimeout(() => {
        setIsExpanded(false);
      }, 500);
      return () => clearTimeout(timer);
    }
    wasStreamingRef.current = isStreaming;
  }, [isStreaming, thinking]);

  if (!thinking) return null;

  return (
    <div className={cn("text-[11px]", className)}>
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors mb-1"
      >
        {isStreaming && (
          <span className="inline-block w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
        )}
        <span>thinking</span>
      </button>
      
      {isExpanded && (
        <div className="mb-2 p-2 rounded-md bg-muted/30 border border-border/40 text-[11px] text-muted-foreground max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed">
          {thinking}
          {isStreaming && (
            <span className="inline-block w-1 h-3 bg-primary/50 ml-0.5 animate-pulse" />
          )}
        </div>
      )}
    </div>
  );
}

interface ToolGroupProps {
  tools: ToolExecutionProps[];
  thinking?: string;
  isStreaming?: boolean;
  className?: string;
}

export function ToolGroup({ tools, thinking, isStreaming = false, className }: ToolGroupProps) {
  if (tools.length === 0 && !thinking) return null;

  const allComplete = tools.every(t => t.result || t.isError);
  const runningCount = tools.filter(t => t.isRunning).length;

  const getTotalDuration = () => {
    const starts = tools.map(t => t.startTime).filter(Boolean) as number[];
    const ends = tools.map(t => t.endTime).filter(Boolean) as number[];
    if (starts.length === 0) return null;
    const start = Math.min(...starts);
    const end = ends.length > 0 ? Math.max(...ends) : Date.now();
    const ms = end - start;
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const duration = allComplete && tools.length > 0 ? getTotalDuration() : null;

  return (
    <div className={cn("text-[11px]", className)}>
      {thinking && (
        <ThinkingBlock thinking={thinking} isStreaming={isStreaming} />
      )}
      
      {tools.length > 0 && (
        <div>
          {tools.length > 1 && (
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-0.5">
              <span className="opacity-60">
                {runningCount > 0 ? `running ${runningCount}...` : `${tools.length} tools`}
              </span>
              {duration && <span className="opacity-40 ml-auto">{duration}</span>}
            </div>
          )}
          {tools.map(tool => (
            <ToolExecution key={tool.toolCallId} {...tool} />
          ))}
        </div>
      )}
    </div>
  );
}
