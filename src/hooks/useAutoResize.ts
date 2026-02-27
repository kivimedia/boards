'use client';

import { useEffect, useLayoutEffect, useCallback, useRef, RefObject } from 'react';

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
  const resizeTimerRef = useRef<NodeJS.Timeout>();
  const lastHeightRef = useRef<number>(0);

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    
    // Reset height to auto to get accurate scrollHeight
    el.style.height = 'auto';
    const scrollHeight = el.scrollHeight;
    
    // Only update if height actually changed (optimization to reduce reflows)
    const newHeight = Math.max(scrollHeight, 120); // minimum 120px (min-h-[120px])
    if (lastHeightRef.current !== newHeight) {
      el.style.height = `${newHeight}px`;
      lastHeightRef.current = newHeight;
    }
  }, [ref]);

  const debouncedResize = useCallback(() => {
    // Clear existing timer to debounce rapid calls
    if (resizeTimerRef.current) {
      clearTimeout(resizeTimerRef.current);
    }
    
    // For very large text, use a small debounce to avoid jank
    // For normal text, resize immediately
    const isLargeText = value && value.length > 1000;
    const delay = isLargeText ? 50 : 0; // 50ms debounce for large text
    
    resizeTimerRef.current = setTimeout(resize, delay);
  }, [value, resize]);

  // Fire synchronously after every DOM update where value changes.
  // useLayoutEffect ensures we resize BEFORE the browser paints, so there's
  // no visible flash of the wrong height — even when the textarea first
  // appears already filled (edit-comment open with existing text).
  // CRITICAL: Include `value` in deps so textarea expands as user types
  useLayoutEffect(() => {
    resize();
  }, [value, resize]);

  // Also listen for user typing with debounce to avoid jank on long comments
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    
    const handleInput = () => {
      debouncedResize();
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
      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current);
      }
    };
  }, [ref, resize, debouncedResize]);
}
