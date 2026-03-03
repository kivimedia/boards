'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface ShadowComparison {
  leadId: string;
  leadName: string;
  agentDecision: string;
  humanDecision: string;
  agrees: boolean;
  reason: string | null;
}

export default function ShadowModeResults() {
  const [comparisons, setComparisons] = useState<ShadowComparison[]>([]);
  const [agreementRate, setAgreementRate] = useState(100);
  const [total, setTotal] = useState(0);
  const [disagreements, setDisagreements] = useState(0);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [analyzing, setAnalyzing] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/outreach/shadow?days=${days}`);
      const data = await res.json();
      if (res.ok) {
        setComparisons(data.data.comparisons || []);
        setAgreementRate(data.data.agreementRate || 100);
        setTotal(data.data.total || 0);
        setDisagreements(data.data.disagreements || 0);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [days]);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      await fetch('/api/outreach/shadow', { method: 'POST' });
      fetchData();
    } finally {
      setAnalyzing(false);
    }
  };

  const rateColor = agreementRate >= 90 ? 'text-green-600' :
                    agreementRate >= 75 ? 'text-amber-600' :
                    'text-red-600';

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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/outreach" className="text-sm text-navy/40 dark:text-slate-500 hover:text-electric font-body transition-colors">
            Dashboard
          </Link>
          <span className="text-navy/20 dark:text-slate-700">/</span>
          <span className="text-sm font-semibold text-navy dark:text-white font-heading">Shadow Mode</span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            className="px-2 py-1.5 text-xs rounded-lg bg-white dark:bg-dark-card border border-cream-dark dark:border-slate-700 text-navy dark:text-white font-body"
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-electric hover:bg-electric-bright rounded-lg disabled:opacity-50 transition-colors"
          >
            {analyzing ? 'Analyzing...' : 'Run Analysis'}
          </button>
        </div>
      </div>

      <p className="text-xs text-navy/40 dark:text-slate-500 font-body">
        Compares agent decisions with your manual overrides to measure alignment and generate learning proposals.
      </p>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 p-5">
          <p className="text-[10px] text-navy/40 dark:text-slate-500 uppercase font-heading">Agreement Rate</p>
          <p className={`text-3xl font-bold ${rateColor} font-heading mt-1`}>
            {agreementRate.toFixed(1)}%
          </p>
          <p className="text-[10px] text-navy/30 dark:text-slate-600 font-body mt-1">
            {total} total decisions analyzed
          </p>
        </div>
        <div className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 p-5">
          <p className="text-[10px] text-navy/40 dark:text-slate-500 uppercase font-heading">Agreements</p>
          <p className="text-3xl font-bold text-green-600 font-heading mt-1">
            {total - disagreements}
          </p>
          <p className="text-[10px] text-navy/30 dark:text-slate-600 font-body mt-1">
            Agent matched your decision
          </p>
        </div>
        <div className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 p-5">
          <p className="text-[10px] text-navy/40 dark:text-slate-500 uppercase font-heading">Disagreements</p>
          <p className={`text-3xl font-bold font-heading mt-1 ${disagreements > 0 ? 'text-amber-600' : 'text-navy dark:text-white'}`}>
            {disagreements}
          </p>
          <p className="text-[10px] text-navy/30 dark:text-slate-600 font-body mt-1">
            Required manual override
          </p>
        </div>
      </div>

      {/* Disagreement drill-down */}
      {comparisons.length > 0 ? (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 overflow-hidden">
          <div className="px-5 py-3 border-b border-cream-dark dark:border-slate-700">
            <h3 className="text-xs font-semibold text-navy/60 dark:text-slate-400 uppercase font-heading">
              Disagreements Detail
            </h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cream-dark dark:border-slate-700">
                <th className="text-left px-5 py-2.5 text-[10px] font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider font-heading">Lead</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider font-heading">Agent Said</th>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider font-heading">You Said</th>
                <th className="text-left px-5 py-2.5 text-[10px] font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider font-heading">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-dark dark:divide-slate-700/50">
              {comparisons.map((comp, i) => (
                <tr key={i} className="hover:bg-cream/50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-5 py-2.5">
                    <Link
                      href={`/outreach/leads/${comp.leadId}`}
                      className="text-xs font-semibold text-electric hover:text-electric-bright font-heading transition-colors"
                    >
                      {comp.leadName}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="px-2 py-0.5 text-[10px] font-semibold bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-300 rounded">
                      {comp.agentDecision}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="px-2 py-0.5 text-[10px] font-semibold bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-300 rounded">
                      {comp.humanDecision}
                    </span>
                  </td>
                  <td className="px-5 py-2.5">
                    <span className="text-xs text-navy/50 dark:text-slate-400 font-body">
                      {comp.reason || '-'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700">
          <p className="text-sm text-navy/40 dark:text-slate-500 font-body">No disagreements found</p>
          <p className="text-[10px] text-navy/30 dark:text-slate-600 mt-1">
            {total > 0 ? 'Agent decisions match all your overrides' : 'No qualification decisions recorded yet'}
          </p>
        </div>
      )}
    </div>
  );
}
