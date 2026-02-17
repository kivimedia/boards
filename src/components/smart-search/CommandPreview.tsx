'use client';

import { useState, useCallback } from 'react';
import type { CommandActionPlan, CommandAction, CommandExecutionResult } from '@/lib/types';

interface CommandPreviewProps {
  plan: CommandActionPlan;
  loading: boolean;
  executing: boolean;
  results: CommandExecutionResult[] | null;
  onExecute: (actions: CommandAction[]) => void;
  onCancel: () => void;
  onSaveRecipe: (name: string, command: string) => void;
  command: string;
}

const ACTION_ICONS: Record<string, string> = {
  move: 'M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4',
  assign: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  add_label: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z',
  set_priority: 'M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9',
  archive: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4',
  unarchive: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4',
};

export default function CommandPreview({
  plan,
  loading,
  executing,
  results,
  onExecute,
  onCancel,
  onSaveRecipe,
  command,
}: CommandPreviewProps) {
  const [checked, setChecked] = useState<Record<number, boolean>>(() => {
    const initial: Record<number, boolean> = {};
    plan.actions.forEach((_, i) => { initial[i] = true; });
    return initial;
  });
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [recipeName, setRecipeName] = useState('');

  const toggleAction = useCallback((index: number) => {
    setChecked(prev => ({ ...prev, [index]: !prev[index] }));
  }, []);

  const checkedActions = plan.actions.filter((_, i) => checked[i]);
  const checkedCount = checkedActions.length;

  const handleExecute = useCallback(() => {
    onExecute(checkedActions);
  }, [checkedActions, onExecute]);

  const handleSaveRecipe = useCallback(() => {
    if (recipeName.trim()) {
      onSaveRecipe(recipeName.trim(), command);
      setShowSaveInput(false);
      setRecipeName('');
    }
  }, [recipeName, command, onSaveRecipe]);

  // Loading state
  if (loading) {
    return (
      <div className="px-4 py-6">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-navy/60 dark:text-slate-400 font-body">Parsing command...</p>
        </div>
      </div>
    );
  }

  // No actions found
  if (plan.actions.length === 0) {
    return (
      <div className="px-4 py-4">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-full bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <p className="text-sm text-navy dark:text-slate-200 font-body">{plan.summary}</p>
            <button
              onClick={onCancel}
              className="mt-2 text-xs text-navy/40 dark:text-slate-500 hover:text-navy dark:hover:text-slate-300 font-body"
            >
              Try a different command
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Results state
  if (results) {
    const allSuccess = results.every(r => r.success);
    const totalAffected = results.reduce((sum, r) => sum + r.affected_count, 0);

    return (
      <div className="px-4 py-4">
        <div className="flex items-center gap-2 mb-3">
          {allSuccess ? (
            <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          )}
          <p className="text-sm font-medium text-navy dark:text-white font-body">
            {allSuccess
              ? `Done - ${totalAffected} card${totalAffected !== 1 ? 's' : ''} affected`
              : 'Completed with some errors'
            }
          </p>
        </div>

        {/* Per-action results */}
        <div className="space-y-1.5 mb-3">
          {results.map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-xs font-body">
              {r.success ? (
                <svg className="w-3.5 h-3.5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              <span className={r.success ? 'text-navy/60 dark:text-slate-400' : 'text-red-500'}>
                {plan.actions[r.action_index]?.description || `Action ${r.action_index + 1}`}
                {r.success && ` (${r.affected_count})`}
                {r.error && ` - ${r.error}`}
              </span>
            </div>
          ))}
        </div>

        <button
          onClick={onCancel}
          className="text-xs text-navy/40 dark:text-slate-500 hover:text-navy dark:hover:text-slate-300 font-body"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 py-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-5 h-5 rounded bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <p className="text-xs font-medium text-navy dark:text-white font-body">Command Plan</p>
      </div>

      <p className="text-xs text-navy/60 dark:text-slate-400 font-body mb-3">{plan.summary}</p>

      {/* Warning banner */}
      {plan.warning && (
        <div className="mb-3 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30">
          <p className="text-xs text-amber-700 dark:text-amber-300 font-body">{plan.warning}</p>
        </div>
      )}

      {/* Action list */}
      <div className="space-y-2 mb-4">
        {plan.actions.map((action, i) => (
          <label
            key={i}
            className="flex items-start gap-2.5 cursor-pointer group"
          >
            <input
              type="checkbox"
              checked={checked[i] ?? true}
              onChange={() => toggleAction(i)}
              className="mt-0.5 rounded border-cream-dark dark:border-slate-600 text-orange-500 focus:ring-orange-400"
            />
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <svg className="w-4 h-4 text-navy/30 dark:text-slate-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={ACTION_ICONS[action.type] || ACTION_ICONS.move} />
              </svg>
              <span className="text-xs text-navy dark:text-slate-200 font-body">
                {action.description}
              </span>
              <span className="text-[10px] text-navy/30 dark:text-slate-500 font-body flex-shrink-0">
                {action.card_ids.length} card{action.card_ids.length !== 1 ? 's' : ''}
              </span>
            </div>
          </label>
        ))}
      </div>

      {/* Footer buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleExecute}
          disabled={checkedCount === 0 || executing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium font-body text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
        >
          {executing ? (
            <>
              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Executing...
            </>
          ) : (
            <>
              Execute ({checkedCount} action{checkedCount !== 1 ? 's' : ''})
            </>
          )}
        </button>

        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-body text-navy/50 dark:text-slate-400 hover:text-navy dark:hover:text-white transition-colors"
        >
          Cancel
        </button>

        {!showSaveInput ? (
          <button
            onClick={() => setShowSaveInput(true)}
            className="ml-auto px-2 py-1.5 text-[10px] font-body text-navy/30 dark:text-slate-500 hover:text-orange-500 dark:hover:text-orange-400 transition-colors"
          >
            Save as Recipe
          </button>
        ) : (
          <div className="ml-auto flex items-center gap-1.5">
            <input
              type="text"
              value={recipeName}
              onChange={(e) => setRecipeName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveRecipe()}
              placeholder="Recipe name..."
              className="w-32 px-2 py-1 text-[10px] font-body bg-cream-dark/50 dark:bg-slate-800 border border-cream-dark dark:border-slate-700 rounded text-navy dark:text-white placeholder:text-navy/30 dark:placeholder:text-slate-500 outline-none focus:border-orange-400"
              autoFocus
            />
            <button
              onClick={handleSaveRecipe}
              disabled={!recipeName.trim()}
              className="text-[10px] font-body text-orange-500 hover:text-orange-600 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
