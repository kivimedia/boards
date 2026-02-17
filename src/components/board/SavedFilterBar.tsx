'use client';

import { useState, useEffect, useCallback } from 'react';
import { SavedFilter, BoardFilter } from '@/lib/types';
import SaveFilterModal from './SaveFilterModal';

const EMPTY_FILTER: BoardFilter = { labels: [], members: [], priority: [], dueDate: null };

/** Convert DB filter_config (Record) to BoardFilter safely */
function toFilter(config: Record<string, unknown>): BoardFilter {
  return {
    labels: Array.isArray(config.labels) ? config.labels : [],
    members: Array.isArray(config.members) ? config.members : [],
    priority: Array.isArray(config.priority) ? config.priority : [],
    dueDate: (config.dueDate as BoardFilter['dueDate']) ?? null,
  };
}

/** Check if a filter has any active criteria */
function isFilterActive(f: BoardFilter): boolean {
  return f.labels.length > 0 || f.members.length > 0 || f.priority.length > 0 || f.dueDate !== null;
}

interface SavedFilterBarProps {
  boardId: string;
  currentFilter: BoardFilter;
  onFilterChange: (filter: BoardFilter) => void;
  isDark?: boolean;
}

export default function SavedFilterBar({
  boardId,
  currentFilter,
  onFilterChange,
  isDark,
}: SavedFilterBarProps) {
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [activeFilterId, setActiveFilterId] = useState<string | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadFilters = useCallback(async () => {
    try {
      const res = await fetch(`/api/boards/${boardId}/saved-filters`);
      if (res.ok) {
        const json = await res.json();
        const data = json.data ?? json;
        setSavedFilters(Array.isArray(data) ? data : []);
      }
    } catch {
      // Silently fail
    }
  }, [boardId]);

  useEffect(() => {
    loadFilters();
  }, [loadFilters]);

  // Auto-apply default filter on mount
  useEffect(() => {
    const defaultFilter = savedFilters.find((f) => f.is_default);
    if (defaultFilter && !activeFilterId && !isFilterActive(currentFilter)) {
      setActiveFilterId(defaultFilter.id);
      onFilterChange(toFilter(defaultFilter.filter_config));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedFilters]);

  const handleFilterClick = (filter: SavedFilter) => {
    if (activeFilterId === filter.id) {
      // Deselect
      setActiveFilterId(null);
      onFilterChange(EMPTY_FILTER);
    } else {
      setActiveFilterId(filter.id);
      onFilterChange(toFilter(filter.filter_config));
    }
  };

  const handleClear = () => {
    setActiveFilterId(null);
    onFilterChange(EMPTY_FILTER);
  };

  const handleDelete = async (filterId: string) => {
    setDeletingId(filterId);
    try {
      await fetch(`/api/boards/${boardId}/saved-filters/${filterId}`, {
        method: 'DELETE',
      });
      if (activeFilterId === filterId) {
        setActiveFilterId(null);
        onFilterChange(EMPTY_FILTER);
      }
      await loadFilters();
    } catch {
      // Silently fail
    } finally {
      setDeletingId(null);
    }
  };

  const handleSaved = () => {
    setShowSaveModal(false);
    loadFilters();
  };

  const hasCurrentFilter = isFilterActive(currentFilter);
  const showBar = savedFilters.length > 0 || hasCurrentFilter;

  if (!showBar) return null;

  const textBase = isDark ? 'text-white/60' : 'text-navy/60 dark:text-slate-400';
  const textMuted = isDark ? 'text-white/40' : 'text-navy/40 dark:text-slate-500';
  const pillBase = isDark
    ? 'bg-white/10 text-white/70 hover:bg-white/20'
    : 'bg-cream-dark dark:bg-slate-800 text-navy/60 dark:text-slate-400 hover:bg-cream-dark/80 dark:hover:bg-slate-700';
  const pillActive = 'bg-electric text-white';

  return (
    <>
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin px-6 py-1.5">
        <span className={`text-[10px] uppercase tracking-wider font-semibold shrink-0 ${textMuted}`}>
          Filters
        </span>
        {savedFilters.map((filter) => (
          <div key={filter.id} className="relative group flex items-center shrink-0">
            <button
              onClick={() => handleFilterClick(filter)}
              className={`
                px-3 py-1 rounded-full text-xs font-medium cursor-pointer whitespace-nowrap transition-colors
                ${activeFilterId === filter.id ? pillActive : pillBase}
              `}
            >
              {filter.is_default && (
                <span className="mr-1 opacity-60" title="Default filter">*</span>
              )}
              {filter.name}
              {filter.is_shared && (
                <span className="ml-1 opacity-50" title="Shared">
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline-block -mt-px"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                </span>
              )}
            </button>
            {/* Delete button — shown on hover */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(filter.id);
              }}
              disabled={deletingId === filter.id}
              className={`
                absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center
                opacity-0 group-hover:opacity-100 transition-opacity
                bg-red-500 text-white text-[8px] hover:bg-red-600
                ${deletingId === filter.id ? 'opacity-50' : ''}
              `}
              title="Delete filter"
            >
              x
            </button>
          </div>
        ))}

        {hasCurrentFilter && !activeFilterId && (
          <button
            onClick={() => setShowSaveModal(true)}
            className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 border border-dashed transition-colors ${
              isDark
                ? 'border-white/20 text-white/40 hover:text-white/60 hover:border-white/30'
                : 'border-cream-dark dark:border-slate-600 text-navy/40 dark:text-slate-500 hover:text-navy/60 dark:hover:text-slate-300 hover:border-navy/20 dark:hover:border-slate-500'
            }`}
          >
            + Save current
          </button>
        )}

        {(activeFilterId || hasCurrentFilter) && (
          <button
            onClick={handleClear}
            className={`px-2 py-1 rounded-full text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 transition-colors ${textMuted} hover:${textBase}`}
          >
            Clear
          </button>
        )}
      </div>

      {showSaveModal && hasCurrentFilter && (
        <SaveFilterModal
          boardId={boardId}
          filterConfig={currentFilter as unknown as Record<string, unknown>}
          onSave={handleSaved}
          onClose={() => setShowSaveModal(false)}
        />
      )}
    </>
  );
}
