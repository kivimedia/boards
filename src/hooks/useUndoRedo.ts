import { useState, useCallback } from 'react';

interface UseUndoRedoOptions {
  maxHistory?: number;
}

interface UseUndoRedoReturn {
  value: string;
  setValue: (val: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  clearHistory: () => void;
}

/**
 * Hook for managing undo/redo state in text inputs.
 * Maintains a history of text changes and allows navigation through them.
 *
 * Usage:
 * ```tsx
 * const { value, setValue, undo, redo, canUndo, canRedo } = useUndoRedo('');
 *
 * useEffect(() => {
 *   const handler = (e: KeyboardEvent) => {
 *     if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
 *       e.preventDefault();
 *       undo();
 *     }
 *     if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
 *       e.preventDefault();
 *       redo();
 *     }
 *   };
 *   element.addEventListener('keydown', handler);
 *   return () => element.removeEventListener('keydown', handler);
 * }, [undo, redo]);
 * ```
 */
export function useUndoRedo(
  initialValue: string = '',
  { maxHistory = 50 }: UseUndoRedoOptions = {}
): UseUndoRedoReturn {
  // history[current] is the current value
  // history before current are "undo" states
  // history after current are "redo" states
  const [history, setHistory] = useState<string[]>([initialValue]);
  const [current, setCurrent] = useState(0);

  const value = history[current] || '';

  const setValue = useCallback((val: string) => {
    setHistory((prev) => {
      // Remove any redo states (everything after current position)
      const newHistory = prev.slice(0, current + 1);
      newHistory.push(val);

      // Trim history to maxHistory length, removing oldest entries
      if (newHistory.length > maxHistory) {
        newHistory.shift();
        // Also update current if we trimmed from the beginning
        setCurrent((c) => Math.max(0, c - 1));
        return newHistory;
      }

      // Move cursor to the end of new history
      setCurrent((c) => c + 1);
      return newHistory;
    });
  }, [current, maxHistory]);

  const undo = useCallback(() => {
    setCurrent((prev) => Math.max(0, prev - 1));
  }, []);

  const redo = useCallback(() => {
    setCurrent((prev) => Math.min(prev + 1, history.length - 1));
  }, [history.length]);

  const clearHistory = useCallback(() => {
    // Clear history and reset value to empty string
    setHistory(['']);
    setCurrent(0);
  }, []);

  const canUndo = current > 0;
  const canRedo = current < history.length - 1;

  return {
    value,
    setValue,
    undo,
    redo,
    canUndo,
    canRedo,
    clearHistory,
  };
}
