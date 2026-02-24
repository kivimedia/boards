'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';

interface PipelineStats {
  scouted: number;
  approved: number;
  outreach_active: number;
  replied: number;
  scheduled: number;
  interviewed: number;
  rejected: number;
}

interface WeeklyMetrics {
  candidates_found: number;
  candidates_approved: number;
  emails_created: number;
  scout_runs: number;
  outreach_runs: number;
  total_tokens: number;
}

interface AgentRun {
  id: string;
  agent_type: 'scout' | 'outreach';
  status: 'running' | 'completed' | 'failed';
  started_at: string;
  ended_at: string | null;
  candidates_found: number;
  emails_created: number;
  tokens_used: number;
}

interface DashboardData {
  pipeline: PipelineStats;
  totalCandidates: number;
  activeSequences: number;
  weeklyMetrics: WeeklyMetrics;
  recentRuns: AgentRun[];
}

interface LiveCandidate {
  name: string;
  one_liner: string;
  confidence: string;
  tools: string[];
}

interface LiveSequence {
  candidate_name: string;
  email_count: number;
}

const PIPELINE_STAGES: { key: keyof PipelineStats; label: string; color: string; icon: string }[] = [
  { key: 'scouted', label: 'Scouted', color: 'bg-blue-500', icon: '🔍' },
  { key: 'approved', label: 'Approved', color: 'bg-green-500', icon: '✓' },
  { key: 'outreach_active', label: 'Outreach', color: 'bg-purple-500', icon: '✉️' },
  { key: 'replied', label: 'Replied', color: 'bg-amber-500', icon: '💬' },
  { key: 'scheduled', label: 'Scheduled', color: 'bg-teal-500', icon: '📅' },
  { key: 'interviewed', label: 'Interviewed', color: 'bg-emerald-500', icon: '🎙️' },
];

export default function PodcastDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningAgent, setRunningAgent] = useState<string | null>(null);

  // Live streaming state
  const [liveRunId, setLiveRunId] = useState<string | null>(null);
  const [liveProgress, setLiveProgress] = useState<string[]>([]);
  const [liveCandidates, setLiveCandidates] = useState<LiveCandidate[]>([]);
  const [liveSequences, setLiveSequences] = useState<LiveSequence[]>([]);
  const [liveOutput, setLiveOutput] = useState('');
  const [liveResult, setLiveResult] = useState<Record<string, unknown> | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [showOutput, setShowOutput] = useState(false);

  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  // Auto-scroll progress log
  useEffect(() => {
    if (progressRef.current) {
      progressRef.current.scrollTop = progressRef.current.scrollHeight;
    }
  }, [liveProgress]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/podcast/stats');
      const json = await res.json();
      if (json.data) {
        setData(json.data);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const startAgent = useCallback(async (agentType: 'scout' | 'outreach') => {
    setRunningAgent(agentType);
    setLiveProgress([]);
    setLiveCandidates([]);
    setLiveSequences([]);
    setLiveOutput('');
    setLiveResult(null);
    setLiveError(null);
    setShowOutput(false);

    try {
      // 1. Create the run record
      const createRes = await fetch('/api/podcast/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_type: agentType }),
      });

      if (!createRes.ok) {
        const json = await createRes.json();
        alert(json.error || 'Failed to start agent');
        setRunningAgent(null);
        return;
      }

      const { data: run } = await createRes.json();
      setLiveRunId(run.id);

      // 2. Execute with SSE streaming
      const executeRes = await fetch(`/api/podcast/runs/${run.id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!executeRes.ok || !executeRes.body) {
        setLiveError('Failed to start execution stream');
        setRunningAgent(null);
        return;
      }

      const reader = executeRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ') && currentEvent) {
            try {
              const payload = JSON.parse(line.slice(6));

              switch (currentEvent) {
                case 'progress':
                  setLiveProgress((prev) => [...prev, payload.message]);
                  break;
                case 'token':
                  setLiveOutput((prev) => prev + payload.text);
                  break;
                case 'candidate':
                  setLiveCandidates((prev) => [...prev, payload as LiveCandidate]);
                  break;
                case 'sequence':
                  setLiveSequences((prev) => [...prev, payload as LiveSequence]);
                  break;
                case 'complete':
                  setLiveResult(payload);
                  setLiveProgress((prev) => [...prev, '✅ Agent completed successfully']);
                  break;
                case 'error':
                  setLiveError(payload.error);
                  setLiveProgress((prev) => [...prev, `❌ Error: ${payload.error}`]);
                  break;
                case 'done':
                  break;
              }
            } catch {
              // Skip malformed JSON
            }
            currentEvent = '';
          }
        }
      }
    } catch (err: any) {
      setLiveError(err.message || 'Connection error');
      setLiveProgress((prev) => [...prev, `❌ ${err.message || 'Connection error'}`]);
    } finally {
      setRunningAgent(null);
      await fetchStats();
    }
  }, []);

  const dismissLivePanel = () => {
    setLiveRunId(null);
    setLiveProgress([]);
    setLiveCandidates([]);
    setLiveSequences([]);
    setLiveOutput('');
    setLiveResult(null);
    setLiveError(null);
    setShowOutput(false);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-cream dark:bg-slate-900">
        <div className="w-8 h-8 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex-1 flex items-center justify-center bg-cream dark:bg-slate-900 text-navy/40 dark:text-slate-500">
        Failed to load dashboard data.
      </div>
    );
  }

  const totalPipeline = Object.values(data.pipeline).reduce((a, b) => a + b, 0) - data.pipeline.rejected;
  const hasRunningAgent = runningAgent !== null || data.recentRuns.some((r) => r.status === 'running');

  return (
    <div className="flex-1 overflow-auto p-6 bg-cream dark:bg-slate-900">
      {/* Live Agent Panel */}
      {liveRunId && (
        <div className="mb-6 bg-white dark:bg-slate-800 rounded-xl border border-electric/20 dark:border-electric/30 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 bg-electric/5 dark:bg-electric/10 border-b border-electric/10">
            <div className="flex items-center gap-2">
              {runningAgent ? (
                <div className="w-2 h-2 rounded-full bg-electric animate-pulse" />
              ) : liveError ? (
                <div className="w-2 h-2 rounded-full bg-red-500" />
              ) : (
                <div className="w-2 h-2 rounded-full bg-green-500" />
              )}
              <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">
                {runningAgent
                  ? `Running ${runningAgent === 'scout' ? 'Scout' : 'Outreach'} Agent...`
                  : liveError
                  ? 'Agent Failed'
                  : 'Agent Completed'}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              {liveOutput && (
                <button
                  onClick={() => setShowOutput(!showOutput)}
                  className="text-[11px] px-2 py-1 rounded bg-navy/5 dark:bg-slate-700 text-navy/60 dark:text-slate-400 hover:bg-navy/10 dark:hover:bg-slate-600 transition-colors"
                >
                  {showOutput ? 'Hide Raw' : 'Show Raw'}
                </button>
              )}
              {!runningAgent && (
                <button
                  onClick={dismissLivePanel}
                  className="text-navy/40 dark:text-slate-500 hover:text-navy dark:hover:text-slate-200"
                >
                  <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Progress log */}
          <div ref={progressRef} className="max-h-40 overflow-y-auto px-5 py-3 space-y-1">
            {liveProgress.map((msg, i) => (
              <div key={i} className="text-xs text-navy/60 dark:text-slate-400 font-body font-mono">
                {msg}
              </div>
            ))}
            {liveProgress.length === 0 && runningAgent && (
              <div className="text-xs text-navy/40 dark:text-slate-500 font-body">
                Initializing agent...
              </div>
            )}
          </div>

          {/* Live candidates found */}
          {liveCandidates.length > 0 && (
            <div className="border-t border-navy/5 dark:border-slate-700 px-5 py-3">
              <div className="text-[11px] font-semibold text-navy/50 dark:text-slate-400 uppercase mb-2 font-heading">
                Candidates Found ({liveCandidates.length})
              </div>
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {liveCandidates.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                      c.confidence === 'high'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                        : c.confidence === 'medium'
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                    }`}>
                      {c.confidence}
                    </span>
                    <span className="font-semibold text-navy dark:text-slate-200 font-body">{c.name}</span>
                    <span className="text-navy/40 dark:text-slate-500 truncate font-body">{c.one_liner}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Live sequences created */}
          {liveSequences.length > 0 && (
            <div className="border-t border-navy/5 dark:border-slate-700 px-5 py-3">
              <div className="text-[11px] font-semibold text-navy/50 dark:text-slate-400 uppercase mb-2 font-heading">
                Sequences Created ({liveSequences.length})
              </div>
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {liveSequences.map((s, i) => (
                  <div key={i} className="text-xs text-navy/70 dark:text-slate-300 font-body">
                    ✉️ {s.candidate_name} — {s.email_count} emails
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Result summary */}
          {liveResult && (
            <div className="border-t border-navy/5 dark:border-slate-700 px-5 py-3 bg-green-50/50 dark:bg-green-900/10">
              <div className="flex gap-4 text-xs">
                {(liveResult as any).candidates_saved !== undefined && (
                  <span className="text-navy dark:text-slate-200 font-body">
                    <b>{(liveResult as any).candidates_saved}</b> saved
                  </span>
                )}
                {(liveResult as any).duplicates_skipped > 0 && (
                  <span className="text-navy/50 dark:text-slate-400 font-body">
                    {(liveResult as any).duplicates_skipped} duplicates skipped
                  </span>
                )}
                {(liveResult as any).sequences_created !== undefined && (
                  <span className="text-navy dark:text-slate-200 font-body">
                    <b>{(liveResult as any).sequences_created}</b> sequences ({(liveResult as any).emails_total} emails)
                  </span>
                )}
                {(liveResult as any).tokens_used > 0 && (
                  <span className="text-navy/50 dark:text-slate-400 font-body">
                    {(liveResult as any).tokens_used.toLocaleString()} tokens
                  </span>
                )}
                {(liveResult as any).cost_usd > 0 && (
                  <span className="text-navy/50 dark:text-slate-400 font-body">
                    ${(liveResult as any).cost_usd.toFixed(4)}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Raw output toggle */}
          {showOutput && liveOutput && (
            <div className="border-t border-navy/5 dark:border-slate-700 px-5 py-3">
              <pre className="text-[10px] text-navy/50 dark:text-slate-500 font-mono max-h-60 overflow-auto whitespace-pre-wrap">
                {liveOutput}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Top metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Total Candidates" value={data.totalCandidates} />
        <MetricCard label="Active Pipeline" value={totalPipeline} />
        <MetricCard label="Active Sequences" value={data.activeSequences} />
        <MetricCard label="Rejected" value={data.pipeline.rejected} variant="muted" />
      </div>

      {/* Pipeline funnel */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 shadow-sm p-5 mb-6">
        <h3 className="text-sm font-semibold text-navy/50 dark:text-slate-400 uppercase mb-4 font-heading">
          Pipeline
        </h3>
        <div className="flex gap-2">
          {PIPELINE_STAGES.map((stage) => {
            const count = data.pipeline[stage.key];
            const pct = totalPipeline > 0 ? (count / totalPipeline) * 100 : 0;
            return (
              <div key={stage.key} className="flex-1 text-center">
                <div className="text-2xl font-bold text-navy dark:text-slate-100 font-heading">
                  {count}
                </div>
                <div className="text-[11px] text-navy/50 dark:text-slate-400 font-body mb-2">
                  {stage.label}
                </div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${stage.color} transition-all`}
                    style={{ width: `${Math.max(pct, count > 0 ? 8 : 0)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Weekly metrics */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-navy/50 dark:text-slate-400 uppercase mb-4 font-heading">
            This Week
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <MiniMetric label="Candidates Found" value={data.weeklyMetrics.candidates_found} />
            <MiniMetric label="Approved" value={data.weeklyMetrics.candidates_approved} />
            <MiniMetric label="Emails Created" value={data.weeklyMetrics.emails_created} />
            <MiniMetric label="Scout Runs" value={data.weeklyMetrics.scout_runs} />
            <MiniMetric label="Outreach Runs" value={data.weeklyMetrics.outreach_runs} />
            <MiniMetric
              label="Tokens Used"
              value={data.weeklyMetrics.total_tokens.toLocaleString()}
            />
          </div>
        </div>

        {/* Agent controls */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-navy/50 dark:text-slate-400 uppercase mb-4 font-heading">
            Agents
          </h3>
          <div className="space-y-3">
            <AgentCard
              name="Podcast Guest Scout"
              icon="🔍"
              description="Find new candidates via LinkedIn, Google, YouTube, Reddit"
              isRunning={hasRunningAgent && (runningAgent === 'scout' || data.recentRuns.some((r) => r.agent_type === 'scout' && r.status === 'running'))}
              isStarting={runningAgent === 'scout'}
              disabled={hasRunningAgent}
              onStart={() => startAgent('scout')}
              lastRun={data.recentRuns.find((r) => r.agent_type === 'scout')}
            />
            <AgentCard
              name="Podcast Guest Outreach"
              icon="✉️"
              description="Write personalized email sequences for approved candidates"
              isRunning={hasRunningAgent && (runningAgent === 'outreach' || data.recentRuns.some((r) => r.agent_type === 'outreach' && r.status === 'running'))}
              isStarting={runningAgent === 'outreach'}
              disabled={hasRunningAgent}
              onStart={() => startAgent('outreach')}
              lastRun={data.recentRuns.find((r) => r.agent_type === 'outreach')}
            />
          </div>
        </div>
      </div>

      {/* Recent runs */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 shadow-sm p-5 mb-6">
        <h3 className="text-sm font-semibold text-navy/50 dark:text-slate-400 uppercase mb-4 font-heading">
          Recent Runs
        </h3>
        {data.recentRuns.length === 0 ? (
          <p className="text-sm text-navy/40 dark:text-slate-500 font-body">
            No agent runs yet. Start a Scout or Outreach run above.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-navy/5 dark:border-slate-700">
                  <th className="text-left py-2 text-navy/40 dark:text-slate-500 font-semibold font-heading">Agent</th>
                  <th className="text-left py-2 text-navy/40 dark:text-slate-500 font-semibold font-heading">Status</th>
                  <th className="text-left py-2 text-navy/40 dark:text-slate-500 font-semibold font-heading">Started</th>
                  <th className="text-right py-2 text-navy/40 dark:text-slate-500 font-semibold font-heading">Found</th>
                  <th className="text-right py-2 text-navy/40 dark:text-slate-500 font-semibold font-heading">Emails</th>
                  <th className="text-right py-2 text-navy/40 dark:text-slate-500 font-semibold font-heading">Tokens</th>
                </tr>
              </thead>
              <tbody>
                {data.recentRuns.map((run) => (
                  <tr key={run.id} className="border-b border-navy/5 dark:border-slate-700 last:border-0">
                    <td className="py-2.5 text-navy dark:text-slate-200 font-body">
                      {run.agent_type === 'scout' ? '🔍 Scout' : '✉️ Outreach'}
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                          run.status === 'running'
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                            : run.status === 'completed'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                        }`}
                      >
                        {run.status}
                      </span>
                    </td>
                    <td className="py-2.5 text-navy/60 dark:text-slate-400 font-body">
                      {new Date(run.started_at).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-2.5 text-right text-navy dark:text-slate-200 font-body">
                      {run.candidates_found}
                    </td>
                    <td className="py-2.5 text-right text-navy dark:text-slate-200 font-body">
                      {run.emails_created}
                    </td>
                    <td className="py-2.5 text-right text-navy/60 dark:text-slate-400 font-body">
                      {run.tokens_used.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick links */}
      <div className="flex gap-3 flex-wrap">
        <Link
          href="/podcast/scout"
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-electric text-white hover:bg-electric/90 transition-colors"
        >
          LinkedIn Scout Pipeline
        </Link>
        <Link
          href="/podcast/approval"
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-navy/5 dark:bg-slate-700 text-navy dark:text-slate-200 hover:bg-navy/10 dark:hover:bg-slate-600 transition-colors"
        >
          Approval Queue
        </Link>
        <Link
          href="/settings/podcast"
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-navy/5 dark:bg-slate-700 text-navy dark:text-slate-200 hover:bg-navy/10 dark:hover:bg-slate-600 transition-colors"
        >
          Integrations
        </Link>
        <Link
          href="/settings/agents"
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-navy/5 dark:bg-slate-700 text-navy dark:text-slate-200 hover:bg-navy/10 dark:hover:bg-slate-600 transition-colors"
        >
          Configure Agents
        </Link>
      </div>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function MetricCard({
  label,
  value,
  variant = 'default',
}: {
  label: string;
  value: number | string;
  variant?: 'default' | 'muted';
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 shadow-sm p-4">
      <div
        className={`text-2xl font-bold font-heading ${
          variant === 'muted' ? 'text-navy/30 dark:text-slate-600' : 'text-navy dark:text-slate-100'
        }`}
      >
        {value}
      </div>
      <div className="text-[11px] text-navy/50 dark:text-slate-400 font-body mt-1">{label}</div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-lg font-bold text-navy dark:text-slate-100 font-heading">{value}</div>
      <div className="text-[11px] text-navy/40 dark:text-slate-500 font-body">{label}</div>
    </div>
  );
}

function AgentCard({
  name,
  icon,
  description,
  isRunning,
  isStarting,
  disabled,
  onStart,
  lastRun,
}: {
  name: string;
  icon: string;
  description: string;
  isRunning: boolean;
  isStarting: boolean;
  disabled: boolean;
  onStart: () => void;
  lastRun?: AgentRun;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-cream/50 dark:bg-slate-700/30 border border-navy/5 dark:border-slate-600">
      <span className="text-2xl">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">{name}</div>
        <div className="text-[11px] text-navy/50 dark:text-slate-400 font-body truncate">
          {isRunning ? (
            <span className="text-blue-600 dark:text-blue-400 flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              Running...
            </span>
          ) : lastRun ? (
            <>
              Last run: {new Date(lastRun.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              {lastRun.status === 'completed' && ` — ${lastRun.candidates_found} found`}
              {lastRun.status === 'failed' && ' — failed'}
            </>
          ) : (
            description
          )}
        </div>
      </div>
      <button
        onClick={onStart}
        disabled={disabled}
        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-electric text-white hover:bg-electric/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
      >
        {isStarting ? 'Starting...' : isRunning ? 'Running' : 'Run Now'}
      </button>
    </div>
  );
}
