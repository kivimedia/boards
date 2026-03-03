'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import BudgetCapBar from './BudgetCapBar';

interface SafetyData {
  accountHealth: 'green' | 'yellow' | 'red';
  healthReasons: string[];
  warmup: {
    currentWeek: number;
    dailyLimit: number;
    todaySent: number;
    weeklyTotal: number;
    progressPct: number;
  };
  acceptance: {
    rate7d: number;
    rate30d: number;
    trend: 'up' | 'down' | 'stable';
    totalSent7d: number;
    totalAccepted7d: number;
  };
  triggers: Array<{
    name: string;
    description: string;
    threshold: string;
    currentValue: string;
    triggered: boolean;
    severity: 'warning' | 'critical';
  }>;
  isPaused: boolean;
  pauseReason: string | null;
  circuitBreakers: Array<{
    service: string;
    status: 'closed' | 'open' | 'half_open';
    failureCount: number;
    lastFailure: string | null;
    threshold: number;
  }>;
  budget: {
    spent: number;
    cap: number;
    pct: number;
    alertLevel: 'ok' | 'warning' | 'critical';
  };
}

export default function SafetyDashboard() {
  const [safety, setSafety] = useState<SafetyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [resuming, setResuming] = useState(false);

  const fetchSafety = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/outreach/safety');
      const data = await res.json();
      if (res.ok) setSafety(data.data.safety);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSafety(); }, []);

  const handleResume = async () => {
    setResuming(true);
    try {
      await fetch('/api/outreach/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pause_outreach: false }),
      });
      fetchSafety();
    } finally {
      setResuming(false);
    }
  };

  const healthColor = (h: string) =>
    h === 'green' ? 'bg-green-500' : h === 'yellow' ? 'bg-amber-500' : 'bg-red-500';

  const healthLabel = (h: string) =>
    h === 'green' ? 'Healthy' : h === 'yellow' ? 'Caution' : 'Critical';

  if (loading || !safety) {
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
        <span className="text-sm font-semibold text-navy dark:text-white font-heading">Safety</span>
      </div>

      {/* Paused banner */}
      {safety.isPaused && (
        <div className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
          <div>
            <p className="text-sm font-semibold text-red-700 dark:text-red-300 font-heading">Outreach Paused</p>
            <p className="text-xs text-red-600 dark:text-red-400 font-body mt-0.5">{safety.pauseReason || 'Manually paused'}</p>
          </div>
          <button
            onClick={handleResume}
            disabled={resuming}
            className="px-4 py-2 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {resuming ? 'Resuming...' : 'Resume Outreach'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Account Health */}
        <div className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 p-5">
          <h3 className="text-xs font-semibold text-navy/60 dark:text-slate-400 uppercase font-heading mb-4">
            Account Health
          </h3>
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-10 h-10 rounded-full ${healthColor(safety.accountHealth)} flex items-center justify-center`}>
              <svg className="w-5 h-5 text-white" viewBox="0 0 20 20" fill="currentColor">
                {safety.accountHealth === 'green' ? (
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                ) : safety.accountHealth === 'yellow' ? (
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                ) : (
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                )}
              </svg>
            </div>
            <div>
              <p className="text-lg font-bold text-navy dark:text-white font-heading">
                {healthLabel(safety.accountHealth)}
              </p>
            </div>
          </div>
          <div className="space-y-1">
            {safety.healthReasons.map((r, i) => (
              <p key={i} className="text-[10px] text-navy/50 dark:text-slate-500 font-body">{r}</p>
            ))}
          </div>
        </div>

        {/* Warm-up Progress */}
        <div className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 p-5">
          <h3 className="text-xs font-semibold text-navy/60 dark:text-slate-400 uppercase font-heading mb-4">
            Warm-up Progress
          </h3>
          <div className="flex items-baseline gap-1 mb-3">
            <span className="text-2xl font-bold text-navy dark:text-white font-heading">
              Week {safety.warmup.currentWeek}
            </span>
            <span className="text-xs text-navy/40 dark:text-slate-500">of 5</span>
          </div>
          <div className="w-full h-2.5 bg-cream dark:bg-dark-surface rounded-full overflow-hidden mb-3">
            <div
              className="h-full bg-electric rounded-full transition-all duration-500"
              style={{ width: `${safety.warmup.progressPct}%` }}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 bg-cream dark:bg-dark-surface rounded-lg">
              <p className="text-[10px] text-navy/40 dark:text-slate-500">Today</p>
              <p className="text-sm font-bold text-navy dark:text-white font-heading">
                {safety.warmup.todaySent}/{safety.warmup.dailyLimit}
              </p>
            </div>
            <div className="p-2 bg-cream dark:bg-dark-surface rounded-lg">
              <p className="text-[10px] text-navy/40 dark:text-slate-500">This Week</p>
              <p className="text-sm font-bold text-navy dark:text-white font-heading">
                {safety.warmup.weeklyTotal}
              </p>
            </div>
          </div>
        </div>

        {/* Acceptance Rate */}
        <div className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 p-5">
          <h3 className="text-xs font-semibold text-navy/60 dark:text-slate-400 uppercase font-heading mb-4">
            Acceptance Rate
          </h3>
          <div className="flex items-baseline gap-2 mb-3">
            <span className={`text-2xl font-bold font-heading ${
              safety.acceptance.rate7d >= 30 ? 'text-green-600' :
              safety.acceptance.rate7d >= 20 ? 'text-amber-600' :
              'text-red-600'
            }`}>
              {safety.acceptance.rate7d.toFixed(1)}%
            </span>
            <span className="text-xs text-navy/40 dark:text-slate-500">7-day</span>
            <span className={`text-[10px] font-semibold ${
              safety.acceptance.trend === 'up' ? 'text-green-500' :
              safety.acceptance.trend === 'down' ? 'text-red-500' :
              'text-navy/40 dark:text-slate-500'
            }`}>
              {safety.acceptance.trend === 'up' ? 'Trending up' :
               safety.acceptance.trend === 'down' ? 'Trending down' :
               'Stable'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 bg-cream dark:bg-dark-surface rounded-lg">
              <p className="text-[10px] text-navy/40 dark:text-slate-500">Sent (7d)</p>
              <p className="text-sm font-bold text-navy dark:text-white font-heading">
                {safety.acceptance.totalSent7d}
              </p>
            </div>
            <div className="p-2 bg-cream dark:bg-dark-surface rounded-lg">
              <p className="text-[10px] text-navy/40 dark:text-slate-500">30-day Rate</p>
              <p className="text-sm font-bold text-navy dark:text-white font-heading">
                {safety.acceptance.rate30d.toFixed(1)}%
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Budget */}
      <BudgetCapBar {...safety.budget} />

      {/* Auto-pause triggers */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 p-5">
        <h3 className="text-xs font-semibold text-navy/60 dark:text-slate-400 uppercase font-heading mb-3">
          Auto-Pause Triggers
        </h3>
        <div className="space-y-2">
          {safety.triggers.map((trigger, i) => (
            <div
              key={i}
              className={`flex items-center justify-between p-3 rounded-lg border ${
                trigger.triggered
                  ? trigger.severity === 'critical'
                    ? 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10'
                    : 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10'
                  : 'border-cream-dark dark:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${trigger.triggered ? (trigger.severity === 'critical' ? 'bg-red-500' : 'bg-amber-500') : 'bg-green-500'}`} />
                <div>
                  <p className="text-xs font-semibold text-navy dark:text-white font-heading">{trigger.name}</p>
                  <p className="text-[10px] text-navy/40 dark:text-slate-500 font-body">{trigger.description}</p>
                </div>
              </div>
              <div className="text-right">
                <p className={`text-xs font-semibold font-heading ${
                  trigger.triggered ? (trigger.severity === 'critical' ? 'text-red-600' : 'text-amber-600') : 'text-navy/50 dark:text-slate-400'
                }`}>
                  {trigger.currentValue}
                </p>
                <p className="text-[9px] text-navy/30 dark:text-slate-600">Threshold: {trigger.threshold}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Circuit Breakers */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 p-5">
        <h3 className="text-xs font-semibold text-navy/60 dark:text-slate-400 uppercase font-heading mb-3">
          Circuit Breakers
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {safety.circuitBreakers.map((cb) => {
            const statusColor = cb.status === 'closed' ? 'bg-green-500' : cb.status === 'half_open' ? 'bg-amber-500' : 'bg-red-500';
            const statusLabel = cb.status === 'closed' ? 'OK' : cb.status === 'half_open' ? 'Warning' : 'Tripped';
            return (
              <div key={cb.service} className="p-3 bg-cream dark:bg-dark-surface rounded-lg">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className={`w-2 h-2 rounded-full ${statusColor}`} />
                  <span className="text-[10px] font-semibold text-navy dark:text-white font-heading truncate">
                    {cb.service}
                  </span>
                </div>
                <p className="text-[9px] text-navy/40 dark:text-slate-500">
                  {statusLabel} - {cb.failureCount}/{cb.threshold} failures
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
