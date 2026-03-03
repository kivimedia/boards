'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import PipelineFunnel from './PipelineFunnel';
import LeadImportModal from './LeadImportModal';
import type { LIPipelineStage } from '@/lib/types';

interface PipelineData {
  stage_counts: Record<string, number>;
  metrics: {
    total_leads: number;
    qualified_leads: number;
    needs_review: number;
    avg_lead_score: number;
    total_cost_usd: number;
  };
  recent_batches: {
    id: string;
    source_type: string;
    total_imported: number;
    qualified_count: number;
    cost_total_usd: number;
    status: string;
    created_at: string;
  }[];
}

export default function OutreachDashboard() {
  const [data, setData] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/outreach/pipeline');
      const json = await res.json();
      if (res.ok) setData(json.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleStageClick = (stage: LIPipelineStage) => {
    window.location.href = `/outreach/leads?stage=${stage}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
      </div>
    );
  }

  const m = data?.metrics;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-navy dark:text-white font-heading">LinkedIn Outreach</h1>
          <p className="text-xs text-navy/40 dark:text-slate-500 font-body mt-0.5">
            Pipeline overview and lead management
          </p>
        </div>
        <button
          onClick={() => setShowImport(true)}
          className="px-4 py-2.5 text-sm font-semibold text-white bg-electric hover:bg-electric-bright rounded-lg transition-colors flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Import Leads
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total Leads', value: m?.total_leads || 0, color: 'text-navy dark:text-white', href: '/outreach/leads' },
          { label: 'Qualified', value: m?.qualified_leads || 0, color: 'text-green-600 dark:text-green-400', href: '/outreach/leads?status=qualified' },
          { label: 'Needs Review', value: m?.needs_review || 0, color: 'text-yellow-600 dark:text-yellow-400', href: '/outreach/leads?status=needs_review' },
          { label: 'Avg Score', value: m?.avg_lead_score || 0, color: 'text-electric' },
          { label: 'Total Cost', value: `$${(m?.total_cost_usd || 0).toFixed(2)}`, color: 'text-navy/60 dark:text-slate-400', href: '/outreach/costs' },
        ].map(stat => (
          <Link
            key={stat.label}
            href={stat.href || '#'}
            className="bg-white dark:bg-dark-card rounded-xl p-4 border border-cream-dark dark:border-slate-700 hover:border-electric dark:hover:border-electric transition-colors"
          >
            <p className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase font-heading">
              {stat.label}
            </p>
            <p className={`text-2xl font-bold mt-1 font-heading ${stat.color}`}>
              {stat.value}
            </p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Pipeline Funnel */}
        <div className="lg:col-span-2 bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-navy dark:text-white font-heading">Pipeline Funnel</h2>
            <Link
              href="/outreach/leads"
              className="text-[10px] text-electric hover:text-electric-bright font-semibold transition-colors"
            >
              View All
            </Link>
          </div>
          <PipelineFunnel
            stageCounts={data?.stage_counts || {}}
            onStageClick={handleStageClick}
          />
        </div>

        {/* Recent Batches */}
        <div className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 p-5">
          <h2 className="text-sm font-semibold text-navy dark:text-white font-heading mb-4">Recent Imports</h2>
          {!data?.recent_batches?.length ? (
            <p className="text-xs text-navy/40 dark:text-slate-500 font-body text-center py-8">
              No imports yet
            </p>
          ) : (
            <div className="space-y-2">
              {data.recent_batches.map(batch => (
                <div
                  key={batch.id}
                  className="p-3 rounded-lg bg-cream dark:bg-dark-surface border border-cream-dark dark:border-slate-700"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-navy dark:text-white font-heading capitalize">
                      {batch.source_type}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold ${
                      batch.status === 'completed'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                        : batch.status === 'processing'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                        : batch.status === 'failed'
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                    }`}>
                      {batch.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-navy/40 dark:text-slate-500 font-body">
                    <span>{batch.total_imported} imported</span>
                    {batch.qualified_count > 0 && (
                      <span className="text-green-600 dark:text-green-400">{batch.qualified_count} qualified</span>
                    )}
                    {batch.cost_total_usd > 0 && (
                      <span>${batch.cost_total_usd.toFixed(2)}</span>
                    )}
                  </div>
                  <p className="text-[9px] text-navy/25 dark:text-slate-700 font-body mt-1">
                    {new Date(batch.created_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 p-5">
        <h2 className="text-sm font-semibold text-navy dark:text-white font-heading mb-3">Quick Actions</h2>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/outreach/leads"
            className="px-4 py-2 text-xs font-semibold bg-cream dark:bg-dark-surface text-navy/60 dark:text-slate-400 rounded-lg hover:bg-cream-dark dark:hover:bg-slate-700 transition-colors"
          >
            Browse Leads
          </Link>
          <Link
            href="/outreach/pipeline"
            className="px-4 py-2 text-xs font-semibold bg-cream dark:bg-dark-surface text-navy/60 dark:text-slate-400 rounded-lg hover:bg-cream-dark dark:hover:bg-slate-700 transition-colors"
          >
            Pipeline Board
          </Link>
          <Link
            href="/outreach/engagement"
            className="px-4 py-2 text-xs font-semibold bg-cream dark:bg-dark-surface text-navy/60 dark:text-slate-400 rounded-lg hover:bg-cream-dark dark:hover:bg-slate-700 transition-colors"
          >
            Engagement
          </Link>
          <Link
            href="/outreach/jobs"
            className="px-4 py-2 text-xs font-semibold bg-cream dark:bg-dark-surface text-navy/60 dark:text-slate-400 rounded-lg hover:bg-cream-dark dark:hover:bg-slate-700 transition-colors"
          >
            Job Queue
          </Link>
          <Link
            href="/outreach/costs"
            className="px-4 py-2 text-xs font-semibold bg-cream dark:bg-dark-surface text-navy/60 dark:text-slate-400 rounded-lg hover:bg-cream-dark dark:hover:bg-slate-700 transition-colors"
          >
            Cost Report
          </Link>
          <Link
            href="/outreach/trash"
            className="px-4 py-2 text-xs font-semibold bg-cream dark:bg-dark-surface text-navy/60 dark:text-slate-400 rounded-lg hover:bg-cream-dark dark:hover:bg-slate-700 transition-colors"
          >
            Trash
          </Link>
        </div>
      </div>

      {/* Import Modal */}
      <LeadImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={fetchData}
      />
    </div>
  );
}
