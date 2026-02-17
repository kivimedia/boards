'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SavedCommand } from '@/lib/types';

interface SavedCommandsListProps {
  boardId: string;
  onSelectCommand: (command: string) => void;
}

export default function SavedCommandsList({ boardId, onSelectCommand }: SavedCommandsListProps) {
  const [commands, setCommands] = useState<SavedCommand[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch(`/api/saved-commands?board_id=${boardId}`)
      .then(res => res.json())
      .then(json => {
        if (!cancelled) {
          setCommands(json.data || []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [boardId]);

  const handleDelete = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCommands(prev => prev.filter(c => c.id !== id));

    try {
      await fetch(`/api/saved-commands?id=${id}`, { method: 'DELETE' });
    } catch {
      // silent - optimistic deletion
    }
  }, []);

  const handleSelect = useCallback(async (cmd: SavedCommand) => {
    onSelectCommand(cmd.command);

    // Bump usage count (fire and forget)
    fetch(`/api/saved-commands?board_id=${boardId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        board_id: boardId,
        name: cmd.name,
        command: cmd.command,
        icon: cmd.icon,
      }),
    }).catch(() => {});
  }, [boardId, onSelectCommand]);

  if (loading) {
    return (
      <div className="px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 border border-cream-dark dark:border-slate-700 rounded-full animate-pulse" />
          <p className="text-[10px] text-navy/30 dark:text-slate-500 font-body">Loading saved commands...</p>
        </div>
      </div>
    );
  }

  if (commands.length === 0) {
    return (
      <div className="px-4 py-4 text-center">
        <p className="text-xs text-navy/40 dark:text-slate-500 font-body">
          No saved commands yet. Run a command and save it as a recipe.
        </p>
        <p className="text-[10px] text-navy/30 dark:text-slate-500 font-body mt-1">
          Press <kbd className="px-1.5 py-0.5 bg-cream-dark dark:bg-slate-800 rounded text-[10px] font-body">Enter</kbd> to run a command
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 py-3">
      <p className="text-[10px] text-navy/30 dark:text-slate-500 font-body uppercase tracking-wide mb-2">
        Saved Commands ({commands.length})
      </p>
      <div className="flex flex-wrap gap-1.5">
        {commands.map(cmd => (
          <button
            key={cmd.id}
            onClick={() => handleSelect(cmd)}
            className="group flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-body text-navy dark:text-slate-300 bg-orange-50 dark:bg-orange-900/10 hover:bg-orange-100 dark:hover:bg-orange-900/20 border border-orange-200 dark:border-orange-800/30 rounded-full transition-colors"
          >
            <svg className="w-3 h-3 text-orange-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span className="max-w-[150px] truncate">{cmd.name}</span>
            <button
              onClick={(e) => handleDelete(cmd.id, e)}
              className="hidden group-hover:block -mr-1 p-0.5 text-navy/20 dark:text-slate-600 hover:text-red-400"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </button>
        ))}
      </div>
    </div>
  );
}
