'use client';

import { useRef, useEffect, useCallback } from 'react';

/**
 * Hook that adds click-and-drag horizontal panning to a scrollable container.
 * Only activates when clicking on empty areas (not on cards, lists, buttons, inputs).
 */
export function useBoardPan() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isPanning = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  const isInteractiveElement = useCallback((target: HTMLElement): boolean => {
    // Walk up the DOM to check if click originated inside a card, list, button, or input
    let el: HTMLElement | null = target;
    while (el && el !== containerRef.current) {
      const tag = el.tagName.toLowerCase();
      if (
        tag === 'button' ||
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'a' ||
        tag === 'select' ||
        el.getAttribute('role') === 'checkbox' ||
        el.getAttribute('draggable') === 'true' ||
        el.dataset.rfdDraggableId ||
        el.dataset.rfdDragHandleContextId ||
        el.hasAttribute('data-rfd-drag-handle-draggable-id')
      ) {
        return true;
      }
      // If we hit a board list or card container, it's interactive
      if (el.classList.contains('shrink-0') && el !== containerRef.current) {
        return true;
      }
      el = el.parentElement;
    }
    return false;
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onMouseDown = (e: MouseEvent) => {
      // Only left mouse button
      if (e.button !== 0) return;
      // Skip if clicking on an interactive element
      if (isInteractiveElement(e.target as HTMLElement)) return;

      isPanning.current = true;
      startX.current = e.pageX - container.offsetLeft;
      scrollLeft.current = container.scrollLeft;
      container.style.cursor = 'grabbing';
      container.style.userSelect = 'none';
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isPanning.current) return;
      e.preventDefault();
      const x = e.pageX - container.offsetLeft;
      const walk = (x - startX.current) * 1.5; // multiplier for faster panning
      container.scrollLeft = scrollLeft.current - walk;
    };

    const onMouseUp = () => {
      if (!isPanning.current) return;
      isPanning.current = false;
      container.style.cursor = '';
      container.style.userSelect = '';
    };

    const onMouseLeave = () => {
      if (!isPanning.current) return;
      isPanning.current = false;
      container.style.cursor = '';
      container.style.userSelect = '';
    };

    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    container.addEventListener('mouseleave', onMouseLeave);

    return () => {
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      container.removeEventListener('mouseleave', onMouseLeave);
    };
  }, [isInteractiveElement]);

  return containerRef;
}
