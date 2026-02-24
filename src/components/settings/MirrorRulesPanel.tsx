'use client';

import { useState, useEffect, useCallback } from 'react';

interface Board {
  id: string;
  name: string;
  type: string;
}

interface MirrorRule {
  id: string;
  source_board_id: string;
  source_list_name: string;
  target_board_id: string;
  target_list_name: string;
  direction: string;
  condition_field: string | null;
  condition_value: string | null;
  remove_from_source: boolean;
  is_active: boolean;
  source_board?: Board;
  target_board?: Board;
}

export default function MirrorRulesPanel() {
  const [rules, setRules] = useState<MirrorRule[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New rule form state
  const [newSourceBoard, setNewSourceBoard] = useState('');
  const [newSourceList, setNewSourceList] = useState('');
  const [newTargetBoard, setNewTargetBoard] = useState('');
  const [newTargetList, setNewTargetList] = useState('');
  const [newDirection, setNewDirection] = useState('one_way');
  const [newRemoveSource, setNewRemoveSource] = useState(false);

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch('/api/mirror-rules');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setRules(data.data || []);
    } catch {
      setError('Failed to load mirror rules');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBoards = useCallback(async () => {
    try {
      const res = await fetch('/api/boards');
      if (!res.ok) return;
      const data = await res.json();
      setBoards(data.data || []);
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    fetchRules();
    fetchBoards();
  }, [fetchRules, fetchBoards]);

  const handleSeedDefaults = async () => {
    setSeeding(true);
    setSeedResult(null);
    try {
      const res = await fetch('/api/mirror-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed_defaults: true }),
      });
      const data = await res.json();
      const result = data.data;
      setSeedResult(`Created ${result.created}, skipped ${result.skipped}${result.errors?.length ? `, ${result.errors.length} errors` : ''}`);
      fetchRules();
    } catch {
      setSeedResult('Failed to seed defaults');
    } finally {
      setSeeding(false);
    }
  };

  const handleToggle = async (ruleId: string, currentActive: boolean) => {
    try {
      await fetch(`/api/mirror-rules/${ruleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !currentActive }),
      });
      setRules((prev) =>
        prev.map((r) => (r.id === ruleId ? { ...r, is_active: !currentActive } : r)),
      );
    } catch {
      setError('Failed to toggle rule');
    }
  };

  const handleDelete = async (ruleId: string) => {
    if (!confirm('Delete this mirror rule?')) return;
    try {
      await fetch(`/api/mirror-rules/${ruleId}`, { method: 'DELETE' });
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
    } catch {
      setError('Failed to delete rule');
    }
  };

  const handleAdd = async () => {
    if (!newSourceBoard || !newSourceList || !newTargetBoard || !newTargetList) {
      setError('All fields are required');
      return;
    }

    try {
      const res = await fetch('/api/mirror-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_board_id: newSourceBoard,
          source_list_name: newSourceList,
          target_board_id: newTargetBoard,
          target_list_name: newTargetList,
          direction: newDirection,
          remove_from_source: newRemoveSource,
        }),
      });
      if (!res.ok) throw new Error('Failed to create');

      setShowAdd(false);
      setNewSourceBoard('');
      setNewSourceList('');
      setNewTargetBoard('');
      setNewTargetList('');
      setNewDirection('one_way');
      setNewRemoveSource(false);
      fetchRules();
    } catch {
      setError('Failed to create rule');
    }
  };

  const getBoardName = (boardId: string, rule: MirrorRule) => {
    if (rule.source_board && rule.source_board.id === boardId) return rule.source_board.name;
    if (rule.target_board && rule.target_board.id === boardId) return rule.target_board.name;
    const board = boards.find((b) => b.id === boardId);
    return board?.name || boardId.slice(0, 8);
  };

  const inputClass =
    'w-full px-2.5 py-1.5 rounded-lg bg-cream dark:bg-navy border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-colors font-body';
  const selectClass = `${inputClass} appearance-none`;
  const labelClass = 'text-[11px] font-medium text-navy/50 dark:text-slate-400 uppercase tracking-wide';

  if (loading) {
    return (
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="animate-pulse rounded-xl bg-cream-dark/50 dark:bg-slate-700/40 h-16" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-navy dark:text-slate-100 font-heading">
            Mirror Rules
          </h2>
          <p className="text-sm text-navy/50 dark:text-slate-400 font-body mt-0.5">
            Automatically show cards on multiple boards when they enter specific lists.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSeedDefaults}
            disabled={seeding}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors disabled:opacity-50"
          >
            {seeding ? 'Seeding...' : 'Seed Defaults'}
          </button>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-electric text-white hover:bg-electric-bright transition-colors"
          >
            + Add Rule
          </button>
        </div>
      </div>

      {seedResult && (
        <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40 text-sm text-blue-700 dark:text-blue-400">
          {seedResult}
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 text-sm text-red-600 dark:text-red-400">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}

      {/* Add Rule Form */}
      {showAdd && (
        <div className="p-4 rounded-xl bg-cream-dark/30 dark:bg-slate-800/50 border border-cream-dark dark:border-slate-700 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Source Board</label>
              <select value={newSourceBoard} onChange={(e) => setNewSourceBoard(e.target.value)} className={selectClass}>
                <option value="">Select...</option>
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Source List Name</label>
              <input
                type="text"
                value={newSourceList}
                onChange={(e) => setNewSourceList(e.target.value)}
                placeholder="e.g. Halley Needs to Review"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Target Board</label>
              <select value={newTargetBoard} onChange={(e) => setNewTargetBoard(e.target.value)} className={selectClass}>
                <option value="">Select...</option>
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Target List Name</label>
              <input
                type="text"
                value={newTargetList}
                onChange={(e) => setNewTargetList(e.target.value)}
                placeholder="e.g. Halley Needs to Review"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Direction</label>
              <select value={newDirection} onChange={(e) => setNewDirection(e.target.value)} className={selectClass}>
                <option value="one_way">One Way</option>
                <option value="bidirectional">Bidirectional</option>
              </select>
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newRemoveSource}
                  onChange={(e) => setNewRemoveSource(e.target.checked)}
                  className="w-4 h-4 rounded border-cream-dark dark:border-slate-600 text-electric focus:ring-electric/30"
                />
                <span className="text-sm text-navy dark:text-slate-200">Remove from source</span>
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowAdd(false)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-navy/60 dark:text-slate-400 hover:bg-cream-dark dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-electric text-white hover:bg-electric-bright transition-colors"
            >
              Create Rule
            </button>
          </div>
        </div>
      )}

      {/* Rules Table */}
      {rules.length === 0 ? (
        <div className="text-center py-12 text-navy/40 dark:text-slate-500 text-sm">
          No mirror rules configured. Click &quot;Seed Defaults&quot; to create the standard rules.
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                rule.is_active
                  ? 'bg-white dark:bg-dark-surface border-cream-dark dark:border-slate-700'
                  : 'bg-cream-dark/20 dark:bg-slate-800/30 border-cream-dark/50 dark:border-slate-700/50 opacity-60'
              }`}
            >
              {/* Toggle */}
              <button
                onClick={() => handleToggle(rule.id, rule.is_active)}
                className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${
                  rule.is_active ? 'bg-green-500' : 'bg-gray-300 dark:bg-slate-600'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                    rule.is_active ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>

              {/* Rule description */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-sm text-navy dark:text-slate-200 truncate">
                  <span className="font-medium truncate">{getBoardName(rule.source_board_id, rule)}</span>
                  <span className="text-navy/30 dark:text-slate-500">/</span>
                  <span className="text-electric truncate">{rule.source_list_name}</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-navy/30 dark:text-slate-500 shrink-0">
                    {rule.direction === 'bidirectional' ? (
                      <>
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                        <polyline points="12 5 5 12 12 19" />
                      </>
                    ) : (
                      <>
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                      </>
                    )}
                  </svg>
                  <span className="font-medium truncate">{getBoardName(rule.target_board_id, rule)}</span>
                  <span className="text-navy/30 dark:text-slate-500">/</span>
                  <span className="text-electric truncate">{rule.target_list_name}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {rule.remove_from_source && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                      removes source
                    </span>
                  )}
                  {rule.direction === 'bidirectional' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
                      bidirectional
                    </span>
                  )}
                  {rule.condition_field && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                      if {rule.condition_field}={rule.condition_value}
                    </span>
                  )}
                </div>
              </div>

              {/* Delete */}
              <button
                onClick={() => handleDelete(rule.id)}
                className="p-1.5 rounded-lg text-navy/30 dark:text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
