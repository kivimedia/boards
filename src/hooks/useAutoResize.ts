'use client';

import { useEffect, useCallback, RefObject } from 'react';

/**
 * Makes a textarea automatically grow (and shrink) to fit its content.
 *
 * Usage:
 *   const ref = useRef<HTMLTextAreaElement>(null);
 *   useAutoResize(ref, value);
 *
 * Pass `value` as the second arg so the textarea resizes when content
 * changes programmatically (e.g. cleared after submit).
 */
export function useAutoResize(
  ref: RefObject<HTMLTextAreaElement>,
  value?: string
) {
  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [ref]);

  // Resize whenever value changes (handles programmatic updates + clear)
  useEffect(() => {
    resize();
  }, [value, resize]);

  // Resize on input (handles user typing)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener('input', resize);
    return () => el.removeEventListener('input', resize);
  }, [ref, resize]);
}
