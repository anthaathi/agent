import type { TextContent, ThinkingContent, ToolCall, ImageContent } from '@/lib/api/pi-types';
import type { StreamingContentItem } from '@/lib/pi-session-client';

export interface ParsedMessage {
  text: string;
  thinkingBlocks: string[];
  toolCalls: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
  images: Array<{
    data: string;
    mimeType: string;
  }>;
  contentOrder: StreamingContentItem[];
}

type ContentBlock = TextContent | ThinkingContent | ToolCall | ImageContent | { type: string; [key: string]: unknown };

export function parseMessageContent(content: unknown): ParsedMessage {
  const result: ParsedMessage = {
    text: '',
    thinkingBlocks: [],
    toolCalls: [],
    images: [],
    contentOrder: [],
  };

  if (typeof content === 'string') {
    result.text = content;
    result.contentOrder.push({ type: 'text' });
    return result;
  }

  if (!Array.isArray(content)) {
    if (content && typeof content === 'object') {
      result.text = JSON.stringify(content, null, 2);
      result.contentOrder.push({ type: 'text' });
    }
    return result;
  }

  for (const block of content as ContentBlock[]) {
    if (!block || typeof block !== 'object') continue;

    switch (block.type) {
      case 'text':
        result.text += (block as TextContent).text || '';
        if (!result.contentOrder.some(c => c.type === 'text')) {
          result.contentOrder.push({ type: 'text' });
        }
        break;
      case 'thinking':
        const thinkingText = (block as ThinkingContent).thinking || '';
        if (thinkingText) {
          result.contentOrder.push({ type: 'thinking', index: result.thinkingBlocks.length });
          result.thinkingBlocks.push(thinkingText);
        }
        break;
      case 'toolCall':
        const tc = block as ToolCall;
        result.toolCalls.push({
          id: tc.id,
          name: tc.name,
          arguments: tc.arguments || {},
        });
        result.contentOrder.push({ type: 'toolCall', id: tc.id });
        break;
      case 'image':
        const img = block as ImageContent;
        result.images.push({
          data: img.data,
          mimeType: img.mimeType,
        });
        break;
      default:
        // Silently ignore unknown block types
        break;
    }
  }

  return result;
}

export function extractTextFromContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return (content as ContentBlock[])
    .filter((block): block is TextContent => block?.type === 'text')
    .map(block => block.text || '')
    .join('');
}
