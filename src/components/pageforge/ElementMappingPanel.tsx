'use client';

import { useState, useEffect, useCallback } from 'react';

interface MappingProposal {
  id: string;
  section_index: number;
  section_name: string;
  figma_element_type: string;
  proposed_divi5_module: string;
  proposed_config: Record<string, unknown>;
  proposal_reasoning: string | null;
  final_divi5_module: string | null;
  decision: 'pending' | 'approved' | 'overridden';
  decided_at: string | null;
}

interface ElementMappingPanelProps {
  buildId: string;
  isGateActive: boolean; // true when build is paused at element_mapping_gate
  onApproveAll?: () => void;
}

export default function ElementMappingPanel({ buildId, isGateActive, onApproveAll }: ElementMappingPanelProps) {
  const [mappings, setMappings] = useState<MappingProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [overrideValue, setOverrideValue] = useState('');

  const fetchMappings = useCallback(async () => {
    try {
      const res = await fetch(`/api/pageforge/builds/${buildId}/mappings`);
      if (res.ok) {
        const data = await res.json();
        setMappings(data.mappings || []);
      }
    } catch (err) {
      console.error('Failed to fetch mappings:', err);
    } finally {
      setLoading(false);
    }
  }, [buildId]);

  useEffect(() => { fetchMappings(); }, [fetchMappings]);

  const handleApprove = async (mappingId: string) => {
    setSaving(true);
    try {
      await fetch(`/api/pageforge/builds/${buildId}/mappings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappingId, decision: 'approved' }),
      });
      await fetchMappings();
    } finally {
      setSaving(false);
    }
  };

  const handleOverride = async (mappingId: string) => {
    if (!overrideValue.trim()) return;
    setSaving(true);
    try {
      await fetch(`/api/pageforge/builds/${buildId}/mappings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappingId, decision: 'overridden', finalModule: overrideValue.trim() }),
      });
      setEditingId(null);
      setOverrideValue('');
      await fetchMappings();
    } finally {
      setSaving(false);
    }
  };

  const handleApproveAll = async () => {
    setSaving(true);
    try {
      await fetch(`/api/pageforge/builds/${buildId}/mappings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approveAll: true }),
      });
      await fetchMappings();
      onApproveAll?.();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 text-sm text-navy/50 dark:text-slate-500 animate-pulse">
        Loading element mappings...
      </div>
    );
  }

  if (mappings.length === 0) return null;

  const pendingCount = mappings.filter(m => m.decision === 'pending').length;
  const approvedCount = mappings.filter(m => m.decision === 'approved').length;
  const overriddenCount = mappings.filter(m => m.decision === 'overridden').length;

  return (
    <div className="rounded-xl border border-navy/10 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-navy/5 dark:bg-slate-700/50 border-b border-navy/10 dark:border-slate-700">
        <div>
          <h3 className="text-sm font-semibold text-navy dark:text-slate-200">
            Element Mapping
          </h3>
          <p className="text-[11px] text-navy/50 dark:text-slate-400 mt-0.5">
            {pendingCount > 0
              ? `${pendingCount} pending review`
              : `${approvedCount} approved, ${overriddenCount} overridden`}
          </p>
        </div>
        {isGateActive && pendingCount > 0 && (
          <button
            onClick={handleApproveAll}
            disabled={saving}
            className="text-xs px-3 py-1.5 rounded-lg bg-success text-white font-semibold hover:bg-green-600 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Approve All'}
          </button>
        )}
      </div>

      {/* Mapping rows */}
      <div className="divide-y divide-navy/5 dark:divide-slate-700">
        {mappings.map((m) => (
          <div
            key={m.id}
            className={`px-4 py-3 ${
              m.decision === 'approved' ? 'bg-green-50/50 dark:bg-green-900/10' :
              m.decision === 'overridden' ? 'bg-amber-50/50 dark:bg-amber-900/10' :
              ''
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {/* Section name + type badge */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-navy dark:text-slate-200 truncate">
                    {m.section_index + 1}. {m.section_name}
                  </span>
                  <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded bg-electric/10 text-electric">
                    {m.figma_element_type}
                  </span>
                </div>

                {/* Proposed module */}
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="text-[11px] text-navy/40 dark:text-slate-500">Proposed:</span>
                  <code className="text-[11px] font-mono text-navy/70 dark:text-slate-300 bg-navy/5 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                    {m.proposed_divi5_module}
                  </code>
                </div>

                {/* Override value if overridden */}
                {m.decision === 'overridden' && m.final_divi5_module && (
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="text-[11px] text-amber-600 dark:text-amber-400">Override:</span>
                    <code className="text-[11px] font-mono text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded">
                      {m.final_divi5_module}
                    </code>
                  </div>
                )}

                {/* Reasoning (collapsed) */}
                {m.proposal_reasoning && (
                  <p className="mt-1 text-[10px] text-navy/40 dark:text-slate-500 line-clamp-2">
                    {m.proposal_reasoning}
                  </p>
                )}

                {/* Override input */}
                {editingId === m.id && (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="text"
                      value={overrideValue}
                      onChange={(e) => setOverrideValue(e.target.value)}
                      placeholder="e.g. divi/section + divi/blurb"
                      className="flex-1 text-xs px-2 py-1 rounded border border-navy/20 dark:border-slate-600 bg-white dark:bg-slate-700 text-navy dark:text-slate-200 focus:ring-1 focus:ring-electric focus:border-electric"
                    />
                    <button
                      onClick={() => handleOverride(m.id)}
                      disabled={saving || !overrideValue.trim()}
                      className="text-[11px] px-2 py-1 rounded bg-amber-500 text-white font-semibold hover:bg-amber-600 disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => { setEditingId(null); setOverrideValue(''); }}
                      className="text-[11px] px-2 py-1 text-navy/40 dark:text-slate-500 hover:text-navy dark:hover:text-slate-300"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              {isGateActive && m.decision === 'pending' && editingId !== m.id && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleApprove(m.id)}
                    disabled={saving}
                    className="text-[11px] px-2 py-1 rounded bg-success/10 text-success font-medium hover:bg-success/20 transition-colors disabled:opacity-50"
                    title="Accept this mapping"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => { setEditingId(m.id); setOverrideValue(m.proposed_divi5_module); }}
                    disabled={saving}
                    className="text-[11px] px-2 py-1 rounded bg-amber-400/10 text-amber-600 dark:text-amber-400 font-medium hover:bg-amber-400/20 transition-colors disabled:opacity-50"
                    title="Override with different module"
                  >
                    Override
                  </button>
                </div>
              )}

              {/* Status badge for decided items */}
              {m.decision !== 'pending' && (
                <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                  m.decision === 'approved'
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                }`}>
                  {m.decision === 'approved' ? 'Approved' : 'Overridden'}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
