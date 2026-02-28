'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

interface TeamPhase {
  name: string;
  is_gate?: boolean;
  skill_slug?: string;
  model?: string;
}

interface TeamTemplate {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  phases: TeamPhase[];
}

interface GateDecision {
  decision: string;
  feedback?: string;
  decided_at: string;
  decided_by: string;
}

interface TeamRun {
  id: string;
  template_id: string;
  vps_job_id: string | null;
  client_id: string | null;
  site_config_id: string | null;
  status: string;
  current_phase: number;
  phase_results: Record<string, unknown> | null;
  artifacts: Record<string, unknown> | null;
  total_cost_usd: number;
  gate_decisions: Record<string, GateDecision> | null;
  input_data: Record<string, unknown>;
  error_message: string | null;
  created_at: string;
  template: TeamTemplate | null;
  client: { id: string; name: string } | null;
  site_config: { id: string; site_name: string; site_url: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  running: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  scrapped: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

interface Props {
  runId: string;
}

export default function TeamRunDetail({ runId }: Props) {
  const [run, setRun] = useState<TeamRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [feedback, setFeedback] = useState('');

  const fetchRun = useCallback(async () => {
    try {
      const res = await fetch(`/api/teams/runs/${runId}`);
      if (res.ok) {
        const data = await res.json();
        setRun(data.data || null);
      }
    } catch (err) {
      console.error('Failed to fetch team run:', err);
    }
    setLoading(false);
  }, [runId]);

  useEffect(() => {
    fetchRun();
  }, [fetchRun]);

  // Realtime updates
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`team-run-${runId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agent_team_runs',
          filter: `id=eq.${runId}`,
        },
        () => { fetchRun(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [runId, fetchRun]);

  const handleGateDecision = async (gateName: string, decision: string) => {
    setApproving(true);
    try {
      const res = await fetch(`/api/teams/runs/${runId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gate_name: gateName,
          decision,
          feedback: feedback.trim() || undefined,
        }),
      });
      if (res.ok) {
        setFeedback('');
        fetchRun();
      }
    } catch (err) {
      console.error('Failed to submit gate decision:', err);
    }
    setApproving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <svg className="animate-spin h-6 w-6 text-electric" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="p-6 text-center">
        <p className="text-navy/40 dark:text-slate-500 font-body">Run not found</p>
        <Link href="/teams" className="text-sm text-electric hover:underline mt-2 inline-block font-body">Back to Teams</Link>
      </div>
    );
  }

  const phases = run.template?.phases || [];
  const isAwaiting = run.status.startsWith('awaiting_');
  const currentGateName = isAwaiting
    ? phases.find(p => p.is_gate && run.status === `awaiting_${p.name}`)?.name || ''
    : '';

  // Determine phase status for timeline
  const getPhaseStatus = (phase: TeamPhase, index: number): 'completed' | 'active' | 'gate_waiting' | 'failed' | 'upcoming' => {
    if (run.status === 'failed') {
      if (index < run.current_phase) return 'completed';
      if (index === run.current_phase) return 'failed';
      return 'upcoming';
    }
    if (run.status === 'completed' || run.status === 'scrapped') {
      if (run.status === 'completed') return 'completed';
      if (index <= run.current_phase) return 'completed';
      return 'upcoming';
    }
    if (phase.is_gate && run.status === `awaiting_${phase.name}`) return 'gate_waiting';
    if (index < run.current_phase) return 'completed';
    if (index === run.current_phase && !phase.is_gate) return 'active';
    return 'upcoming';
  };

  const phaseResults = run.phase_results as Record<string, string> | null;
  const artifacts = run.artifacts as Record<string, unknown> | null;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 md:gap-3 flex-wrap">
            <h1 className="text-lg md:text-xl font-bold text-navy dark:text-white font-heading">
              {run.template?.name || 'Unknown Template'}
            </h1>
            <StatusBadge status={run.status} />
          </div>
          <div className="flex items-center gap-3 md:gap-4 mt-2 text-xs md:text-sm text-navy/50 dark:text-slate-400 font-body flex-wrap">
            {run.client && <span className="text-navy/60 dark:text-slate-300 font-semibold">{run.client.name}</span>}
            {run.site_config && <span>{run.site_config.site_name} ({run.site_config.site_url})</span>}
            <span>Created: {new Date(run.created_at).toLocaleString()}</span>
            {run.total_cost_usd > 0 && <span>Cost: ${run.total_cost_usd.toFixed(2)}</span>}
          </div>
        </div>
        <Link
          href="/teams"
          className="shrink-0 px-3 py-1.5 text-xs font-medium text-navy/60 dark:text-slate-400 bg-cream dark:bg-dark-surface rounded-lg hover:bg-cream-dark dark:hover:bg-slate-700 transition-colors font-body"
        >
          Back
        </Link>
      </div>

      {/* Input Data */}
      {run.input_data && Object.keys(run.input_data).length > 0 && (
        <div className="bg-white dark:bg-dark-card rounded-xl p-4 border border-cream-dark dark:border-slate-700">
          <h2 className="text-sm font-semibold text-navy/60 dark:text-slate-300 mb-2 font-heading">Input</h2>
          <div className="flex flex-wrap gap-3">
            {Object.entries(run.input_data).map(([key, value]) => (
              <div key={key} className="bg-cream dark:bg-dark-surface rounded-lg px-3 py-1.5">
                <span className="text-[10px] text-navy/40 dark:text-slate-500 font-body">{key}</span>
                <p className="text-sm text-navy dark:text-white font-body">{String(value)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Phase Timeline */}
      <div className="bg-white dark:bg-dark-card rounded-xl p-4 border border-cream-dark dark:border-slate-700">
        <h2 className="text-sm font-semibold text-navy/60 dark:text-slate-300 mb-4 font-heading">Pipeline Progress</h2>
        <div className="flex items-center gap-1 overflow-x-auto pb-2 -mb-2">
          {phases.map((phase, i) => {
            const status = getPhaseStatus(phase, i);
            return (
              <div key={i} className="flex-1 min-w-[3rem] flex flex-col items-center">
                <div
                  className={`w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center text-[10px] md:text-xs font-bold ${
                    status === 'active'
                      ? 'bg-electric text-white ring-2 ring-electric/30 animate-pulse'
                      : status === 'completed'
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-600'
                        : status === 'gate_waiting'
                          ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 ring-2 ring-yellow-300/50'
                          : status === 'failed'
                            ? 'bg-red-100 dark:bg-red-900/30 text-red-500'
                            : 'bg-cream dark:bg-dark-surface text-navy/30 dark:text-slate-600'
                  }`}
                >
                  {status === 'completed' ? '✓' : phase.is_gate ? '⊘' : i + 1}
                </div>
                <span className={`text-[10px] mt-1 text-center font-body leading-tight ${
                  status === 'active' || status === 'gate_waiting'
                    ? 'text-electric font-semibold'
                    : status === 'completed'
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-navy/30 dark:text-slate-600'
                }`}>
                  {phase.name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Gate Approval */}
      {isAwaiting && currentGateName && (
        <div className="bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4 md:p-5">
          <h2 className="text-base font-bold text-yellow-800 dark:text-yellow-300 mb-2 font-heading">
            Gate: {currentGateName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
          </h2>
          <p className="text-sm text-yellow-700 dark:text-yellow-400 mb-4 font-body">
            Review the pipeline output before continuing to the next phase.
          </p>
          <textarea
            value={feedback}
            onChange={e => setFeedback(e.target.value)}
            placeholder="Optional feedback..."
            rows={3}
            className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-yellow-200 dark:border-yellow-800 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 mb-3 font-body"
          />
          <div className="flex gap-2 md:gap-3 flex-wrap">
            <button
              onClick={() => handleGateDecision(currentGateName, 'approve')}
              disabled={approving}
              className="px-3 md:px-4 py-2 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 font-body"
            >
              Approve
            </button>
            <button
              onClick={() => handleGateDecision(currentGateName, 'revise')}
              disabled={approving}
              className="px-3 md:px-4 py-2 text-sm font-semibold text-yellow-700 bg-yellow-100 rounded-lg hover:bg-yellow-200 transition-colors disabled:opacity-50 font-body"
            >
              Revise
            </button>
            <button
              onClick={() => handleGateDecision(currentGateName, 'scrap')}
              disabled={approving}
              className="px-3 md:px-4 py-2 text-sm font-semibold text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50 font-body"
            >
              Scrap
            </button>
          </div>
        </div>
      )}

      {/* Gate Decisions History */}
      {run.gate_decisions && Object.keys(run.gate_decisions).length > 0 && (
        <div className="bg-white dark:bg-dark-card rounded-xl p-4 border border-cream-dark dark:border-slate-700">
          <h2 className="text-sm font-semibold text-navy/60 dark:text-slate-300 mb-3 font-heading">Gate Decisions</h2>
          <div className="space-y-2">
            {Object.entries(run.gate_decisions).map(([gateName, decision]) => (
              <div key={gateName} className="flex items-center justify-between p-3 bg-cream dark:bg-dark-surface rounded-lg">
                <div>
                  <p className="text-sm font-semibold text-navy dark:text-white font-heading">
                    {gateName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </p>
                  {decision.feedback && (
                    <p className="text-xs text-navy/50 dark:text-slate-400 mt-1 font-body">{decision.feedback}</p>
                  )}
                </div>
                <div className="text-right">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                    decision.decision === 'approve'
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                      : decision.decision === 'revise'
                        ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                  }`}>
                    {decision.decision.replace(/\b\w/g, c => c.toUpperCase())}
                  </span>
                  <p className="text-[10px] text-navy/30 dark:text-slate-600 mt-1 font-body">
                    {new Date(decision.decided_at).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Phase Results */}
      {phaseResults && Object.keys(phaseResults).length > 0 && (
        <div className="bg-white dark:bg-dark-card rounded-xl p-5 border border-cream-dark dark:border-slate-700">
          <h2 className="text-sm font-semibold text-navy/60 dark:text-slate-300 mb-3 font-heading">Phase Outputs</h2>
          <div className="space-y-4">
            {Object.entries(phaseResults).map(([phaseName, output]) => (
              <div key={phaseName}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-navy/60 dark:text-slate-300 font-heading">
                    {phaseName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </p>
                  <button
                    onClick={() => navigator.clipboard.writeText(String(output))}
                    className="text-xs text-electric hover:text-electric-dark transition-colors font-body"
                  >
                    Copy
                  </button>
                </div>
                <pre className="whitespace-pre-wrap text-sm text-navy dark:text-slate-200 bg-cream dark:bg-dark-surface p-3 rounded-lg overflow-auto max-h-64 font-body">
                  {String(output)}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Artifacts */}
      {artifacts && Object.keys(artifacts).length > 0 && (
        <div className="bg-white dark:bg-dark-card rounded-xl p-5 border border-cream-dark dark:border-slate-700">
          <h2 className="text-sm font-semibold text-navy/60 dark:text-slate-300 mb-3 font-heading">Artifacts</h2>
          <div className="space-y-3">
            {Object.entries(artifacts).map(([key, value]) => (
              <div key={key} className="bg-cream dark:bg-dark-surface rounded-lg p-3">
                <p className="text-xs font-semibold text-navy/60 dark:text-slate-300 mb-1 font-heading">{key}</p>
                <pre className="whitespace-pre-wrap text-xs text-navy dark:text-slate-300 overflow-auto max-h-48 font-mono">
                  {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {run.status === 'failed' && run.error_message && (
        <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-red-700 dark:text-red-300 mb-1 font-heading">Error</h2>
          <p className="text-sm text-red-600 dark:text-red-400 font-body">{run.error_message}</p>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isAwaiting = status.startsWith('awaiting_');
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const color = isAwaiting
    ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
    : STATUS_COLORS[status] || 'bg-gray-100 text-gray-600';
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${color}`}>
      {label}
    </span>
  );
}
