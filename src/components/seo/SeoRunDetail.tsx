'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import type { SeoPipelineRun, SeoAgentCall, SeoGateDecision } from '@/lib/types';

const PHASES = [
  { key: 'planning', label: 'Planning', icon: '📊' },
  { key: 'writing', label: 'Writing', icon: '✍️' },
  { key: 'scoring', label: 'QC', icon: '✅' },
  { key: 'humanizing', label: 'Humanizing', icon: '🧑' },
  { key: 'awaiting_approval_1', label: 'Gate 1', icon: '🚦' },
  { key: 'publishing', label: 'Publishing', icon: '📤' },
  { key: 'visual_qa', label: 'Visual QA', icon: '👁️' },
  { key: 'awaiting_approval_2', label: 'Gate 2', icon: '🚦' },
  { key: 'published', label: 'Published', icon: '🎉' },
];

interface Props {
  runId: string;
}

export default function SeoRunDetail({ runId }: Props) {
  const [run, setRun] = useState<SeoPipelineRun | null>(null);
  const [agentCalls, setAgentCalls] = useState<SeoAgentCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [feedback, setFeedback] = useState('');

  const fetchRun = useCallback(async () => {
    try {
      const res = await fetch(`/api/seo/runs/${runId}`);
      if (res.ok) {
        const data = await res.json();
        setRun(data.data?.run || null);
        setAgentCalls(data.data?.agent_calls || []);
      }
    } catch (err) {
      console.error('Failed to fetch run:', err);
    }
    setLoading(false);
  }, [runId]);

  useEffect(() => {
    fetchRun();
    const interval = setInterval(fetchRun, 10000);
    return () => clearInterval(interval);
  }, [fetchRun]);

  const handleGateDecision = async (gate: 1 | 2, decision: SeoGateDecision) => {
    setApproving(true);
    try {
      const res = await fetch(`/api/seo/runs/${runId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gate, decision, feedback: feedback.trim() || undefined }),
      });
      if (res.ok) {
        setFeedback('');
        fetchRun();
      }
    } catch (err) {
      console.error('Failed to submit decision:', err);
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
        <Link href="/seo" className="text-sm text-electric hover:underline mt-2 inline-block font-body">Back to dashboard</Link>
      </div>
    );
  }

  const currentPhaseIndex = PHASES.findIndex(p => p.key === run.status);
  const isAwaitingGate1 = run.status === 'awaiting_approval_1';
  const isAwaitingGate2 = run.status === 'awaiting_approval_2';

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-navy dark:text-white font-heading">{run.topic || 'Untitled Run'}</h1>
        <div className="flex items-center gap-4 mt-2 text-sm text-navy/50 dark:text-slate-400 font-body">
          {run.silo && <span>Silo: {run.silo}</span>}
          <span>Created: {new Date(run.created_at).toLocaleString()}</span>
          {run.total_cost_usd > 0 && <span>Cost: ${run.total_cost_usd.toFixed(2)}</span>}
        </div>
      </div>

      {/* Phase Timeline */}
      <div className="bg-white dark:bg-dark-card rounded-xl p-4 border border-cream-dark dark:border-slate-700">
        <h2 className="text-sm font-semibold text-navy/60 dark:text-slate-300 mb-3 font-heading">Pipeline Progress</h2>
        <div className="flex items-center gap-1">
          {PHASES.map((phase, i) => {
            const isActive = phase.key === run.status;
            const isComplete = i < currentPhaseIndex;
            const isFailed = run.status === 'failed';
            return (
              <div key={phase.key} className="flex-1 flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                    isActive
                      ? 'bg-electric text-white ring-2 ring-electric/30'
                      : isComplete
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-600'
                        : isFailed
                          ? 'bg-red-100 dark:bg-red-900/30 text-red-500'
                          : 'bg-cream dark:bg-dark-surface text-navy/30 dark:text-slate-600'
                  }`}
                >
                  {isComplete ? '✓' : phase.icon}
                </div>
                <span className={`text-[10px] mt-1 text-center font-body ${isActive ? 'text-electric font-semibold' : 'text-navy/30 dark:text-slate-600'}`}>
                  {phase.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Scores */}
      {(run.qc_score != null || run.value_score != null || run.visual_qa_score != null) && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'QC Score', value: run.qc_score, color: 'text-green-600' },
            { label: 'Value Score', value: run.value_score, color: 'text-cyan-600' },
            { label: 'Visual QA', value: run.visual_qa_score, color: 'text-purple-600' },
          ].map(score => (
            <div key={score.label} className="bg-white dark:bg-dark-card rounded-xl p-4 border border-cream-dark dark:border-slate-700 text-center">
              <p className="text-xs text-navy/50 dark:text-slate-400 font-body">{score.label}</p>
              <p className={`text-3xl font-bold mt-1 font-heading ${score.value != null ? score.color : 'text-navy/20'}`}>
                {score.value != null ? score.value : '-'}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Gate Approval */}
      {(isAwaitingGate1 || isAwaitingGate2) && (
        <div className="bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 rounded-xl p-5">
          <h2 className="text-base font-bold text-yellow-800 dark:text-yellow-300 mb-2 font-heading">
            {isAwaitingGate1 ? 'Gate 1: Content Review' : 'Gate 2: Published Post Review'}
          </h2>
          <p className="text-sm text-yellow-700 dark:text-yellow-400 mb-4 font-body">
            {isAwaitingGate1
              ? 'Review the content quality and humanization before publishing.'
              : 'Review the published post on WordPress before finalizing.'}
          </p>
          <textarea
            value={feedback}
            onChange={e => setFeedback(e.target.value)}
            placeholder="Optional feedback..."
            rows={3}
            className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-yellow-200 dark:border-yellow-800 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 mb-3 font-body"
          />
          <div className="flex gap-3">
            <button
              onClick={() => handleGateDecision(isAwaitingGate1 ? 1 : 2, 'approve')}
              disabled={approving}
              className="px-4 py-2 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 font-body"
            >
              Approve
            </button>
            <button
              onClick={() => handleGateDecision(isAwaitingGate1 ? 1 : 2, 'revise')}
              disabled={approving}
              className="px-4 py-2 text-sm font-semibold text-yellow-700 bg-yellow-100 rounded-lg hover:bg-yellow-200 transition-colors disabled:opacity-50 font-body"
            >
              Revise
            </button>
            <button
              onClick={() => handleGateDecision(isAwaitingGate1 ? 1 : 2, 'scrap')}
              disabled={approving}
              className="px-4 py-2 text-sm font-semibold text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50 font-body"
            >
              Scrap
            </button>
          </div>
        </div>
      )}

      {/* Content Preview */}
      {(run.humanized_content || run.final_content) && (
        <div className="bg-white dark:bg-dark-card rounded-xl p-5 border border-cream-dark dark:border-slate-700">
          <h2 className="text-sm font-semibold text-navy/60 dark:text-slate-300 mb-3 font-heading">Content Preview</h2>
          <div className="prose prose-sm dark:prose-invert max-w-none font-body">
            <pre className="whitespace-pre-wrap text-sm text-navy dark:text-slate-200 bg-cream dark:bg-dark-surface p-4 rounded-lg overflow-auto max-h-96">
              {run.humanized_content || run.final_content}
            </pre>
          </div>
        </div>
      )}

      {/* WordPress Link */}
      {run.wp_preview_url && (
        <div className="bg-white dark:bg-dark-card rounded-xl p-4 border border-cream-dark dark:border-slate-700 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-navy dark:text-white font-heading">WordPress Post</p>
            <p className="text-xs text-navy/50 dark:text-slate-400 font-body">Post ID: {run.wp_post_id}</p>
          </div>
          <div className="flex gap-2">
            {run.wp_preview_url && (
              <a href={run.wp_preview_url} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 text-xs font-medium text-electric bg-electric/10 rounded-lg hover:bg-electric/20 transition-colors font-body">
                Preview
              </a>
            )}
            {run.wp_live_url && (
              <a href={run.wp_live_url} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 text-xs font-medium text-green-600 bg-green-50 rounded-lg hover:bg-green-100 transition-colors font-body">
                Live Post
              </a>
            )}
          </div>
        </div>
      )}

      {/* Agent Calls Log */}
      {agentCalls.length > 0 && (
        <div className="bg-white dark:bg-dark-card rounded-xl p-5 border border-cream-dark dark:border-slate-700">
          <h2 className="text-sm font-semibold text-navy/60 dark:text-slate-300 mb-3 font-heading">
            Agent Calls ({agentCalls.length})
          </h2>
          <div className="space-y-2">
            {agentCalls.map(call => (
              <div key={call.id} className="flex items-center justify-between p-3 bg-cream dark:bg-dark-surface rounded-lg">
                <div>
                  <p className="text-sm font-semibold text-navy dark:text-white font-heading">{call.agent_name}</p>
                  <p className="text-xs text-navy/40 dark:text-slate-500 font-body">
                    Phase: {call.phase} - Iteration {call.iteration} - {call.model_used || 'unknown model'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-navy/50 dark:text-slate-400 font-body">
                    {call.input_tokens + call.output_tokens} tokens
                  </p>
                  <p className="text-xs text-navy/40 dark:text-slate-500 font-body">
                    ${call.cost_usd.toFixed(4)} - {(call.duration_ms / 1000).toFixed(1)}s
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
