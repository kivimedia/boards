'use client';

import { useState, useEffect, useCallback } from 'react';
import MetricCards from '@/components/productivity/MetricCards';
import UserLeaderboard from '@/components/productivity/UserLeaderboard';
import TrendChart from '@/components/productivity/TrendChart';
import DateRangeFilter from '@/components/productivity/DateRangeFilter';
import ScheduledReportManager from '@/components/productivity/ScheduledReportManager';
import AlertsBanner from '@/components/productivity/AlertsBanner';
import ComparisonOverlay from '@/components/productivity/ComparisonOverlay';
import RevisionDeepDive from '@/components/productivity/RevisionDeepDive';
import type { ProductivityMetrics, UserScorecard, ProductivitySnapshot } from '@/lib/types';

function getDefaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
}

function getPreviousDateRange(startDate: string, endDate: string) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end.getTime() - start.getTime();

  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - diffMs);

  return {
    startDate: prevStart.toISOString().split('T')[0],
    endDate: prevEnd.toISOString().split('T')[0],
  };
}

export default function ProductivityPage() {
  const [dateRange, setDateRange] = useState(getDefaultDateRange);
  const [comparisonMode, setComparisonMode] = useState(false);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [boards, setBoards] = useState<{ id: string; name: string }[]>([]);

  const [metrics, setMetrics] = useState<ProductivityMetrics | null>(null);
  const [previousMetrics, setPreviousMetrics] = useState<ProductivityMetrics | null>(null);
  const [scorecards, setScorecards] = useState<UserScorecard[]>([]);
  const [trendData, setTrendData] = useState<{ date: string; completed: number }[]>([]);

  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [loadingScorecards, setLoadingScorecards] = useState(true);
  const [loadingTrend, setLoadingTrend] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    setLoadingMetrics(true);
    try {
      const params = new URLSearchParams({
        start_date: dateRange.startDate,
        end_date: dateRange.endDate,
      });
      const res = await fetch(`/api/productivity/metrics?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load metrics');
      const json = await res.json();
      setMetrics(json.data);

      // Fetch comparison metrics if enabled
      if (comparisonMode) {
        const prev = getPreviousDateRange(dateRange.startDate, dateRange.endDate);
        const prevParams = new URLSearchParams({
          start_date: prev.startDate,
          end_date: prev.endDate,
        });
        const prevRes = await fetch(`/api/productivity/metrics?${prevParams.toString()}`);
        if (prevRes.ok) {
          const prevJson = await prevRes.json();
          setPreviousMetrics(prevJson.data);
        }
      } else {
        setPreviousMetrics(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load metrics');
    } finally {
      setLoadingMetrics(false);
    }
  }, [dateRange, comparisonMode]);

  const fetchScorecards = useCallback(async () => {
    setLoadingScorecards(true);
    try {
      const params = new URLSearchParams({
        start_date: dateRange.startDate,
        end_date: dateRange.endDate,
      });
      const res = await fetch(`/api/productivity/scorecards?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load scorecards');
      const json = await res.json();
      setScorecards(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load scorecards');
    } finally {
      setLoadingScorecards(false);
    }
  }, [dateRange]);

  const fetchTrendData = useCallback(async () => {
    setLoadingTrend(true);
    try {
      const params = new URLSearchParams({
        start_date: dateRange.startDate,
        end_date: dateRange.endDate,
      });
      const res = await fetch(`/api/productivity/snapshots?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load trend data');
      const json = await res.json();
      const snapshots: ProductivitySnapshot[] = json.data ?? [];

      // Aggregate snapshots by date for trend
      const dateMap = new Map<string, number>();
      for (const s of snapshots) {
        const existing = dateMap.get(s.snapshot_date) ?? 0;
        dateMap.set(s.snapshot_date, existing + s.tickets_completed);
      }

      const trend = Array.from(dateMap.entries())
        .map(([date, completed]) => ({ date, completed }))
        .sort((a, b) => a.date.localeCompare(b.date));

      setTrendData(trend);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trend data');
    } finally {
      setLoadingTrend(false);
    }
  }, [dateRange]);

  // Fetch boards list for revision deep dive selector
  useEffect(() => {
    async function loadBoards() {
      try {
        const res = await fetch('/api/boards');
        if (res.ok) {
          const json = await res.json();
          const list = (json.data ?? []).map((b: { id: string; name: string }) => ({
            id: b.id,
            name: b.name,
          }));
          setBoards(list);
          if (list.length > 0 && !selectedBoardId) setSelectedBoardId(list[0].id);
        }
      } catch { /* silently fail */ }
    }
    loadBoards();
  }, []);

  useEffect(() => {
    setError(null);
    fetchMetrics();
    fetchScorecards();
    fetchTrendData();
  }, [fetchMetrics, fetchScorecards, fetchTrendData]);

  return (
    <div className="min-h-screen bg-cream">
      {/* Header */}
      <div className="border-b border-cream-dark bg-white">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-navy font-heading">
                Team Productivity
              </h1>
              <p className="text-sm text-navy/50 font-body mt-0.5">
                Track completion rates, cycle times, and team performance metrics
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1.5 rounded-lg text-xs font-medium font-body bg-electric/10 text-electric">
                P4.2
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Alerts banner */}
        <AlertsBanner />

        {/* Error banner */}
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3">
            <p className="text-xs text-red-600 font-body">{error}</p>
          </div>
        )}

        {/* Date range filter */}
        <DateRangeFilter
          value={dateRange}
          onChange={setDateRange}
          comparisonMode={comparisonMode}
          onComparisonToggle={setComparisonMode}
        />

        {/* Metric cards */}
        {metrics ? (
          <MetricCards
            metrics={metrics}
            previousMetrics={comparisonMode ? previousMetrics : null}
            loading={loadingMetrics}
          />
        ) : (
          <MetricCards
            metrics={{
              ticketsCompleted: 0,
              ticketsCreated: 0,
              avgCycleTimeHours: 0,
              onTimeRate: 0,
              revisionRate: 0,
              aiPassRate: 0,
            }}
            loading={loadingMetrics}
          />
        )}

        {/* Period comparison overlay */}
        {metrics && (
          <ComparisonOverlay
            current={metrics}
            previous={previousMetrics ?? undefined}
            show={comparisonMode}
          />
        )}

        {/* Trend chart */}
        <TrendChart data={trendData} loading={loadingTrend} />

        {/* User leaderboard */}
        <UserLeaderboard scorecards={scorecards} loading={loadingScorecards} />

        {/* Revision deep dive */}
        {selectedBoardId && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-navy dark:text-white font-heading">
                Revision Analysis
              </h2>
              {boards.length > 1 && (
                <select
                  value={selectedBoardId}
                  onChange={(e) => setSelectedBoardId(e.target.value)}
                  className="text-xs rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-slate-800 text-navy dark:text-white px-2 py-1"
                >
                  {boards.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              )}
            </div>
            <RevisionDeepDive
              boardId={selectedBoardId}
              startDate={dateRange.startDate}
              endDate={dateRange.endDate}
            />
          </div>
        )}

        {/* Scheduled reports */}
        <ScheduledReportManager />
      </div>
    </div>
  );
}
