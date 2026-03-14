'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { PRFeedback, PRFeedbackType, PRClient } from '@/lib/types';

/* ------------------------------------------------------------------ */
/*  Helpers / Badges                                                   */
/* ------------------------------------------------------------------ */

function FeedbackTypeBadge({ type }: { type: PRFeedbackType }) {
  const styles: Record<string, string> = {
    outlet_quality:     'bg-blue-500/20 text-blue-400',
    email_tone:         'bg-purple-500/20 text-purple-400',
    angle_effectiveness:'bg-amber-500/20 text-amber-400',
    contact_accuracy:   'bg-teal-500/20 text-teal-400',
    market_insight:     'bg-indigo-500/20 text-indigo-400',
    general:            'bg-gray-500/20 text-gray-400',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${styles[type] || 'bg-gray-500/20 text-gray-400'}`}>
      {type.replace(/_/g, ' ')}
    </span>
  );
}

function SentimentDot({ sentiment }: { sentiment: string | null }) {
  if (!sentiment) return <span className="w-2 h-2 rounded-full bg-gray-600 inline-block" />;
  const colors: Record<string, string> = {
    positive: 'bg-green-400',
    negative: 'bg-red-400',
    neutral:  'bg-gray-400',
  };
  return <span className={`w-2 h-2 rounded-full ${colors[sentiment] || 'bg-gray-500'} inline-block`} title={sentiment} />;
}

/* ------------------------------------------------------------------ */
/*  Feedback Log Tab                                                   */
/* ------------------------------------------------------------------ */

const FEEDBACK_TYPES: (PRFeedbackType | '')[] = [
  '', 'outlet_quality', 'email_tone', 'angle_effectiveness',
  'contact_accuracy', 'market_insight', 'general',
];

function FeedbackLogTab() {
  const [typeFilter, setTypeFilter] = useState<string>('');

  const queryParams = new URLSearchParams();
  if (typeFilter) queryParams.set('feedback_type', typeFilter);
  queryParams.set('limit', '100');

  const { data, isLoading } = useQuery({
    queryKey: ['pr-feedback-all', typeFilter],
    queryFn: async () => {
      const res = await fetch(`/api/team-pr/feedback?${queryParams.toString()}`, { credentials: 'include' });
      const json = await res.json();
      return json.data;
    },
  });

  const items: PRFeedback[] = data?.items || [];

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 rounded-lg bg-gray-500/10 border border-gray-500/20 text-white text-sm outline-none"
        >
          <option value="">All Types</option>
          {FEEDBACK_TYPES.filter(Boolean).map((t) => (
            <option key={t} value={t as string}>{(t as string).replace(/_/g, ' ')}</option>
          ))}
        </select>
        {data?.total !== undefined && (
          <span className="text-sm text-gray-500">{data.total} entries</span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-14 rounded-lg bg-gray-500/10 animate-pulse" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-gray-500/20 p-12 text-center">
          <p className="text-gray-400">No feedback entries yet.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-500/20 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-500/5 border-b border-gray-500/20">
                <th className="text-left px-4 py-3 font-medium text-gray-400">Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-400">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-400">Feedback</th>
                <th className="text-left px-4 py-3 font-medium text-gray-400 w-8">Sentiment</th>
              </tr>
            </thead>
            <tbody>
              {items.map((fb) => (
                <tr key={fb.id} className="border-b border-gray-500/10 hover:bg-gray-500/5 transition-colors">
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {new Date(fb.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <FeedbackTypeBadge type={fb.feedback_type} />
                  </td>
                  <td className="px-4 py-3 text-gray-300 max-w-md">
                    <p className="text-sm leading-snug">{fb.feedback_text}</p>
                    {(fb.run_id || fb.outlet_id) && (
                      <p className="text-[10px] text-gray-600 mt-0.5">
                        {fb.run_id && `Run: ${fb.run_id.slice(0, 8)}`}
                        {fb.outlet_id && ` Outlet: ${fb.outlet_id.slice(0, 8)}`}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <SentimentDot sentiment={fb.sentiment} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Reports Tab                                                        */
/* ------------------------------------------------------------------ */

interface CalibrationSnapshot {
  run_range: string;
  period: { from: string; to: string };
  override_rate: number;
  gate_override_count: number;
  qa_pass_rate: number;
  feedback_total: number;
  feedback_breakdown: Record<string, number>;
  recommendations: string[];
}

interface CalibrationResponse {
  snapshots: CalibrationSnapshot[];
  runs_completed: number;
  next_snapshot_at_run: number;
}

interface WhatsWorkingResponse {
  ready: boolean;
  // When not ready
  current_count?: number;
  threshold?: number;
  // When ready
  total_emails?: number;
  by_pitch_angle?: { pitch_angle: string; approval_rate: number; total_drafts: number; approved_count: number; avg_revision_count: number }[];
  by_outlet_type?: { outlet_type: string; approval_rate: number; total_drafts: number; approved_count: number }[];
  common_rejection_reasons?: { reason: string; count: number }[];
}

function FeedbackBreakdownBars({ breakdown }: { breakdown: Record<string, number> }) {
  const entries = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
  const max = entries[0]?.[1] || 1;

  return (
    <div className="space-y-2">
      {entries.map(([type, count]) => (
        <div key={type} className="flex items-center gap-2">
          <span className="text-xs text-gray-400 w-36 shrink-0 truncate">{type.replace(/_/g, ' ')}</span>
          <div className="flex-1 h-2 rounded-full bg-gray-500/20 overflow-hidden">
            <div
              className="h-full rounded-full bg-purple-500"
              style={{ width: `${(count / max) * 100}%` }}
            />
          </div>
          <span className="text-xs text-gray-500 w-6 text-right">{count}</span>
        </div>
      ))}
    </div>
  );
}

function ReportsTab({ clients }: { clients: PRClient[] }) {
  const [calibClientId, setCalibClientId] = useState(clients[0]?.id || '');
  const [wwClientId, setWwClientId] = useState(clients[0]?.id || '');

  const { data: calibData, isLoading: calibLoading } = useQuery<CalibrationResponse>({
    queryKey: ['pr-calibration', calibClientId],
    queryFn: async () => {
      const res = await fetch(`/api/team-pr/reports/calibration?client_id=${calibClientId}`, { credentials: 'include' });
      const json = await res.json();
      return json.data;
    },
    enabled: !!calibClientId,
  });

  const { data: wwData, isLoading: wwLoading } = useQuery<WhatsWorkingResponse>({
    queryKey: ['pr-whats-working', wwClientId],
    queryFn: async () => {
      const res = await fetch(`/api/team-pr/reports/whats-working?client_id=${wwClientId}`, { credentials: 'include' });
      const json = await res.json();
      return json.data;
    },
    enabled: !!wwClientId,
  });

  const wwProgress = wwData && !wwData.ready && wwData.current_count !== undefined && wwData.threshold
    ? Math.round((wwData.current_count / wwData.threshold) * 100)
    : 0;

  return (
    <div className="space-y-10">
      {/* Calibration Reports */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Calibration Reports</h2>
          {clients.length > 0 && (
            <select
              value={calibClientId}
              onChange={(e) => setCalibClientId(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-gray-500/10 border border-gray-500/20 text-white text-sm outline-none"
            >
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>

        {calibLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => <div key={i} className="h-48 rounded-xl bg-gray-500/10 animate-pulse" />)}
          </div>
        ) : !calibData || calibData.snapshots.length === 0 ? (
          <div className="rounded-xl border border-gray-500/20 p-8 text-center">
            <p className="text-gray-400 text-sm mb-1">No calibration data yet.</p>
            {calibData && (
              <p className="text-gray-500 text-xs">
                {calibData.runs_completed} / {calibData.next_snapshot_at_run} runs completed. Snapshot generated every 5 runs.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {calibData.snapshots.map((snap) => (
              <div key={snap.run_range} className="p-5 rounded-xl border border-gray-500/20 bg-[#141420]/50 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-white">{snap.run_range}</h3>
                  <span className="text-xs text-gray-500">
                    {new Date(snap.period.from).toLocaleDateString()} - {new Date(snap.period.to).toLocaleDateString()}
                  </span>
                </div>

                {/* Key metrics */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-gray-500/10 text-center">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Override Rate</p>
                    <p className={`text-xl font-bold ${snap.override_rate > 0.3 ? 'text-red-400' : snap.override_rate > 0.1 ? 'text-amber-400' : 'text-green-400'}`}>
                      {(snap.override_rate * 100).toFixed(0)}%
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-gray-500/10 text-center">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">QA Pass Rate</p>
                    <p className={`text-xl font-bold ${snap.qa_pass_rate < 0.5 ? 'text-red-400' : snap.qa_pass_rate < 0.7 ? 'text-amber-400' : 'text-green-400'}`}>
                      {(snap.qa_pass_rate * 100).toFixed(0)}%
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-gray-500/10 text-center">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Feedback Items</p>
                    <p className="text-xl font-bold text-white">{snap.feedback_total}</p>
                  </div>
                </div>

                {/* Feedback breakdown chart */}
                {Object.keys(snap.feedback_breakdown).length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Feedback Breakdown</p>
                    <FeedbackBreakdownBars breakdown={snap.feedback_breakdown} />
                  </div>
                )}

                {/* Recommendations */}
                {snap.recommendations.length > 0 && (
                  <div className="space-y-1.5">
                    {snap.recommendations.map((rec, i) => (
                      <div key={i} className="flex gap-2 text-xs text-gray-400">
                        <span className="text-purple-400 mt-0.5 shrink-0">-</span>
                        <span>{rec}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* What's Working */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">What's Working</h2>
          {clients.length > 0 && (
            <select
              value={wwClientId}
              onChange={(e) => setWwClientId(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-gray-500/10 border border-gray-500/20 text-white text-sm outline-none"
            >
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>

        {wwLoading ? (
          <div className="h-48 rounded-xl bg-gray-500/10 animate-pulse" />
        ) : !wwData ? (
          <div className="rounded-xl border border-gray-500/20 p-8 text-center">
            <p className="text-gray-400 text-sm">Select a client to view analysis.</p>
          </div>
        ) : !wwData.ready ? (
          <div className="rounded-xl border border-gray-500/20 p-8 space-y-3">
            <p className="text-sm text-gray-400 text-center">
              {wwData.current_count ?? 0} / {wwData.threshold ?? 50} emails needed for analysis
            </p>
            <div className="w-full h-2 rounded-full bg-gray-500/20 overflow-hidden">
              <div
                className="h-full rounded-full bg-purple-500 transition-all duration-500"
                style={{ width: `${wwProgress}%` }}
              />
            </div>
            <p className="text-xs text-gray-600 text-center">{wwProgress}% complete</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Top pitch angles */}
            {wwData.by_pitch_angle && wwData.by_pitch_angle.length > 0 && (
              <div className="p-5 rounded-xl border border-gray-500/20 bg-[#141420]/50">
                <h3 className="text-sm font-medium text-white mb-3">Top Pitch Angles</h3>
                <div className="space-y-2">
                  {wwData.by_pitch_angle.slice(0, 8).map((item) => (
                    <div key={item.pitch_angle} className="flex items-center justify-between gap-2">
                      <span className="text-xs text-gray-300 flex-1 truncate">{item.pitch_angle}</span>
                      <span className="text-xs text-gray-500">{item.total_drafts} drafts</span>
                      <span className={`text-xs font-medium ${item.approval_rate >= 0.5 ? 'text-green-400' : 'text-amber-400'}`}>
                        {(item.approval_rate * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top outlet types */}
            {wwData.by_outlet_type && wwData.by_outlet_type.length > 0 && (
              <div className="p-5 rounded-xl border border-gray-500/20 bg-[#141420]/50">
                <h3 className="text-sm font-medium text-white mb-3">Top Outlet Types</h3>
                <div className="space-y-2">
                  {wwData.by_outlet_type.map((item) => (
                    <div key={item.outlet_type} className="flex items-center justify-between gap-2">
                      <span className="text-xs text-gray-300 capitalize flex-1">{item.outlet_type.replace(/_/g, ' ')}</span>
                      <span className="text-xs text-gray-500">{item.total_drafts} drafts</span>
                      <span className={`text-xs font-medium ${item.approval_rate >= 0.5 ? 'text-green-400' : 'text-amber-400'}`}>
                        {(item.approval_rate * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Common rejection reasons */}
            {wwData.common_rejection_reasons && wwData.common_rejection_reasons.length > 0 && (
              <div className="p-5 rounded-xl border border-gray-500/20 bg-[#141420]/50 md:col-span-2">
                <h3 className="text-sm font-medium text-white mb-3">Common Rejection Reasons</h3>
                <ul className="space-y-1.5">
                  {wwData.common_rejection_reasons.map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-gray-400">
                      <span className="text-red-400 shrink-0">-</span>
                      <span className="flex-1">{item.reason}</span>
                      <span className="text-gray-600">{item.count}x</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

type TabKey = 'log' | 'reports';

export default function FeedbackPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('log');

  const { data: clientsData } = useQuery({
    queryKey: ['pr-clients'],
    queryFn: async () => {
      const res = await fetch('/api/team-pr/clients', { credentials: 'include' });
      const json = await res.json();
      return json.data;
    },
  });

  const clients: PRClient[] = clientsData?.items || [];

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'log', label: 'Feedback Log' },
    { key: 'reports', label: 'Reports' },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <Link href="/team-pr" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors -mb-4">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Back to Team PR
      </Link>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-navy dark:text-white">Feedback and Calibration</h1>
        <p className="text-sm text-navy/60 dark:text-gray-400 mt-1">Track feedback history and analyze pipeline performance</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-500/20">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.key
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'log' && <FeedbackLogTab />}
      {activeTab === 'reports' && <ReportsTab clients={clients} />}
    </div>
  );
}
