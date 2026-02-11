import { useEffect, useCallback } from 'react';

// Detect if user is on macOS
export const isMac = typeof navigator !== 'undefined' && 
  /Mac|iPod|iPhone|iPad/.test(navigator.platform);

// Get the modifier key symbol/text for display
export function getModifierKey(): string {
  return isMac ? '⌘' : 'Ctrl';
}

// Format shortcut for display (e.g., "⌘K" or "Ctrl+K")
export function formatShortcut(key: string, modifiers?: { ctrl?: boolean; shift?: boolean; alt?: boolean }): string {
  const parts: string[] = [];
  if (modifiers?.ctrl) parts.push(getModifierKey());
  if (modifiers?.shift) parts.push('Shift');
  if (modifiers?.alt) parts.push(isMac ? '⌥' : 'Alt');
  parts.push(key.toUpperCase());
  return parts.join(isMac ? '' : '+');
}

interface ShortcutConfig {
  key: string;
  ctrl?: boolean; // Treats Ctrl (Linux/Windows) and Cmd (macOS) as the same
  shift?: boolean;
  alt?: boolean;
  handler: () => void;
  preventDefault?: boolean;
}

export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();
        // Treat Ctrl (Linux/Windows) and Cmd/Mac (macOS) as the same modifier
        const ctrlMatch = !!shortcut.ctrl === (event.ctrlKey || event.metaKey);
        const shiftMatch = !!shortcut.shift === event.shiftKey;
        const altMatch = !!shortcut.alt === event.altKey;

        if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
          if (shortcut.preventDefault !== false) {
            event.preventDefault();
          }
          shortcut.handler();
          break;
        }
      }
    },
    [shortcuts]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

export function useGlobalEscape(handler: () => void) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handler();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [handler]);
}
