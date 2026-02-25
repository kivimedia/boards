import { useEffect } from 'react';

/**
 * Hook that attaches keyboard event listeners for Ctrl+Z (undo) and Ctrl+Shift+Z or Ctrl+Y (redo)
 * to a specific element.
 *
 * Usage:
 * ```tsx
 * const textareaRef = useRef<HTMLTextAreaElement>(null);
 * const { value, setValue, undo, redo } = useUndoRedo('initial');
 *
 * useUndoRedoKeyboard(textareaRef, undo, redo);
 *
 * return <textarea ref={textareaRef} value={value} onChange={e => setValue(e.target.value)} />;
 * ```
 */
export function useUndoRedoKeyboard(
  elementRef: React.RefObject<HTMLTextAreaElement | HTMLDivElement | HTMLElement | null>,
  undo: () => void,
  redo: () => void
): void {
  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isMeta = e.ctrlKey || e.metaKey; // Windows/Linux: Ctrl, Mac: Cmd

      // Ctrl+Z or Cmd+Z: Undo
      if (isMeta && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      // Ctrl+Shift+Z or Cmd+Shift+Z or Ctrl+Y or Cmd+Y: Redo
      if (
        (isMeta && e.key === 'z' && e.shiftKey) ||
        (isMeta && e.key === 'y')
      ) {
        e.preventDefault();
        redo();
        return;
      }
    };

    element.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => element.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [undo, redo]);
}
