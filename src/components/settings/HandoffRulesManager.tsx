'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { BOARD_TYPE_CONFIG } from '@/lib/constants';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import type { Board, BoardType, HandoffRule } from '@/lib/types';

interface ListOption {
  id: string;
  name: string;
}

const INHERIT_FIELD_OPTIONS = [
  { key: 'title', label: 'Title' },
  { key: 'description', label: 'Description' },
  { key: 'priority', label: 'Priority' },
  { key: 'client_id', label: 'Client' },
  { key: 'labels', label: 'Labels' },
  { key: 'custom_fields', label: 'Custom Fields' },
];

export default function HandoffRulesManager() {
  const [rules, setRules] = useState<HandoffRule[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<HandoffRule | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [sourceBoardId, setSourceBoardId] = useState('');
  const [sourceColumn, setSourceColumn] = useState('');
  const [targetBoardId, setTargetBoardId] = useState('');
  const [targetColumn, setTargetColumn] = useState('');
  const [inheritFields, setInheritFields] = useState<string[]>(['title', 'description', 'priority']);

  // Lists for selected boards
  const [sourceListOptions, setSourceListOptions] = useState<ListOption[]>([]);
  const [targetListOptions, setTargetListOptions] = useState<ListOption[]>([]);

  const supabase = createClient();

  const fetchRules = useCallback(async () => {
    const { data, error } = await supabase
      .from('handoff_rules')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[HandoffRules] Failed to fetch rules:', error.message);
    }
    if (data) setRules(data);
  }, []);

  const fetchBoards = useCallback(async () => {
    const { data, error } = await supabase
      .from('boards')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) {
      console.error('[HandoffRules] Failed to fetch boards:', error.message);
    }
    if (data) setBoards(data);
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      // Wait for auth session to be available before fetching
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.warn('[HandoffRules] No auth session, waiting...');
        // Listen for auth state change
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          async (event, sess) => {
            if (sess) {
              await Promise.all([fetchRules(), fetchBoards()]);
              setLoading(false);
              subscription.unsubscribe();
            }
          }
        );
        return;
      }
      await Promise.all([fetchRules(), fetchBoards()]);
      setLoading(false);
    };
    load();
  }, [fetchRules, fetchBoards]);

  // Fetch lists when source board changes
  useEffect(() => {
    if (!sourceBoardId) {
      setSourceListOptions([]);
      return;
    }
    const fetchLists = async () => {
      const { data, error } = await supabase
        .from('lists')
        .select('id, name')
        .eq('board_id', sourceBoardId)
        .order('position', { ascending: true });
      if (error) console.error('[HandoffRules] Fetch source lists:', error.message);
      setSourceListOptions(data || []);
    };
    fetchLists();
  }, [sourceBoardId]);

  // Fetch lists when target board changes
  useEffect(() => {
    if (!targetBoardId) {
      setTargetListOptions([]);
      return;
    }
    const fetchLists = async () => {
      const { data, error } = await supabase
        .from('lists')
        .select('id, name')
        .eq('board_id', targetBoardId)
        .order('position', { ascending: true });
      if (error) console.error('[HandoffRules] Fetch target lists:', error.message);
      setTargetListOptions(data || []);
    };
    fetchLists();
  }, [targetBoardId]);

  const resetForm = () => {
    setFormName('');
    setSourceBoardId('');
    setSourceColumn('');
    setTargetBoardId('');
    setTargetColumn('');
    setInheritFields(['title', 'description', 'priority']);
    setEditingRule(null);
  };

  const openCreateForm = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (rule: HandoffRule) => {
    setEditingRule(rule);
    setFormName(rule.name);
    setSourceBoardId(rule.source_board_id);
    setSourceColumn(rule.source_column);
    setTargetBoardId(rule.target_board_id);
    setTargetColumn(rule.target_column);
    setInheritFields(rule.inherit_fields);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formName || !sourceBoardId || !sourceColumn || !targetBoardId || !targetColumn) return;

    setSaving(true);

    const payload = {
      name: formName,
      source_board_id: sourceBoardId,
      source_column: sourceColumn,
      target_board_id: targetBoardId,
      target_column: targetColumn,
      inherit_fields: inheritFields,
    };

    if (editingRule) {
      await supabase
        .from('handoff_rules')
        .update(payload)
        .eq('id', editingRule.id);
    } else {
      await supabase.from('handoff_rules').insert(payload);
    }

    setSaving(false);
    setShowForm(false);
    resetForm();
    fetchRules();
  };

  const handleDelete = async (ruleId: string) => {
    if (!confirm('Are you sure you want to delete this handoff rule?')) return;
    await supabase.from('handoff_rules').delete().eq('id', ruleId);
    fetchRules();
  };

  const handleToggleActive = async (rule: HandoffRule) => {
    await supabase
      .from('handoff_rules')
      .update({ is_active: !rule.is_active })
      .eq('id', rule.id);
    setRules((prev) =>
      prev.map((r) => (r.id === rule.id ? { ...r, is_active: !r.is_active } : r))
    );
  };

  const getBoardName = (boardId: string) => {
    const board = boards.find((b) => b.id === boardId);
    if (!board) return 'Unknown Board';
    const config = BOARD_TYPE_CONFIG[board.type as BoardType];
    return `${config?.icon || '📋'} ${board.name}`;
  };

  const toggleInheritField = (field: string) => {
    setInheritFields((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]
    );
  };

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto bg-cream dark:bg-dark-bg p-4 sm:p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-cream dark:bg-dark-bg p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <p className="text-navy/60 dark:text-slate-400 font-body text-sm">
            Configure rules that automatically hand off cards between boards when they reach specific columns.
          </p>
          <Button onClick={openCreateForm} size="sm">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Create Rule
          </Button>
        </div>

        {/* Rules List */}
        {rules.length === 0 ? (
          <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-12 text-center">
            <div className="w-12 h-12 rounded-xl bg-cream-dark dark:bg-slate-800 flex items-center justify-center mx-auto mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-navy/30 dark:text-slate-500">
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </div>
            <p className="text-sm text-navy/50 dark:text-slate-400 font-body mb-1">No handoff rules yet</p>
            <p className="text-xs text-navy/30 dark:text-slate-500 font-body">
              Create a rule to automate card handoffs between boards.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className={`
                  bg-white dark:bg-dark-surface rounded-2xl border-2 p-5 transition-all duration-200
                  ${rule.is_active ? 'border-cream-dark dark:border-slate-700' : 'border-cream-dark/50 dark:border-slate-700/50 opacity-60'}
                `}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">
                        {rule.name}
                      </h3>
                      <span className={`
                        px-2 py-0.5 rounded-full text-[10px] font-bold
                        ${rule.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}
                      `}>
                        {rule.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    {/* Flow visualization */}
                    <div className="flex items-center gap-2 text-xs font-body text-navy/60 dark:text-slate-400 flex-wrap">
                      <span className="bg-cream-dark dark:bg-slate-800 px-2 py-1 rounded-lg">
                        {getBoardName(rule.source_board_id)}
                      </span>
                      <span className="text-navy/30">/</span>
                      <span className="text-navy/80 dark:text-slate-300 font-medium">{rule.source_column}</span>
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-electric shrink-0">
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                      </svg>
                      <span className="bg-cream-dark dark:bg-slate-800 px-2 py-1 rounded-lg">
                        {getBoardName(rule.target_board_id)}
                      </span>
                      <span className="text-navy/30">/</span>
                      <span className="text-navy/80 dark:text-slate-300 font-medium">{rule.target_column}</span>
                    </div>

                    {/* Inherit fields */}
                    {rule.inherit_fields.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        <span className="text-[10px] text-navy/30 dark:text-slate-500 font-body">Inherits:</span>
                        {rule.inherit_fields.map((field) => (
                          <span
                            key={field}
                            className="px-1.5 py-0.5 bg-electric/5 text-electric text-[10px] rounded font-medium"
                          >
                            {field}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleToggleActive(rule)}
                      className={`
                        relative w-9 h-5 rounded-full transition-colors duration-200
                        ${rule.is_active ? 'bg-green-500' : 'bg-gray-300'}
                      `}
                      title={rule.is_active ? 'Deactivate' : 'Activate'}
                    >
                      <div className={`
                        absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200
                        ${rule.is_active ? 'translate-x-4' : 'translate-x-0.5'}
                      `} />
                    </button>
                    <button
                      onClick={() => openEditForm(rule)}
                      className="p-1.5 rounded-lg text-navy/40 dark:text-slate-500 hover:text-navy dark:hover:text-slate-200 hover:bg-cream-dark dark:hover:bg-slate-800 transition-colors"
                      title="Edit"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(rule.id)}
                      className="p-1.5 rounded-lg text-navy/40 dark:text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                      title="Delete"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create/Edit Modal */}
        <Modal isOpen={showForm} onClose={() => { setShowForm(false); resetForm(); }} size="lg">
          <div className="p-6">
            <h2 className="text-lg font-semibold text-navy dark:text-slate-100 font-heading mb-6">
              {editingRule ? 'Edit Handoff Rule' : 'Create Handoff Rule'}
            </h2>

            <div className="space-y-5">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-navy dark:text-slate-100 mb-1.5 font-body">
                  Rule Name
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g., Design to Dev Handoff"
                  className="w-full px-3 py-2 text-sm rounded-xl border-2 border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:border-electric focus:ring-1 focus:ring-electric font-body transition-colors"
                />
              </div>

              {/* Source */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-navy dark:text-slate-100 mb-1.5 font-body">
                    Source Board
                  </label>
                  <select
                    value={sourceBoardId}
                    onChange={(e) => {
                      setSourceBoardId(e.target.value);
                      setSourceColumn('');
                    }}
                    className="w-full px-3 py-2 text-sm rounded-xl border-2 border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-navy dark:text-slate-100 focus:outline-none focus:border-electric focus:ring-1 focus:ring-electric font-body transition-colors"
                  >
                    <option value="">Select board...</option>
                    {boards.map((board) => {
                      const config = BOARD_TYPE_CONFIG[board.type as BoardType];
                      return (
                        <option key={board.id} value={board.id}>
                          {config?.icon || '📋'} {board.name}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-navy dark:text-slate-100 mb-1.5 font-body">
                    Source Column
                  </label>
                  <select
                    value={sourceColumn}
                    onChange={(e) => setSourceColumn(e.target.value)}
                    disabled={!sourceBoardId}
                    className="w-full px-3 py-2 text-sm rounded-xl border-2 border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-navy dark:text-slate-100 focus:outline-none focus:border-electric focus:ring-1 focus:ring-electric font-body transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="">Select column...</option>
                    {sourceListOptions.map((list) => (
                      <option key={list.id} value={list.name}>
                        {list.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Arrow */}
              <div className="flex justify-center">
                <div className="w-10 h-10 rounded-xl bg-electric/10 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-electric">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <polyline points="19 12 12 19 5 12" />
                  </svg>
                </div>
              </div>

              {/* Target */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-navy dark:text-slate-100 mb-1.5 font-body">
                    Target Board
                  </label>
                  <select
                    value={targetBoardId}
                    onChange={(e) => {
                      setTargetBoardId(e.target.value);
                      setTargetColumn('');
                    }}
                    className="w-full px-3 py-2 text-sm rounded-xl border-2 border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-navy dark:text-slate-100 focus:outline-none focus:border-electric focus:ring-1 focus:ring-electric font-body transition-colors"
                  >
                    <option value="">Select board...</option>
                    {boards.map((board) => {
                      const config = BOARD_TYPE_CONFIG[board.type as BoardType];
                      return (
                        <option key={board.id} value={board.id}>
                          {config?.icon || '📋'} {board.name}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-navy dark:text-slate-100 mb-1.5 font-body">
                    Target Column
                  </label>
                  <select
                    value={targetColumn}
                    onChange={(e) => setTargetColumn(e.target.value)}
                    disabled={!targetBoardId}
                    className="w-full px-3 py-2 text-sm rounded-xl border-2 border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-navy dark:text-slate-100 focus:outline-none focus:border-electric focus:ring-1 focus:ring-electric font-body transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="">Select column...</option>
                    {targetListOptions.map((list) => (
                      <option key={list.id} value={list.name}>
                        {list.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Inherit Fields */}
              <div>
                <label className="block text-sm font-medium text-navy dark:text-slate-100 mb-2 font-body">
                  Inherit Fields
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {INHERIT_FIELD_OPTIONS.map((option) => (
                    <label
                      key={option.key}
                      className={`
                        flex items-center gap-2 px-3 py-2 rounded-xl border-2 cursor-pointer transition-all duration-200 text-sm font-body
                        ${inheritFields.includes(option.key)
                          ? 'border-electric bg-electric/5 text-electric'
                          : 'border-cream-dark dark:border-slate-700 text-navy/50 dark:text-slate-400 hover:border-navy/20 dark:hover:border-slate-600'
                        }
                      `}
                    >
                      <input
                        type="checkbox"
                        checked={inheritFields.includes(option.key)}
                        onChange={() => toggleInheritField(option.key)}
                        className="sr-only"
                      />
                      <div className={`
                        w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors
                        ${inheritFields.includes(option.key) ? 'bg-electric border-electric' : 'border-navy/20'}
                      `}>
                        {inheritFields.includes(option.key) && (
                          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-cream-dark dark:border-slate-700">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setShowForm(false); resetForm(); }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                loading={saving}
                disabled={!formName || !sourceBoardId || !sourceColumn || !targetBoardId || !targetColumn}
              >
                {editingRule ? 'Save Changes' : 'Create Rule'}
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
}
