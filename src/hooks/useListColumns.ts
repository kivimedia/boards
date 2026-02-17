'use client';

import { useState, useCallback, useMemo } from 'react';

// All togglable columns in default order
const DEFAULT_ORDER = [
  'title',
  'status',
  'priority',
  'due_date',
  'assignees',
  'labels',
  'start_date',
  'created_at',
  'updated_at',
  'approval_status',
  'comments',
  'attachments',
  'checklist',
  'is_mirror',
];

const DEFAULT_VISIBLE = new Set([
  'title',
  'status',
  'priority',
  'due_date',
  'assignees',
  'labels',
]);

interface ListColumnConfig {
  visible: string[];
  order: string[];
}

function getStorageKey(boardId: string) {
  return `agency-board-list-columns-${boardId}`;
}

function loadConfig(boardId: string): ListColumnConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(getStorageKey(boardId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.visible) && Array.isArray(parsed.order)) {
      // Ensure all known columns are in the order array (handles new columns added later)
      const orderSet = new Set(parsed.order);
      const fullOrder = [...parsed.order];
      const visibleSet = new Set(parsed.visible);
      for (const key of DEFAULT_ORDER) {
        if (!orderSet.has(key)) {
          // New column - add to order, and auto-show if it's a default-visible column
          fullOrder.splice(DEFAULT_ORDER.indexOf(key), 0, key);
          if (DEFAULT_VISIBLE.has(key)) {
            visibleSet.add(key);
          }
        }
      }
      return {
        visible: fullOrder.filter((k) => visibleSet.has(k)),
        order: fullOrder,
      };
    }
  } catch {
    // Corrupted localStorage entry
  }
  return null;
}

function saveConfig(boardId: string, config: ListColumnConfig) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getStorageKey(boardId), JSON.stringify(config));
  } catch {
    // localStorage full or unavailable
  }
}

function getDefaultConfig(): ListColumnConfig {
  return {
    visible: DEFAULT_ORDER.filter((k) => DEFAULT_VISIBLE.has(k)),
    order: [...DEFAULT_ORDER],
  };
}

export function useListColumns(boardId: string) {
  const [config, setConfig] = useState<ListColumnConfig>(() => {
    return loadConfig(boardId) || getDefaultConfig();
  });

  // Visible columns in display order (respects the order array)
  const visibleColumns = useMemo(() => {
    const visibleSet = new Set(config.visible);
    return config.order.filter((k) => visibleSet.has(k));
  }, [config]);

  // All columns in their current order
  const allColumns = config.order;

  const isVisible = useCallback(
    (key: string) => config.visible.includes(key),
    [config.visible]
  );

  const toggleColumn = useCallback(
    (key: string) => {
      setConfig((prev) => {
        const visibleSet = new Set(prev.visible);
        if (visibleSet.has(key)) {
          visibleSet.delete(key);
        } else {
          visibleSet.add(key);
        }
        const next: ListColumnConfig = {
          ...prev,
          visible: prev.order.filter((k) => visibleSet.has(k)),
        };
        saveConfig(boardId, next);
        return next;
      });
    },
    [boardId]
  );

  const moveColumn = useCallback(
    (key: string, direction: 'up' | 'down') => {
      setConfig((prev) => {
        const idx = prev.order.indexOf(key);
        if (idx === -1) return prev;
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= prev.order.length) return prev;
        const newOrder = [...prev.order];
        [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
        // Recompute visible to match new order
        const visibleSet = new Set(prev.visible);
        const next: ListColumnConfig = {
          visible: newOrder.filter((k) => visibleSet.has(k)),
          order: newOrder,
        };
        saveConfig(boardId, next);
        return next;
      });
    },
    [boardId]
  );

  const reorderColumn = useCallback(
    (fromIndex: number, toIndex: number) => {
      setConfig((prev) => {
        if (fromIndex === toIndex) return prev;
        if (fromIndex < 0 || fromIndex >= prev.order.length) return prev;
        if (toIndex < 0 || toIndex >= prev.order.length) return prev;
        const newOrder = [...prev.order];
        const [moved] = newOrder.splice(fromIndex, 1);
        newOrder.splice(toIndex, 0, moved);
        const visibleSet = new Set(prev.visible);
        const next: ListColumnConfig = {
          visible: newOrder.filter((k) => visibleSet.has(k)),
          order: newOrder,
        };
        saveConfig(boardId, next);
        return next;
      });
    },
    [boardId]
  );

  const resetToDefault = useCallback(() => {
    const defaults = getDefaultConfig();
    setConfig(defaults);
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(getStorageKey(boardId));
      } catch {
        // ignore
      }
    }
  }, [boardId]);

  const isDefault = useMemo(() => {
    const defaults = getDefaultConfig();
    return (
      JSON.stringify(config.visible) === JSON.stringify(defaults.visible) &&
      JSON.stringify(config.order) === JSON.stringify(defaults.order)
    );
  }, [config]);

  return {
    visibleColumns,
    allColumns,
    isVisible,
    toggleColumn,
    moveColumn,
    reorderColumn,
    resetToDefault,
    isDefault,
  };
}
