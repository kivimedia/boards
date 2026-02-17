'use client';

import { useState, useEffect, useRef } from 'react';
import { Label, Profile, CardPriority } from '@/lib/types';
import Avatar from '@/components/ui/Avatar';

interface BulkSelectToolbarProps {
  selectedCount: number;
  boardId: string;
  lists: { id: string; name: string }[];
  onAction: (action: string, params?: Record<string, string>) => Promise<void>;
  onClear: () => void;
  onSelectAll?: () => void;
}

type ActivePicker = 'move' | 'assign' | 'label' | 'priority' | null;

interface BoardMember {
  user_id: string;
  profile: Profile | null;
}

export default function BulkSelectToolbar({
  selectedCount,
  boardId,
  lists,
  onAction,
  onClear,
  onSelectAll,
}: BulkSelectToolbarProps) {
  const [activePicker, setActivePicker] = useState<ActivePicker>(null);
  const [members, setMembers] = useState<BoardMember[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Close picker on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setActivePicker(null);
      }
    };
    if (activePicker) {
      document.addEventListener('mousedown', handler);
    }
    return () => document.removeEventListener('mousedown', handler);
  }, [activePicker]);

  // Close picker on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActivePicker(null);
      }
    };
    if (activePicker) {
      document.addEventListener('keydown', handler);
    }
    return () => document.removeEventListener('keydown', handler);
  }, [activePicker]);

  // Fetch members when assign picker opens
  useEffect(() => {
    if (activePicker === 'assign' && members.length === 0) {
      setLoading(true);
      fetch(`/api/boards/${boardId}/members`)
        .then((r) => r.json())
        .then((json) => {
          const data = Array.isArray(json) ? json : json?.data ?? [];
          setMembers(data);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [activePicker, boardId, members.length]);

  // Fetch labels when label picker opens
  useEffect(() => {
    if (activePicker === 'label' && labels.length === 0) {
      setLoading(true);
      fetch(`/api/boards/${boardId}/labels`)
        .then((r) => r.json())
        .then((json) => {
          const data = Array.isArray(json) ? json : json?.data ?? [];
          setLabels(data);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [activePicker, boardId, labels.length]);

  // Auto-clear feedback
  useEffect(() => {
    if (feedback) {
      const t = setTimeout(() => setFeedback(null), 3000);
      return () => clearTimeout(t);
    }
  }, [feedback]);

  const handleAction = async (action: string, params?: Record<string, string>) => {
    setActionInProgress(true);
    try {
      await onAction(action, params);
      const actionNames: Record<string, string> = {
        move: 'Moved',
        assign: 'Assigned',
        add_label: 'Labeled',
        set_priority: 'Priority set for',
        delete: 'Deleted',
        archive: 'Archived',
      };
      setFeedback({
        type: 'success',
        message: `${actionNames[action] || 'Updated'} ${selectedCount} card${selectedCount !== 1 ? 's' : ''}`,
      });
    } catch {
      setFeedback({ type: 'error', message: 'Operation failed. Please try again.' });
    } finally {
      setActionInProgress(false);
      setActivePicker(null);
    }
  };

  const handleDelete = () => {
    if (confirm(`Delete ${selectedCount} card${selectedCount !== 1 ? 's' : ''}? This cannot be undone.`)) {
      handleAction('delete');
    }
  };

  const handleArchive = () => {
    handleAction('archive');
  };

  const priorities: { value: CardPriority; label: string; color: string }[] = [
    { value: 'urgent', label: 'Urgent', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
    { value: 'high', label: 'High', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
    { value: 'medium', label: 'Medium', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
    { value: 'low', label: 'Low', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
    { value: 'none', label: 'None', color: 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-400' },
  ];

  return (
    <>
      {/* Success/Error feedback toast */}
      {feedback && (
        <div
          className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg transition-all animate-in fade-in slide-in-from-bottom-4 duration-300 ${
            feedback.type === 'success'
              ? 'bg-green-600 text-white'
              : 'bg-red-600 text-white'
          }`}
        >
          {feedback.type === 'success' ? (
            <span className="inline-flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              {feedback.message}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
              {feedback.message}
            </span>
          )}
        </div>
      )}

      {/* Main toolbar */}
      <div
        ref={pickerRef}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100vw-2rem)] sm:w-auto bg-white dark:bg-dark-surface shadow-modal dark:shadow-none dark:border dark:border-slate-700 rounded-2xl px-4 sm:px-6 py-3 flex items-center gap-2 sm:gap-3 z-50 overflow-x-auto scrollbar-thin"
      >
        {/* Selected count */}
        <span className="text-sm font-medium text-navy dark:text-slate-100 font-body shrink-0">
          {selectedCount} selected
        </span>

        {/* Select All */}
        {onSelectAll && (
          <button
            onClick={onSelectAll}
            className="text-[11px] px-2 py-1 rounded-lg text-electric hover:bg-electric/10 transition-colors font-semibold shrink-0"
          >
            Select All
          </button>
        )}

        <div className="w-px h-5 bg-cream-dark dark:bg-slate-700 shrink-0" />

        {/* Move */}
        <div className="relative shrink-0">
          <button
            onClick={() => setActivePicker(activePicker === 'move' ? null : 'move')}
            disabled={actionInProgress}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors font-body ${
              activePicker === 'move'
                ? 'bg-electric/10 text-electric'
                : 'hover:bg-cream-dark dark:hover:bg-slate-800 text-navy dark:text-slate-100'
            } disabled:opacity-50`}
          >
            <span className="inline-flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              Move
            </span>
          </button>

          {activePicker === 'move' && (
            <div className="absolute bottom-full mb-2 left-0 w-56 bg-white dark:bg-dark-surface rounded-xl shadow-modal dark:shadow-none dark:border dark:border-slate-700 py-1 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
              <div className="px-3 py-2 text-[11px] font-semibold text-navy/40 dark:text-slate-500 uppercase tracking-wider font-heading">
                Move to list
              </div>
              <div className="max-h-48 overflow-y-auto">
                {lists.map((list) => (
                  <button
                    key={list.id}
                    onClick={() => handleAction('move', { target_list_id: list.id })}
                    className="w-full text-left px-3 py-2 text-sm text-navy dark:text-slate-200 hover:bg-cream-dark dark:hover:bg-slate-800 transition-colors font-body"
                  >
                    {list.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Assign */}
        <div className="relative shrink-0">
          <button
            onClick={() => setActivePicker(activePicker === 'assign' ? null : 'assign')}
            disabled={actionInProgress}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors font-body ${
              activePicker === 'assign'
                ? 'bg-electric/10 text-electric'
                : 'hover:bg-cream-dark dark:hover:bg-slate-800 text-navy dark:text-slate-100'
            } disabled:opacity-50`}
          >
            <span className="inline-flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
              Assign
            </span>
          </button>

          {activePicker === 'assign' && (
            <div className="absolute bottom-full mb-2 left-0 w-64 bg-white dark:bg-dark-surface rounded-xl shadow-modal dark:shadow-none dark:border dark:border-slate-700 py-1 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
              <div className="px-3 py-2 text-[11px] font-semibold text-navy/40 dark:text-slate-500 uppercase tracking-wider font-heading">
                Assign to
              </div>
              {loading ? (
                <div className="px-3 py-4 text-sm text-navy/40 dark:text-slate-500 text-center font-body">Loading...</div>
              ) : members.length === 0 ? (
                <div className="px-3 py-4 text-sm text-navy/40 dark:text-slate-500 text-center font-body">No members found</div>
              ) : (
                <div className="max-h-48 overflow-y-auto">
                  {members.map((m) => (
                    <button
                      key={m.user_id}
                      onClick={() => handleAction('assign', { user_id: m.user_id })}
                      className="w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-cream-dark dark:hover:bg-slate-800 transition-colors"
                    >
                      <Avatar
                        name={m.profile?.display_name || 'User'}
                        src={m.profile?.avatar_url}
                        size="sm"
                      />
                      <span className="text-sm text-navy dark:text-slate-200 font-body truncate">
                        {m.profile?.display_name || 'Unknown'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Label */}
        <div className="relative shrink-0">
          <button
            onClick={() => setActivePicker(activePicker === 'label' ? null : 'label')}
            disabled={actionInProgress}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors font-body ${
              activePicker === 'label'
                ? 'bg-electric/10 text-electric'
                : 'hover:bg-cream-dark dark:hover:bg-slate-800 text-navy dark:text-slate-100'
            } disabled:opacity-50`}
          >
            <span className="inline-flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
              Label
            </span>
          </button>

          {activePicker === 'label' && (
            <div className="absolute bottom-full mb-2 left-0 w-56 bg-white dark:bg-dark-surface rounded-xl shadow-modal dark:shadow-none dark:border dark:border-slate-700 py-1 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
              <div className="px-3 py-2 text-[11px] font-semibold text-navy/40 dark:text-slate-500 uppercase tracking-wider font-heading">
                Add label
              </div>
              {loading ? (
                <div className="px-3 py-4 text-sm text-navy/40 dark:text-slate-500 text-center font-body">Loading...</div>
              ) : labels.length === 0 ? (
                <div className="px-3 py-4 text-sm text-navy/40 dark:text-slate-500 text-center font-body">No labels on this board</div>
              ) : (
                <div className="max-h-48 overflow-y-auto">
                  {labels.map((label) => (
                    <button
                      key={label.id}
                      onClick={() => handleAction('add_label', { label_id: label.id })}
                      className="w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-cream-dark dark:hover:bg-slate-800 transition-colors"
                    >
                      <span
                        className="w-6 h-4 rounded-sm shrink-0"
                        style={{ backgroundColor: label.color }}
                      />
                      <span className="text-sm text-navy dark:text-slate-200 font-body truncate">
                        {label.name}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Priority */}
        <div className="relative shrink-0">
          <button
            onClick={() => setActivePicker(activePicker === 'priority' ? null : 'priority')}
            disabled={actionInProgress}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors font-body ${
              activePicker === 'priority'
                ? 'bg-electric/10 text-electric'
                : 'hover:bg-cream-dark dark:hover:bg-slate-800 text-navy dark:text-slate-100'
            } disabled:opacity-50`}
          >
            <span className="inline-flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/></svg>
              Priority
            </span>
          </button>

          {activePicker === 'priority' && (
            <div className="absolute bottom-full mb-2 left-0 w-48 bg-white dark:bg-dark-surface rounded-xl shadow-modal dark:shadow-none dark:border dark:border-slate-700 py-1 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
              <div className="px-3 py-2 text-[11px] font-semibold text-navy/40 dark:text-slate-500 uppercase tracking-wider font-heading">
                Set priority
              </div>
              {priorities.map((p) => (
                <button
                  key={p.value}
                  onClick={() => handleAction('set_priority', { priority: p.value })}
                  className="w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-cream-dark dark:hover:bg-slate-800 transition-colors"
                >
                  <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${p.color}`}>
                    {p.label}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Archive */}
        <button
          onClick={handleArchive}
          disabled={actionInProgress}
          className="px-3 py-2 rounded-lg text-sm font-medium hover:bg-cream-dark dark:hover:bg-slate-800 transition-colors text-navy/70 dark:text-slate-300 font-body shrink-0 disabled:opacity-50"
        >
          <span className="inline-flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
            Archive
          </span>
        </button>

        {/* Delete */}
        <button
          onClick={handleDelete}
          disabled={actionInProgress}
          className="px-3 py-2 rounded-lg text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-danger font-body shrink-0 disabled:opacity-50"
        >
          <span className="inline-flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Delete
          </span>
        </button>

        <div className="w-px h-5 bg-cream-dark dark:bg-slate-700 shrink-0" />

        {/* Clear */}
        <button
          onClick={onClear}
          disabled={actionInProgress}
          className="px-3 py-2 rounded-lg text-sm font-medium hover:bg-cream-dark dark:hover:bg-slate-800 transition-colors text-navy/60 dark:text-slate-400 font-body shrink-0 disabled:opacity-50"
        >
          <span className="inline-flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Clear
          </span>
        </button>

        {/* Loading indicator */}
        {actionInProgress && (
          <div className="shrink-0">
            <svg className="animate-spin h-4 w-4 text-electric" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        )}
      </div>
    </>
  );
}
