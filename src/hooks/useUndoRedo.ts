import { useState, useCallback, useRef, useEffect } from 'react';

interface UseUndoRedoOptions {
  maxHistory?: number;
  debounceMs?: number;
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
 * Optimized with debouncing to avoid excessive history entries during fast typing.
 * Only saves to history after user stops typing for debounceMs milliseconds.
 *
 * Usage:
 * ```tsx
 * const { value, setValue, undo, redo, canUndo, canRedo } = useUndoRedo('');
 * ```
 */
export function useUndoRedo(
  initialValue: string = '',
  { maxHistory = 50, debounceMs = 300 }: UseUndoRedoOptions = {}
): UseUndoRedoReturn {
  // history[current] is the committed value
  // history before current are "undo" states
  // history after current are "redo" states
  const [history, setHistory] = useState<string[]>([initialValue]);
  const [current, setCurrent] = useState(0);
  const [uncommittedValue, setUncommittedValue] = useState(initialValue);
  const debounceTimerRef = useRef<NodeJS.Timeout>();

  const value = uncommittedValue;

  const setValue = useCallback((val: string) => {
    // Update the uncommitted value immediately for responsive UI
    setUncommittedValue(val);

    // Clear the existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set a new timer to commit to history after debounce delay
    debounceTimerRef.current = setTimeout(() => {
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
    }, debounceMs);
  }, [current, maxHistory, debounceMs]);

  const undo = useCallback(() => {
    // Clear any pending debounce so we commit current work
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    setCurrent((prev) => {
      const newCurrent = Math.max(0, prev - 1);
      setUncommittedValue(history[newCurrent] || '');
      return newCurrent;
    });
  }, [history]);

  const redo = useCallback(() => {
    // Clear any pending debounce
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    setCurrent((prev) => {
      const newCurrent = Math.min(prev + 1, history.length - 1);
      setUncommittedValue(history[newCurrent] || '');
      return newCurrent;
    });
  }, [history]);

  const clearHistory = useCallback(() => {
    // Clear any pending debounce
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    // Clear history and reset value to empty string
    setHistory(['']);
    setCurrent(0);
    setUncommittedValue('');
  }, []);

  useEffect(() => {
    // Cleanup timer on unmount
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
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
