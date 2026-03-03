'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Proposal {
  id: string;
  change_type: string;
  title: string;
  description: string;
  evidence: {
    override_count?: number;
    time_period_days?: number;
    notes?: string;
  };
  before_value: string;
  after_value: string;
  status: 'pending' | 'approved' | 'rejected' | 'rolled_back';
  rule_snapshot_id: string | null;
  created_at: string;
  decided_at: string | null;
}

interface Snapshot {
  id: string;
  version: number;
  created_at: string;
}

export default function LearningProposals() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/outreach/learning');
      const data = await res.json();
      if (res.ok) {
        setProposals(data.data.proposals || []);
        setSnapshots(data.data.snapshots || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleAction = async (proposalId: string, action: 'approve' | 'reject' | 'rollback') => {
    setActionLoading(proposalId);
    try {
      await fetch(`/api/outreach/learning/${proposalId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      fetchData();
    } finally {
      setActionLoading(null);
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { bg: string; text: string; label: string }> = {
      pending: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-600 dark:text-amber-300', label: 'Pending' },
      approved: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-600 dark:text-green-300', label: 'Approved' },
      rejected: { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400', label: 'Rejected' },
      rolled_back: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-600 dark:text-purple-300', label: 'Rolled Back' },
    };
    const s = map[status] || map.pending;
    return (
      <span className={`px-2 py-0.5 text-[10px] font-semibold rounded ${s.bg} ${s.text}`}>
        {s.label}
      </span>
    );
  };

  const filtered = filter === 'all' ? proposals : proposals.filter(p => p.status === filter);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Link href="/outreach" className="text-sm text-navy/40 dark:text-slate-500 hover:text-electric font-body transition-colors">
          Dashboard
        </Link>
        <span className="text-navy/20 dark:text-slate-700">/</span>
        <span className="text-sm font-semibold text-navy dark:text-white font-heading">Learning</span>
      </div>

      <p className="text-xs text-navy/40 dark:text-slate-500 font-body">
        Learning proposals are generated from your manual overrides. Approve to apply changes, rollback to revert.
      </p>

      {/* Filter tabs */}
      <div className="flex items-center gap-1">
        {(['all', 'pending', 'approved', 'rejected'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-[11px] font-semibold rounded-lg transition-colors ${
              filter === f
                ? 'bg-electric/10 text-electric border border-electric/30'
                : 'text-navy/50 dark:text-slate-500 hover:bg-cream dark:hover:bg-slate-800'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f !== 'all' && ` (${proposals.filter(p => p.status === f).length})`}
          </button>
        ))}
      </div>

      {/* Proposals */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700">
          <p className="text-sm text-navy/40 dark:text-slate-500 font-body">No proposals</p>
          <p className="text-[10px] text-navy/30 dark:text-slate-600 mt-1">
            Proposals are generated weekly from your qualification overrides
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(proposal => (
            <div key={proposal.id} className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {statusBadge(proposal.status)}
                    <span className="px-2 py-0.5 text-[9px] font-semibold bg-cream dark:bg-dark-surface text-navy/50 dark:text-slate-400 rounded">
                      {proposal.change_type.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-navy dark:text-white font-heading">
                    {proposal.title}
                  </h3>
                  <p className="text-xs text-navy/50 dark:text-slate-400 font-body mt-1">
                    {proposal.description}
                  </p>
                </div>
              </div>

              {/* Before/After */}
              {(proposal.before_value || proposal.after_value) && (
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="p-2.5 bg-red-50/50 dark:bg-red-900/10 rounded-lg border border-red-100 dark:border-red-900/30">
                    <p className="text-[9px] text-red-500 font-semibold uppercase mb-1">Before</p>
                    <p className="text-xs text-navy/60 dark:text-slate-400 font-body">{proposal.before_value || '-'}</p>
                  </div>
                  <div className="p-2.5 bg-green-50/50 dark:bg-green-900/10 rounded-lg border border-green-100 dark:border-green-900/30">
                    <p className="text-[9px] text-green-500 font-semibold uppercase mb-1">After</p>
                    <p className="text-xs text-navy/60 dark:text-slate-400 font-body">{proposal.after_value || '-'}</p>
                  </div>
                </div>
              )}

              {/* Evidence */}
              <div className="flex items-center gap-3 text-[10px] text-navy/40 dark:text-slate-500 font-body mb-3">
                {proposal.evidence.override_count && (
                  <span>Based on {proposal.evidence.override_count} overrides</span>
                )}
                {proposal.evidence.time_period_days && (
                  <span>Over {proposal.evidence.time_period_days} days</span>
                )}
                <span>{new Date(proposal.created_at).toLocaleDateString()}</span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-3 border-t border-cream-dark dark:border-slate-700">
                {proposal.status === 'pending' && (
                  <>
                    <button
                      onClick={() => handleAction(proposal.id, 'approve')}
                      disabled={actionLoading === proposal.id}
                      className="px-3 py-1.5 text-[11px] font-semibold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg hover:bg-green-200 dark:hover:bg-green-800/30 disabled:opacity-50 transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleAction(proposal.id, 'reject')}
                      disabled={actionLoading === proposal.id}
                      className="px-3 py-1.5 text-[11px] font-semibold text-navy/50 dark:text-slate-500 hover:bg-cream dark:hover:bg-slate-800 rounded-lg disabled:opacity-50 transition-colors"
                    >
                      Reject
                    </button>
                  </>
                )}
                {proposal.status === 'approved' && proposal.rule_snapshot_id && (
                  <button
                    onClick={() => {
                      if (confirm('Rollback this change? The previous configuration will be restored.')) {
                        handleAction(proposal.id, 'rollback');
                      }
                    }}
                    disabled={actionLoading === proposal.id}
                    className="px-3 py-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg disabled:opacity-50 transition-colors"
                  >
                    Rollback
                  </button>
                )}
                {actionLoading === proposal.id && (
                  <div className="w-4 h-4 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Snapshots */}
      {snapshots.length > 0 && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 p-5">
          <h3 className="text-xs font-semibold text-navy/60 dark:text-slate-400 uppercase font-heading mb-3">
            Rule Snapshots (Rollback History)
          </h3>
          <div className="space-y-1.5">
            {snapshots.map(snap => (
              <div key={snap.id} className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 text-[10px] font-semibold bg-cream dark:bg-dark-surface text-navy/50 dark:text-slate-400 rounded">
                    v{snap.version}
                  </span>
                  <span className="text-xs text-navy/50 dark:text-slate-400 font-body">
                    {new Date(snap.created_at).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
