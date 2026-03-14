'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { PRRun, PRRunStatus } from '@/lib/types';

function StatusBadge({ status }: { status: PRRunStatus }) {
  const styles: Record<string, string> = {
    PENDING: 'bg-gray-500/20 text-gray-400',
    RESEARCH: 'bg-blue-500/20 text-blue-400',
    VERIFICATION: 'bg-blue-500/20 text-blue-400',
    QA_LOOP: 'bg-blue-500/20 text-blue-400',
    EMAIL_GEN: 'bg-blue-500/20 text-blue-400',
    GATE_A: 'bg-amber-500/20 text-amber-400',
    GATE_B: 'bg-amber-500/20 text-amber-400',
    GATE_C: 'bg-amber-500/20 text-amber-400',
    COMPLETED: 'bg-green-500/20 text-green-400',
    FAILED: 'bg-red-500/20 text-red-400',
    CANCELLED: 'bg-gray-500/20 text-gray-500',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] || 'bg-gray-500/20 text-gray-400'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
    green: 'bg-green-500/10 border-green-500/30 text-green-400',
    amber: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
    gray: 'bg-gray-500/10 border-gray-500/30 text-gray-400',
  };
  return (
    <div className={`rounded-xl border p-5 ${colorMap[color]}`}>
      <p className="text-sm font-medium opacity-80 mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

export default function TeamPRDashboard() {
  const router = useRouter();

  const { data: runsData, isLoading: runsLoading } = useQuery({
    queryKey: ['pr-runs', 'recent'],
    queryFn: async () => {
      const res = await fetch('/api/team-pr/runs?limit=10', { credentials: 'include' });
      const json = await res.json();
      return json.data;
    },
  });

  const { data: costsData } = useQuery({
    queryKey: ['pr-costs-total'],
    queryFn: async () => {
      const res = await fetch('/api/team-pr/costs', { credentials: 'include' });
      const json = await res.json();
      return json.data;
    },
  });

  const runs: PRRun[] = runsData?.items || [];
  const totalRuns = runsData?.total || 0;

  const activeRuns = runs.filter((r) =>
    ['RESEARCH', 'VERIFICATION', 'QA_LOOP', 'EMAIL_GEN', 'GATE_A', 'GATE_B', 'GATE_C'].includes(r.status)
  ).length;

  const totalOutlets = runs.reduce((sum, r) => sum + (r.outlets_discovered || 0), 0);
  const pendingEmails = runs.reduce((sum, r) => sum + Math.max(0, (r.emails_generated || 0) - (r.emails_approved || 0)), 0);
  const totalCost = costsData?.total_cost_usd ?? runs.reduce((sum, r) => sum + (r.total_cost_usd || 0), 0);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy dark:text-white">Team PR</h1>
          <p className="text-sm text-navy/60 dark:text-gray-400 mt-1">AI-powered PR outreach pipeline</p>
        </div>
        <Link
          href="/team-pr/clients"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Run
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard label="Active Runs" value={activeRuns} color="blue" />
        <SummaryCard label="Total Outlets" value={totalOutlets} color="green" />
        <SummaryCard label="Emails Pending Review" value={pendingEmails} color="amber" />
        <SummaryCard label="Total Cost" value={`$${totalCost.toFixed(2)}`} color="gray" />
      </div>

      {/* Quick Links */}
      <div className="flex gap-3 flex-wrap">
        <Link href="/team-pr/clients" className="px-3 py-1.5 rounded-lg bg-gray-500/10 text-gray-300 hover:bg-gray-500/20 text-sm transition-colors">
          Clients
        </Link>
        <Link href="/team-pr/outlets" className="px-3 py-1.5 rounded-lg bg-gray-500/10 text-gray-300 hover:bg-gray-500/20 text-sm transition-colors">
          Outlet Database
        </Link>
        <Link href="/team-pr/drafts" className="px-3 py-1.5 rounded-lg bg-gray-500/10 text-gray-300 hover:bg-gray-500/20 text-sm transition-colors">
          Email Drafts
        </Link>
        <Link href="/team-pr/feedback" className="px-3 py-1.5 rounded-lg bg-gray-500/10 text-gray-300 hover:bg-gray-500/20 text-sm transition-colors">
          Feedback
        </Link>
        <Link href="/team-pr/settings" className="px-3 py-1.5 rounded-lg bg-gray-500/10 text-gray-300 hover:bg-gray-500/20 text-sm transition-colors">
          Settings
        </Link>
      </div>

      {/* Recent Runs Table */}
      <div>
        <h2 className="text-lg font-semibold text-navy dark:text-white mb-4">Recent Runs</h2>
        {runsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 rounded-lg bg-gray-500/10 animate-pulse" />
            ))}
          </div>
        ) : runs.length === 0 ? (
          <div className="rounded-xl border border-gray-500/20 p-12 text-center">
            <p className="text-gray-400 mb-4">No PR runs yet. Start by creating a client and launching your first run.</p>
            <Link
              href="/team-pr/clients"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium transition-colors"
            >
              Get Started
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-500/20 overflow-x-auto overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-500/5 border-b border-gray-500/20">
                  <th className="text-left px-4 py-3 font-medium text-gray-400">Client</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-400">Territory</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-400">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-400">Outlets</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-400">Emails</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-400">Cost</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-400">Created</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr
                    key={run.id}
                    onClick={() => router.push(`/team-pr/runs/${run.id}`)}
                    className="border-b border-gray-500/10 hover:bg-gray-500/5 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 text-navy dark:text-white font-medium">
                      {run.client?.name || run.client_id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {run.territory?.name || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={run.status} />
                    </td>
                    <td className="px-4 py-3 text-right text-gray-300">{run.outlets_discovered}</td>
                    <td className="px-4 py-3 text-right text-gray-300">{run.emails_generated}</td>
                    <td className="px-4 py-3 text-right text-gray-300">${run.total_cost_usd.toFixed(2)}</td>
                    <td className="px-4 py-3 text-gray-400">
                      {new Date(run.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
