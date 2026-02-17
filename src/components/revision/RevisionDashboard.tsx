'use client';

import { useState, useCallback } from 'react';
import type { RevisionAnalysis, Board } from '@/lib/types';
import RevisionTable from './RevisionTable';
import OutlierAlert from './OutlierAlert';

interface RevisionDashboardProps {
  boards: Pick<Board, 'id' | 'name' | 'type'>[];
}

function getDefaultStartDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().split('T')[0];
}

function getDefaultEndDate(): string {
  return new Date().toISOString().split('T')[0];
}

export default function RevisionDashboard({ boards }: RevisionDashboardProps) {
  const [selectedBoardId, setSelectedBoardId] = useState(boards[0]?.id ?? '');
  const [startDate, setStartDate] = useState(getDefaultStartDate());
  const [endDate, setEndDate] = useState(getDefaultEndDate());
  const [analysis, setAnalysis] = useState<RevisionAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [storing, setStoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalysis = useCallback(async () => {
    if (!selectedBoardId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set('start_date', startDate);
      if (endDate) params.set('end_date', endDate);

      const res = await fetch(`/api/boards/${selectedBoardId}/revision-analysis?${params.toString()}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to fetch analysis');
      }
      const json = await res.json();
      setAnalysis(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch analysis');
    } finally {
      setLoading(false);
    }
  }, [selectedBoardId, startDate, endDate]);

  const handleRecompute = useCallback(async () => {
    if (!selectedBoardId) return;
    setStoring(true);
    setError(null);
    try {
      const res = await fetch(`/api/boards/${selectedBoardId}/revision-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_date: startDate || undefined,
          end_date: endDate || undefined,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to recompute');
      }
      const json = await res.json();
      setAnalysis(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to recompute');
    } finally {
      setStoring(false);
    }
  }, [selectedBoardId, startDate, endDate]);

  const handleExportCSV = useCallback(async () => {
    if (!selectedBoardId) return;
    try {
      const res = await fetch(`/api/boards/${selectedBoardId}/revision-analysis/csv`);
      if (!res.ok) throw new Error('CSV export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `revision-metrics-${selectedBoardId}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setError('Failed to export CSV');
    }
  }, [selectedBoardId]);

  const outlierCards = analysis?.cards.filter((c) => c.is_outlier) ?? [];

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-cream/30 dark:bg-dark-bg">
      {/* Filters */}
      <div className="rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-navy/50">
          <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">Revision Analysis</h3>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">Board</label>
              <select
                value={selectedBoardId}
                onChange={(e) => setSelectedBoardId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-cream/30 dark:bg-navy/30 text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
              >
                {boards.map((board) => (
                  <option key={board.id} value={board.id}>
                    {board.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-cream/30 dark:bg-navy/30 text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-cream/30 dark:bg-navy/30 text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={fetchAnalysis}
                disabled={loading || !selectedBoardId}
                className={`
                  px-4 py-2 rounded-xl text-sm font-semibold font-body bg-electric text-white
                  hover:bg-electric/90 transition-all duration-200
                  ${loading || !selectedBoardId ? 'opacity-50 cursor-not-allowed' : ''}
                `}
              >
                {loading ? 'Analyzing...' : 'Analyze'}
              </button>
              <button
                onClick={handleRecompute}
                disabled={storing || !selectedBoardId}
                className={`
                  px-4 py-2 rounded-xl text-sm font-semibold font-body border border-electric text-electric
                  hover:bg-electric/5 transition-all duration-200
                  ${storing || !selectedBoardId ? 'opacity-50 cursor-not-allowed' : ''}
                `}
              >
                {storing ? 'Storing...' : 'Recompute & Store'}
              </button>
            </div>
          </div>
          {error && <p className="text-xs text-red-600 font-body mt-3">{error}</p>}
        </div>
      </div>

      {/* Summary Stats */}
      {analysis && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface p-5 shadow-sm">
              <p className="text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider font-heading">
                Total Cards
              </p>
              <p className="text-2xl font-bold text-navy dark:text-slate-100 font-heading mt-1">
                {analysis.totalCards}
              </p>
            </div>
            <div className="rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface p-5 shadow-sm">
              <p className="text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider font-heading">
                Avg Ping-Pong
              </p>
              <p className="text-2xl font-bold text-electric font-heading mt-1">
                {analysis.avgPingPongCount.toFixed(2)}
              </p>
            </div>
            <div className="rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface p-5 shadow-sm">
              <p className="text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider font-heading">
                Outlier Threshold
              </p>
              <p className="text-2xl font-bold text-navy/60 dark:text-slate-300 font-heading mt-1">
                {analysis.outlierThreshold.toFixed(2)}
              </p>
              <p className="text-xs text-navy/40 dark:text-slate-500 font-body">1.5x average</p>
            </div>
            <div className="rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface p-5 shadow-sm">
              <p className="text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider font-heading">
                Outlier Cards
              </p>
              <p className={`text-2xl font-bold font-heading mt-1 ${analysis.outlierCount > 0 ? 'text-red-600' : 'text-navy dark:text-slate-100'}`}>
                {analysis.outlierCount}
              </p>
            </div>
          </div>

          {/* Outlier Alert */}
          {outlierCards.length > 0 && (
            <OutlierAlert outliers={outlierCards} boardId={analysis.boardId} />
          )}

          {/* Table with CSV export */}
          <div className="rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-navy/50 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">Card Revision Metrics</h3>
              <button
                onClick={handleExportCSV}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold font-body border border-cream-dark dark:border-slate-700 text-navy dark:text-slate-100 hover:bg-cream-dark dark:hover:bg-slate-800 transition-all duration-200"
              >
                Export CSV
              </button>
            </div>
            <RevisionTable cards={analysis.cards} />
          </div>
        </>
      )}
    </div>
  );
}
