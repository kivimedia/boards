'use client';

import { useEffect, useLayoutEffect, useCallback, RefObject } from 'react';

/**
 * Makes a textarea automatically grow (and shrink) to fit its content.
 *
 * Usage:
 *   const ref = useRef<HTMLTextAreaElement>(null);
 *   useAutoResize(ref, value);
 *
 * Pass `value` so the textarea resizes when content changes programmatically
 * (e.g. pre-filled on edit open, or cleared after submit).
 *
 * Uses useLayoutEffect so the resize happens synchronously after DOM paint —
 * this prevents a flicker when a conditionally-rendered textarea first mounts
 * already containing content (e.g. opening the "edit comment" box).
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

  // Fire synchronously after every DOM update where value changes.
  // useLayoutEffect ensures we resize BEFORE the browser paints, so there's
  // no visible flash of the wrong height — even when the textarea first
  // appears already filled (edit-comment open with existing text).
  useLayoutEffect(() => {
    resize();
  }, [value, resize]);

  // Also listen for user typing (covers cases where value state lags input)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener('input', resize);
    return () => el.removeEventListener('input', resize);
  }, [ref, resize]);
}
