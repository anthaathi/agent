import { useEffect, useRef, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import { EditorState, Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Schema, type NodeSpec } from 'prosemirror-model';
import { schema as basicSchema } from 'prosemirror-schema-basic';
import { history } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { inputRules, wrappingInputRule, textblockTypeInputRule, smartQuotes, emDash, ellipsis } from 'prosemirror-inputrules';
import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';
import { cn } from '@/lib/utils';

// Define list nodes with proper types
const nodes: Record<string, NodeSpec> = {
  doc: basicSchema.nodes.doc.spec,
  paragraph: basicSchema.nodes.paragraph.spec,
  text: basicSchema.nodes.text.spec,
  heading: basicSchema.nodes.heading.spec,
  blockquote: basicSchema.nodes.blockquote.spec,
  code_block: basicSchema.nodes.code_block.spec,
  horizontal_rule: basicSchema.nodes.horizontal_rule.spec,
  hard_break: basicSchema.nodes.hard_break.spec,
  bullet_list: {
    content: 'list_item+',
    group: 'block',
    parseDOM: [{ tag: 'ul' }],
    toDOM(): [string, 0] {
      return ['ul', 0];
    },
  },
  ordered_list: {
    attrs: { order: { default: 1 } },
    content: 'list_item+',
    group: 'block',
    parseDOM: [
      {
        tag: 'ol',
        getAttrs(dom: HTMLElement) {
          return { order: dom.hasAttribute('start') ? +(dom.getAttribute('start')!) : 1 };
        },
      },
    ],
    toDOM(node): [string, 0] | [string, { start: number }, 0] {
      return node.attrs.order === 1 ? ['ol', 0] : ['ol', { start: node.attrs.order as number }, 0];
    },
  },
  list_item: {
    content: 'paragraph block*',
    parseDOM: [{ tag: 'li' }],
    toDOM(): [string, 0] {
      return ['li', 0];
    },
    defining: true,
  },
};

// Create schema with lists
const schema = new Schema({
  nodes,
  marks: basicSchema.spec.marks,
});

// Code block input rule for triple backticks
const codeBlockRule = textblockTypeInputRule(/^```$/, schema.nodes.code_block);

// Heading rules
const headingRule = textblockTypeInputRule(/^(#{1,6})\s$/, schema.nodes.heading, (match) => ({
  level: match[1].length,
}));

// Bullet list rule
const bulletListRule = wrappingInputRule(/^\s*([-+*])\s$/, schema.nodes.bullet_list);

// Ordered list rule  
const orderedListRule = wrappingInputRule(/^(\d+)\.\s$/, schema.nodes.ordered_list);

// Blockquote rule
const blockquoteRule = wrappingInputRule(/^>\s$/, schema.nodes.blockquote);

export type TriggerType = 'slash' | 'mention' | null;

export interface TriggerInfo {
  type: TriggerType;
  query: string;
  rect: DOMRect;
}

export interface ProseMirrorEditorRef {
  focus: () => void;
  getContent: () => { text: string; markdown: string };
  clear: () => void;
  insertText: (text: string) => void;
  deleteBackward: (chars: number) => void;
}

interface ProseMirrorEditorProps {
  placeholder?: string;
  onChange?: (content: { text: string; markdown: string }) => void;
  onTrigger?: (info: TriggerInfo | null) => void;
  onSubmit?: () => void;
  className?: string;
  disabled?: boolean;
}

export const ProseMirrorEditor = forwardRef<ProseMirrorEditorRef, ProseMirrorEditorProps>(({
  placeholder = 'Ask anything...',
  onChange,
  onTrigger,
  onSubmit,
  className,
  disabled,
}, ref) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);
  const triggerRef = useRef<TriggerType>(null);
  const onChangeRef = useRef(onChange);
  const onTriggerRef = useRef(onTrigger);
  const onSubmitRef = useRef(onSubmit);

  // Keep refs updated
  useEffect(() => {
    onChangeRef.current = onChange;
    onTriggerRef.current = onTrigger;
    onSubmitRef.current = onSubmit;
  }, [onChange, onTrigger, onSubmit]);

  // Export methods via ref
  useImperativeHandle(ref, () => ({
    focus: () => {
      viewRef.current?.focus();
    },
    getContent: () => {
      if (!viewRef.current) return { text: '', markdown: '' };
      const { state } = viewRef.current;
      return {
        text: state.doc.textContent,
        markdown: getMarkdown(state),
      };
    },
    clear: () => {
      if (!viewRef.current) return;
      const { state } = viewRef.current;
      const tr = state.tr.delete(0, state.doc.content.size);
      viewRef.current.dispatch(tr);
      viewRef.current.focus();
    },
    insertText: (text: string) => {
      if (!viewRef.current) return;
      const { state } = viewRef.current;
      const tr = state.tr.insertText(text);
      viewRef.current.dispatch(tr);
      viewRef.current.focus();
    },
    deleteBackward: (chars: number) => {
      if (!viewRef.current) return;
      const { state } = viewRef.current;
      const { from } = state.selection;
      const tr = state.tr.delete(from - chars, from);
      viewRef.current.dispatch(tr);
      viewRef.current.focus();
    },
  }), []);

  const getMarkdown = useCallback((state: EditorState) => {
    let markdown = '';
    state.doc.forEach((node, _offset, index) => {
      if (index > 0) markdown += '\n';
      if (node.type.name === 'paragraph') {
        markdown += node.textContent;
      } else if (node.type.name === 'heading') {
        markdown += '#'.repeat(node.attrs.level) + ' ' + node.textContent;
      } else if (node.type.name === 'code_block') {
        markdown += '```\n' + node.textContent + '\n```';
      } else if (node.type.name === 'blockquote') {
        markdown += '> ' + node.textContent;
      } else if (node.type.name === 'bullet_list' || node.type.name === 'ordered_list') {
        node.forEach((item, i) => {
          markdown += (node.type.name === 'bullet_list' ? '- ' : `${i + 1}. `) + item.textContent + '\n';
        });
      }
    });
    return markdown;
  }, []);

  const checkTrigger = useCallback((state: EditorState, view: EditorView) => {
    const { from } = state.selection;
    const resolvedPos = state.doc.resolve(from);
    const parentNode = resolvedPos.parent;
    const pos = resolvedPos.parentOffset;
    const nodeText = parentNode.textContent;
    const beforeCursor = nodeText.slice(0, pos);

    // Check for / trigger (slash commands)
    const lastSlashIndex = beforeCursor.lastIndexOf('/');
    // Check for @ trigger (mentions)
    const lastAtIndex = beforeCursor.lastIndexOf('@');

    // Find which trigger is more recent
    let activeTrigger: TriggerType = null;
    let triggerIndex = -1;
    let query = '';

    if (lastSlashIndex > lastAtIndex && lastSlashIndex >= 0) {
      // Check if slash is at start or after whitespace
      const charBefore = lastSlashIndex > 0 ? beforeCursor[lastSlashIndex - 1] : ' ';
      if (charBefore === ' ' || charBefore === '\n' || lastSlashIndex === 0) {
        activeTrigger = 'slash';
        triggerIndex = lastSlashIndex;
        query = beforeCursor.slice(lastSlashIndex + 1);
      }
    } else if (lastAtIndex >= 0) {
      // Check if @ is at start or after whitespace
      const charBefore = lastAtIndex > 0 ? beforeCursor[lastAtIndex - 1] : ' ';
      if (charBefore === ' ' || charBefore === '\n' || lastAtIndex === 0) {
        activeTrigger = 'mention';
        triggerIndex = lastAtIndex;
        query = beforeCursor.slice(lastAtIndex + 1);
      }
    }

    // Close if query contains space or newline
    if (query.includes(' ') || query.includes('\n')) {
      activeTrigger = null;
    }

    if (activeTrigger && triggerIndex >= 0) {
      const coords = view.coordsAtPos(from);
      const rect = new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top);
      triggerRef.current = activeTrigger;
      onTriggerRef.current?.({ type: activeTrigger, query, rect });
    } else if (triggerRef.current) {
      triggerRef.current = null;
      onTriggerRef.current?.(null);
    }
  }, []);

  const handleTransaction = useCallback((tr: Transaction, view: EditorView) => {
    const newState = view.state.apply(tr);
    view.updateState(newState);

    const text = newState.doc.textContent;
    const empty = text.length === 0 && newState.doc.childCount === 1 && 
                  newState.doc.firstChild?.type.name === 'paragraph' && 
                  newState.doc.firstChild.childCount === 0;
    setIsEmpty(empty);

    // Check for triggers
    checkTrigger(newState, view);

    // Notify parent of content change
    onChangeRef.current?.({
      text,
      markdown: getMarkdown(newState),
    });
  }, [getMarkdown, checkTrigger]);

  useEffect(() => {
    if (!editorRef.current || viewRef.current) return;

    const state = EditorState.create({
      schema,
      plugins: [
        history(),
        keymap({
          'Mod-b': toggleMark(schema.marks.strong),
          'Mod-i': toggleMark(schema.marks.em),
          'Mod-`': toggleMark(schema.marks.code),
          'Enter': () => {
            // If trigger menu is open, don't handle enter
            if (triggerRef.current) {
              return true; // Prevent default, let menu handle it
            }
            // Submit on Enter (Shift+Enter for newline)
            if (onSubmitRef.current) {
              onSubmitRef.current();
              return true;
            }
            return false;
          },
          'Shift-Enter': (state, dispatch) => {
            if (dispatch) {
              dispatch(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()));
            }
            return true;
          },
          'Escape': () => {
            if (triggerRef.current) {
              triggerRef.current = null;
              onTriggerRef.current?.(null);
              return true;
            }
            return false;
          },
          'ArrowUp': () => triggerRef.current !== null,
          'ArrowDown': () => triggerRef.current !== null,
          'Tab': () => triggerRef.current !== null,
        }),
        keymap(baseKeymap),
        inputRules({
          rules: [
            ...smartQuotes,
            emDash,
            ellipsis,
            codeBlockRule,
            headingRule,
            bulletListRule,
            orderedListRule,
            blockquoteRule,
          ],
        }),
        dropCursor(),
        gapCursor(),
      ],
    });

    const view = new EditorView(editorRef.current, {
      state,
      dispatchTransaction(tr) {
        handleTransaction(tr, view);
      },
      attributes: {
        class: 'prosemirror-editor outline-none',
      },
    });

    viewRef.current = view;

    // Auto focus
    setTimeout(() => view.focus(), 0);

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [handleTransaction]);

  // Update disabled state
  useEffect(() => {
    if (viewRef.current) {
      viewRef.current.setProps({
        editable: () => !disabled,
      });
    }
  }, [disabled]);

  return (
    <div className="relative">
      <div
        ref={editorRef}
        className={cn(
          'min-h-[52px] max-h-[300px] overflow-y-auto px-3.5 py-3.5 text-sm leading-relaxed',
          '[&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[24px]',
          '[&_.ProseMirror_p]:m-0 [&_.ProseMirror_p]:leading-relaxed',
          '[&_.ProseMirror_code]:bg-muted [&_.ProseMirror_code]:px-1 [&_.ProseMirror_code]:py-0.5 [&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:text-xs [&_.ProseMirror_code]:font-mono',
          '[&_.ProseMirror_pre]:bg-muted/50 [&_.ProseMirror_pre]:p-3 [&_.ProseMirror_pre]:rounded-lg [&_.ProseMirror_pre]:my-2 [&_.ProseMirror_pre]:font-mono [&_.ProseMirror_pre]:text-xs',
          '[&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:border-primary/30 [&_.ProseMirror_blockquote]:pl-3 [&_.ProseMirror_blockquote]:italic [&_.ProseMirror_blockquote]:text-muted-foreground',
          '[&_.ProseMirror_h1]:text-xl [&_.ProseMirror_h1]:font-semibold [&_.ProseMirror_h1]:my-2',
          '[&_.ProseMirror_h2]:text-lg [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h2]:my-2',
          '[&_.ProseMirror_h3]:text-base [&_.ProseMirror_h3]:font-semibold [&_.ProseMirror_h3]:my-1',
          '[&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5 [&_.ProseMirror_ul]:my-1',
          '[&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5 [&_.ProseMirror_ol]:my-1',
          '[&_.ProseMirror_li]:my-0.5',
          disabled && 'opacity-50 cursor-not-allowed',
          className
        )}
      />
      {isEmpty && (
        <div className="absolute top-[14px] left-[14px] text-muted-foreground/50 pointer-events-none select-none text-sm">
          {placeholder}
        </div>
      )}
    </div>
  );
});

ProseMirrorEditor.displayName = 'ProseMirrorEditor';

export default ProseMirrorEditor;
