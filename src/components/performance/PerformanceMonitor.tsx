'use client';

import { useState, useEffect, useCallback } from 'react';

interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  threshold: number;
}

interface RegressionResult {
  passed: boolean;
  regressions: string[];
}

function formatMetricName(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace('Ms', '(ms)')
    .replace('Fps', '(FPS)');
}

function getStatusColor(metric: PerformanceMetric): string {
  if (metric.value === 0) return 'bg-navy/20';
  const isFps = metric.unit === 'fps';
  const isGood = isFps ? metric.value >= metric.threshold : metric.value <= metric.threshold;
  return isGood ? 'bg-green-500' : 'bg-red-500';
}

function getStatusText(metric: PerformanceMetric): string {
  if (metric.value === 0) return 'Not measured';
  const isFps = metric.unit === 'fps';
  const isGood = isFps ? metric.value >= metric.threshold : metric.value <= metric.threshold;
  return isGood ? 'Within threshold' : 'Exceeds threshold';
}

interface PerformanceMonitorProps {
  currentMetrics?: PerformanceMetric[];
  baseline?: PerformanceMetric[];
}

export default function PerformanceMonitor({ currentMetrics, baseline }: PerformanceMonitorProps) {
  const [thresholds, setThresholds] = useState<PerformanceMetric[]>([]);
  const [regressionResult, setRegressionResult] = useState<RegressionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingRegression, setCheckingRegression] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchThresholds = useCallback(async () => {
    try {
      const res = await fetch('/api/performance/baseline');
      if (!res.ok) throw new Error('Failed to load thresholds');
      const json = await res.json();
      setThresholds(json.data?.thresholds ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load performance data');
    } finally {
      setLoading(false);
    }
  }, []);

  const checkRegression = useCallback(async () => {
    if (!currentMetrics || currentMetrics.length === 0) return;
    setCheckingRegression(true);
    try {
      const res = await fetch('/api/performance/baseline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current: currentMetrics,
          baseline: baseline,
        }),
      });
      if (!res.ok) throw new Error('Failed to check regression');
      const json = await res.json();
      setRegressionResult(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Regression check failed');
    } finally {
      setCheckingRegression(false);
    }
  }, [currentMetrics, baseline]);

  useEffect(() => {
    fetchThresholds();
  }, [fetchThresholds]);

  useEffect(() => {
    if (currentMetrics && currentMetrics.length > 0) {
      checkRegression();
    }
  }, [currentMetrics, checkRegression]);

  // Merge thresholds with current values if provided
  const displayMetrics = thresholds.map((t) => {
    const current = currentMetrics?.find((m) => m.name === t.name);
    return {
      ...t,
      value: current?.value ?? t.value,
    };
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-3 text-navy/40 dark:text-slate-500 font-body text-sm">
          <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Loading performance metrics...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Error */}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3">
          <p className="text-xs text-red-600 font-body">{error}</p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-navy dark:text-slate-100 font-heading">Performance Monitor</h3>
          <p className="text-xs text-navy/50 dark:text-slate-400 font-body mt-0.5">
            Track key performance metrics against defined thresholds
          </p>
        </div>
        <span className="px-3 py-1.5 rounded-lg text-xs font-medium font-body bg-electric/10 text-electric">
          P5.3
        </span>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {displayMetrics.map((metric) => (
          <div
            key={metric.name}
            className="rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface p-5 shadow-sm"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${getStatusColor(metric)}`} />
              <p className="text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider font-heading truncate">
                {formatMetricName(metric.name)}
              </p>
            </div>
            <div className="flex items-baseline gap-2 mb-2">
              <p className="text-2xl font-bold text-navy dark:text-slate-100 font-heading">
                {metric.value === 0 ? '--' : metric.value}
              </p>
              <span className="text-xs text-navy/40 dark:text-slate-500 font-body">{metric.unit}</span>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-navy/40 dark:text-slate-500 font-body">
                Threshold: {metric.threshold} {metric.unit}
              </p>
            </div>
            <p className={`text-xs font-body mt-1 ${
              metric.value === 0
                ? 'text-navy/30 dark:text-slate-600'
                : getStatusColor(metric).includes('green')
                  ? 'text-green-600'
                  : 'text-red-600'
            }`}>
              {getStatusText(metric)}
            </p>
          </div>
        ))}
      </div>

      {/* Regression Check Results */}
      {regressionResult && (
        <div className={`rounded-2xl border ${
          regressionResult.passed
            ? 'border-green-200 bg-green-50'
            : 'border-red-200 bg-red-50'
        } p-5`}>
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-3 h-3 rounded-full ${
              regressionResult.passed ? 'bg-green-500' : 'bg-red-500'
            }`} />
            <h4 className="text-sm font-semibold font-heading text-navy dark:text-slate-100">
              Regression Check: {regressionResult.passed ? 'PASSED' : 'FAILED'}
            </h4>
          </div>
          {regressionResult.regressions.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {regressionResult.regressions.map((r, i) => (
                <li key={i} className="text-xs text-red-700 font-body flex items-start gap-2">
                  <span className="shrink-0 mt-0.5">-</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-green-700 font-body mt-1">
              All metrics are within acceptable degradation thresholds.
            </p>
          )}
        </div>
      )}

      {checkingRegression && (
        <div className="text-xs text-navy/40 dark:text-slate-500 font-body text-center">
          Checking for regressions...
        </div>
      )}
    </div>
  );
}
