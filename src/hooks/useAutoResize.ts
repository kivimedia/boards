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
    // Reset height to auto to get accurate scrollHeight
    el.style.height = 'auto';
    // Set height to scrollHeight with a small delay to ensure layout is updated
    const height = Math.max(el.scrollHeight, 120); // minimum 120px (min-h-[120px])
    el.style.height = `${height}px`;
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
    
    const handleInput = () => {
      resize();
    };
    
    el.addEventListener('input', handleInput);
    // Also trigger on focus to ensure proper height
    el.addEventListener('focus', () => {
      // Small delay to ensure content is rendered
      setTimeout(resize, 0);
    });
    
    return () => {
      el.removeEventListener('input', handleInput);
      el.removeEventListener('focus', handleInput);
    };
  }, [ref, resize]);
}
