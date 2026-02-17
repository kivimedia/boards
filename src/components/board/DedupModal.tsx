'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface DupEntry {
  card_id: string;
  placement_id: string;
  list_name: string;
  created_at: string;
  comment_count: number;
  attachment_count: number;
}

interface DupGroup {
  title: string;
  keep: DupEntry;
  remove: DupEntry[];
}

interface DedupModalProps {
  boardId: string;
  onClose: () => void;
  onRefresh?: () => void;
}

export default function DedupModal({ boardId, onClose, onRefresh }: DedupModalProps) {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<DupGroup[]>([]);
  const [totalDuplicates, setTotalDuplicates] = useState(0);
  const [cleaning, setCleaning] = useState(false);
  const [cleaned, setCleaned] = useState(false);
  const [cleanedCount, setCleanedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const fetchDuplicates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/boards/${boardId}/dedup`);
      if (!res.ok) throw new Error('Failed to fetch duplicates');
      const json = await res.json();
      const data = json.data || json;
      setGroups(data.groups || []);
      setTotalDuplicates(data.totalDuplicates || 0);
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  }, [boardId]);

  useEffect(() => {
    fetchDuplicates();
  }, [fetchDuplicates]);

  const handleCleanAll = async () => {
    if (cleaning) return;
    setCleaning(true);
    setError(null);
    try {
      // Collect all card_ids to remove
      const cardIds = groups.flatMap((g) => g.remove.map((r) => r.card_id));
      if (cardIds.length === 0) return;

      const res = await fetch(`/api/boards/${boardId}/dedup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_ids: cardIds }),
      });

      if (!res.ok) throw new Error('Cleanup failed');
      const json = await res.json();
      const data = json.data || json;
      setCleanedCount(data.deleted || 0);
      setCleaned(true);
      onRefresh?.();
    } catch (err: any) {
      setError(err.message);
    }
    setCleaning(false);
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white dark:bg-dark-surface rounded-2xl shadow-modal w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-cream-dark/50 dark:border-slate-700/50">
          <div>
            <h2 className="text-lg font-semibold text-navy dark:text-slate-100 font-heading">
              Duplicate Card Cleanup
            </h2>
            <p className="text-sm text-navy/50 dark:text-slate-400 mt-0.5 font-body">
              Cards with identical titles across lists
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-navy/40 dark:text-slate-400 hover:text-navy dark:hover:text-white hover:bg-cream-dark dark:hover:bg-slate-800 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 scrollbar-thin">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-3 text-navy/40 dark:text-slate-400">
                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="font-body">Scanning for duplicates...</span>
              </div>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm font-body">
              {error}
            </div>
          )}

          {cleaned && (
            <div className="p-6 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600 dark:text-green-400">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-navy dark:text-slate-100 font-heading">
                Cleanup Complete
              </h3>
              <p className="text-sm text-navy/50 dark:text-slate-400 mt-2 font-body">
                Removed {cleanedCount} duplicate card{cleanedCount !== 1 ? 's' : ''}. The board will refresh automatically.
              </p>
            </div>
          )}

          {!loading && !cleaned && groups.length === 0 && (
            <div className="p-6 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600 dark:text-green-400">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-navy dark:text-slate-100 font-heading">
                No Duplicates Found
              </h3>
              <p className="text-sm text-navy/50 dark:text-slate-400 mt-2 font-body">
                All cards on this board have unique titles.
              </p>
            </div>
          )}

          {!loading && !cleaned && groups.length > 0 && (
            <>
              {/* Summary */}
              <div className="mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/30">
                <p className="text-sm text-amber-800 dark:text-amber-300 font-body">
                  Found <strong>{totalDuplicates}</strong> duplicate card{totalDuplicates !== 1 ? 's' : ''} across{' '}
                  <strong>{groups.length}</strong> group{groups.length !== 1 ? 's' : ''}.
                  The version with the most recent activity and metadata will be kept.
                </p>
              </div>

              {/* Duplicate groups */}
              <div className="space-y-3">
                {groups.map((group, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-cream-dark/50 dark:border-slate-700/50 overflow-hidden"
                  >
                    {/* Group title */}
                    <div className="px-4 py-2.5 bg-cream/50 dark:bg-slate-800/50">
                      <p className="text-sm font-medium text-navy dark:text-slate-100 font-body truncate">
                        &quot;{group.title}&quot;
                        <span className="ml-2 text-navy/40 dark:text-slate-500 font-normal">
                          ({group.remove.length + 1} copies)
                        </span>
                      </p>
                    </div>

                    {/* Keep */}
                    <div className="px-4 py-2 flex items-center gap-3 bg-green-50/50 dark:bg-green-900/10 border-b border-cream-dark/30 dark:border-slate-700/30">
                      <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 uppercase">
                        Keep
                      </span>
                      <span className="text-sm text-navy/70 dark:text-slate-300 font-body truncate flex-1">
                        {group.keep.list_name}
                      </span>
                      <div className="flex items-center gap-3 text-[11px] text-navy/40 dark:text-slate-500 shrink-0">
                        {group.keep.comment_count > 0 && (
                          <span className="flex items-center gap-0.5">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                            </svg>
                            {group.keep.comment_count}
                          </span>
                        )}
                        {group.keep.attachment_count > 0 && (
                          <span className="flex items-center gap-0.5">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                            </svg>
                            {group.keep.attachment_count}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Remove */}
                    {group.remove.map((r, j) => (
                      <div
                        key={j}
                        className="px-4 py-2 flex items-center gap-3 border-b last:border-b-0 border-cream-dark/20 dark:border-slate-700/20"
                      >
                        <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 uppercase">
                          Remove
                        </span>
                        <span className="text-sm text-navy/50 dark:text-slate-400 font-body truncate flex-1 line-through">
                          {r.list_name}
                        </span>
                        <div className="flex items-center gap-3 text-[11px] text-navy/30 dark:text-slate-600 shrink-0">
                          {r.comment_count > 0 && (
                            <span className="flex items-center gap-0.5">
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                              </svg>
                              {r.comment_count}
                            </span>
                          )}
                          {r.attachment_count > 0 && (
                            <span className="flex items-center gap-0.5">
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                              </svg>
                              {r.attachment_count}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && !cleaned && groups.length > 0 && (
          <div className="px-6 py-4 border-t border-cream-dark/50 dark:border-slate-700/50 flex items-center justify-between">
            <p className="text-sm text-navy/40 dark:text-slate-500 font-body">
              {totalDuplicates} card{totalDuplicates !== 1 ? 's' : ''} will be permanently deleted
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium text-navy/60 dark:text-slate-400 hover:bg-cream-dark dark:hover:bg-slate-800 transition-colors font-body"
              >
                Cancel
              </button>
              <button
                onClick={handleCleanAll}
                disabled={cleaning}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-danger text-white hover:bg-danger/90 disabled:opacity-50 transition-colors font-body flex items-center gap-2"
              >
                {cleaning && (
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                )}
                {cleaning ? 'Cleaning...' : `Remove ${totalDuplicates} Duplicate${totalDuplicates !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        )}

        {/* Close button for completed state */}
        {cleaned && (
          <div className="px-6 py-4 border-t border-cream-dark/50 dark:border-slate-700/50 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-electric text-white hover:bg-electric/90 transition-colors font-body"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
