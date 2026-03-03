'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface ABTest {
  id: string;
  template_number: number;
  template_stage: string;
  sample_a: number;
  sample_b: number;
  conversions_a: number;
  conversions_b: number;
  rate_a: number;
  rate_b: number;
  p_value: number | null;
  confidence_met: boolean;
  consecutive_wins: number;
  status: string;
  started_at: string;
  completed_at: string | null;
  evaluation: {
    rateA: number;
    rateB: number;
    pValue: number;
    significant: boolean;
    ciA: { lower: number; upper: number };
    ciB: { lower: number; upper: number };
    winner: 'A' | 'B' | null;
    status: string;
    insufficientData: boolean;
    lift: number | null;
    consecutiveWins: number;
  };
}

export default function ABTestResults() {
  const [tests, setTests] = useState<ABTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const fetchTests = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/outreach/ab-tests');
      const data = await res.json();
      if (res.ok) setTests(data.data.tests || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTests(); }, []);

  const handleCreate = async (templateNumber: number, stage: string) => {
    setCreating(true);
    try {
      await fetch('/api/outreach/ab-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_number: templateNumber, template_stage: stage }),
      });
      fetchTests();
    } finally {
      setCreating(false);
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { bg: string; text: string; label: string }> = {
      running: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-600 dark:text-blue-300', label: 'Running' },
      winner_a: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-600 dark:text-green-300', label: 'Winner: A' },
      winner_b: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-600 dark:text-green-300', label: 'Winner: B' },
      no_winner: { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400', label: 'No Winner' },
      insufficient_data: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-600 dark:text-amber-300', label: 'Insufficient Data' },
      paused: { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-500', label: 'Paused' },
    };
    const s = map[status] || map.running;
    return (
      <span className={`px-2 py-0.5 text-[10px] font-semibold rounded ${s.bg} ${s.text}`}>
        {s.label}
      </span>
    );
  };

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
          <span className="text-sm font-semibold text-navy dark:text-white font-heading">A/B Tests</span>
        </div>
      </div>

      <p className="text-xs text-navy/40 dark:text-slate-500 font-body">
        Two-proportion z-test with 90% confidence. Minimum 75 samples per variant. Winner confirmed after 2 consecutive weekly wins.
      </p>

      {/* Test list */}
      {tests.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700">
          <p className="text-sm text-navy/40 dark:text-slate-500 font-body">No A/B tests yet</p>
          <p className="text-[10px] text-navy/30 dark:text-slate-600 mt-1">
            Tests are created automatically when templates have both A and B variants
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {tests.map(test => (
            <div key={test.id} className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 p-5">
              {/* Test header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-full bg-electric/10 flex items-center justify-center text-xs font-bold text-electric">
                    T{test.template_number}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-navy dark:text-white font-heading">
                      Template {test.template_number} - {test.template_stage}
                    </p>
                    <p className="text-[10px] text-navy/40 dark:text-slate-500 font-body">
                      Started {new Date(test.started_at).toLocaleDateString()}
                      {test.completed_at && ` - Completed ${new Date(test.completed_at).toLocaleDateString()}`}
                    </p>
                  </div>
                </div>
                {statusBadge(test.evaluation.status)}
              </div>

              {/* Side-by-side comparison */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                {/* Variant A */}
                <div className={`p-3 rounded-lg border ${test.evaluation.winner === 'A' ? 'border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-900/10' : 'border-cream-dark dark:border-slate-700'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2 py-0.5 text-[10px] font-semibold bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 rounded">
                      Variant A
                    </span>
                    {test.evaluation.winner === 'A' && (
                      <span className="text-[10px] font-semibold text-green-600 dark:text-green-400">WINNER</span>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-[10px] text-navy/40 dark:text-slate-500">Sample</span>
                      <span className="text-xs font-semibold text-navy dark:text-white font-heading">{test.sample_a}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[10px] text-navy/40 dark:text-slate-500">Conversions</span>
                      <span className="text-xs font-semibold text-navy dark:text-white font-heading">{test.conversions_a}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[10px] text-navy/40 dark:text-slate-500">Rate</span>
                      <span className="text-xs font-bold text-electric font-heading">{(test.evaluation.rateA * 100).toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[10px] text-navy/40 dark:text-slate-500">90% CI</span>
                      <span className="text-[10px] text-navy/50 dark:text-slate-400 font-body">
                        [{(test.evaluation.ciA.lower * 100).toFixed(1)}%, {(test.evaluation.ciA.upper * 100).toFixed(1)}%]
                      </span>
                    </div>
                  </div>
                </div>

                {/* Variant B */}
                <div className={`p-3 rounded-lg border ${test.evaluation.winner === 'B' ? 'border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-900/10' : 'border-cream-dark dark:border-slate-700'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2 py-0.5 text-[10px] font-semibold bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300 rounded">
                      Variant B
                    </span>
                    {test.evaluation.winner === 'B' && (
                      <span className="text-[10px] font-semibold text-green-600 dark:text-green-400">WINNER</span>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-[10px] text-navy/40 dark:text-slate-500">Sample</span>
                      <span className="text-xs font-semibold text-navy dark:text-white font-heading">{test.sample_b}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[10px] text-navy/40 dark:text-slate-500">Conversions</span>
                      <span className="text-xs font-semibold text-navy dark:text-white font-heading">{test.conversions_b}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[10px] text-navy/40 dark:text-slate-500">Rate</span>
                      <span className="text-xs font-bold text-electric font-heading">{(test.evaluation.rateB * 100).toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[10px] text-navy/40 dark:text-slate-500">90% CI</span>
                      <span className="text-[10px] text-navy/50 dark:text-slate-400 font-body">
                        [{(test.evaluation.ciB.lower * 100).toFixed(1)}%, {(test.evaluation.ciB.upper * 100).toFixed(1)}%]
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stats footer */}
              <div className="flex items-center gap-4 pt-3 border-t border-cream-dark dark:border-slate-700">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-navy/40 dark:text-slate-500">p-value:</span>
                  <span className={`text-[10px] font-semibold ${test.evaluation.significant ? 'text-green-600' : 'text-navy/50 dark:text-slate-400'}`}>
                    {test.evaluation.pValue.toFixed(4)}
                  </span>
                </div>
                {test.evaluation.lift !== null && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-navy/40 dark:text-slate-500">Lift:</span>
                    <span className="text-[10px] font-semibold text-green-600">
                      +{test.evaluation.lift.toFixed(1)}%
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-navy/40 dark:text-slate-500">Consecutive wins:</span>
                  <span className="text-[10px] font-semibold text-navy/50 dark:text-slate-400">
                    {test.evaluation.consecutiveWins}/2
                  </span>
                </div>
                {test.evaluation.insufficientData && (
                  <span className="text-[10px] text-amber-500 font-semibold">
                    Need {75 - Math.min(test.sample_a, test.sample_b)} more samples
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
