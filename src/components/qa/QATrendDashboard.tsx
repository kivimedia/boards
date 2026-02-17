'use client';

import { useState, useMemo } from 'react';
import type { QAMonitoringConfig } from '@/lib/types';

interface QARunData {
  id: string;
  date: string;
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
  brokenLinks: number;
  totalLinks: number;
  wcagCompliance: number | null;
}

interface Props {
  configs: QAMonitoringConfig[];
  runs: QARunData[];
  onConfigSelect?: (configId: string) => void;
  onExport?: () => void;
}

const ANOMALY_THRESHOLD = 10; // 10% drop = anomaly

function scoreColor(score: number): string {
  if (score >= 90) return '#22c55e';
  if (score >= 70) return '#eab308';
  if (score >= 50) return '#f97316';
  return '#ef4444';
}

export default function QATrendDashboard({ configs, runs, onConfigSelect, onExport }: Props) {
  const [selectedConfigId, setSelectedConfigId] = useState<string>(configs[0]?.id ?? '');
  const [selectedMetric, setSelectedMetric] = useState<keyof Omit<QARunData, 'id' | 'date' | 'brokenLinks' | 'totalLinks' | 'wcagCompliance'>>('performance');

  const selectedConfig = configs.find((c) => c.id === selectedConfigId);

  const handleConfigChange = (configId: string) => {
    setSelectedConfigId(configId);
    onConfigSelect?.(configId);
  };

  // Detect anomalies (drops > threshold from previous run)
  const anomalies = useMemo(() => {
    const result: Array<{ index: number; metric: string; drop: number }> = [];
    for (let i = 1; i < runs.length; i++) {
      const prev = runs[i - 1];
      const curr = runs[i];
      for (const metric of ['performance', 'accessibility', 'bestPractices', 'seo'] as const) {
        const drop = prev[metric] - curr[metric];
        if (drop > ANOMALY_THRESHOLD) {
          result.push({ index: i, metric, drop });
        }
      }
    }
    return result;
  }, [runs]);

  // SVG chart dimensions
  const chartWidth = 600;
  const chartHeight = 200;
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;

  const metricValues = runs.map((r) => r[selectedMetric] as number);
  const minVal = Math.min(...metricValues, 0);
  const maxVal = Math.max(...metricValues, 100);

  const points = runs.map((r, i) => ({
    x: padding.left + (plotWidth * i) / Math.max(runs.length - 1, 1),
    y: padding.top + plotHeight - ((r[selectedMetric] as number - minVal) / (maxVal - minVal)) * plotHeight,
    value: r[selectedMetric] as number,
    date: r.date,
  }));

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">QA Score Trends</h3>
        <div className="flex items-center gap-2">
          {/* URL Selector */}
          <select
            value={selectedConfigId}
            onChange={(e) => handleConfigChange(e.target.value)}
            className="text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-2 py-1"
          >
            {configs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.url.replace(/^https?:\/\//, '').slice(0, 40)}
              </option>
            ))}
          </select>

          {/* Export button */}
          {onExport && (
            <button
              onClick={onExport}
              className="text-sm px-3 py-1 rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
            >
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Metric Selector */}
      <div className="flex gap-2">
        {(['performance', 'accessibility', 'bestPractices', 'seo'] as const).map((metric) => {
          const latestScore = runs.length > 0 ? runs[runs.length - 1][metric] : 0;
          return (
            <button
              key={metric}
              onClick={() => setSelectedMetric(metric)}
              className={`flex-1 rounded-lg p-3 text-center transition-colors ${
                selectedMetric === metric
                  ? 'bg-blue-50 dark:bg-blue-900/30 border-2 border-blue-500'
                  : 'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-750'
              }`}
            >
              <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                {metric === 'bestPractices' ? 'Best Practices' : metric}
              </p>
              <p
                className="text-xl font-bold"
                style={{ color: scoreColor(latestScore) }}
              >
                {latestScore}
              </p>
            </button>
          );
        })}
      </div>

      {/* Chart */}
      {runs.length > 1 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-auto">
            {/* Grid lines */}
            {[0, 25, 50, 75, 100].map((val) => {
              const y = padding.top + plotHeight - ((val - minVal) / (maxVal - minVal)) * plotHeight;
              return (
                <g key={val}>
                  <line
                    x1={padding.left}
                    y1={y}
                    x2={chartWidth - padding.right}
                    y2={y}
                    stroke="currentColor"
                    strokeOpacity={0.1}
                    strokeDasharray="4 4"
                  />
                  <text
                    x={padding.left - 8}
                    y={y + 4}
                    textAnchor="end"
                    fill="currentColor"
                    fillOpacity={0.5}
                    fontSize={10}
                  >
                    {val}
                  </text>
                </g>
              );
            })}

            {/* Line */}
            <path d={pathD} fill="none" stroke="#3b82f6" strokeWidth={2} />

            {/* Points */}
            {points.map((p, i) => {
              const isAnomaly = anomalies.some(
                (a) => a.index === i && a.metric === selectedMetric
              );
              return (
                <g key={i}>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={isAnomaly ? 5 : 3}
                    fill={isAnomaly ? '#ef4444' : '#3b82f6'}
                    stroke="white"
                    strokeWidth={1}
                  />
                  {isAnomaly && (
                    <text
                      x={p.x}
                      y={p.y - 10}
                      textAnchor="middle"
                      fill="#ef4444"
                      fontSize={10}
                      fontWeight="bold"
                    >
                      ▼
                    </text>
                  )}
                </g>
              );
            })}

            {/* X-axis labels */}
            {points.filter((_, i) => i % Math.max(1, Math.floor(points.length / 6)) === 0 || i === points.length - 1).map((p, i) => (
              <text
                key={i}
                x={p.x}
                y={chartHeight - 5}
                textAnchor="middle"
                fill="currentColor"
                fillOpacity={0.5}
                fontSize={9}
              >
                {new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </text>
            ))}
          </svg>
        </div>
      ) : (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-8 text-center text-sm text-gray-500 dark:text-gray-400">
          At least 2 runs are needed to display trends
        </div>
      )}

      {/* Anomaly Alerts */}
      {anomalies.length > 0 && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3">
          <h4 className="text-sm font-medium text-red-800 dark:text-red-300 mb-2">
            Score Regressions Detected
          </h4>
          <ul className="space-y-1">
            {anomalies.map((a, i) => (
              <li key={i} className="text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
                <span className="text-red-500">▼</span>
                <span className="capitalize">{a.metric === 'bestPractices' ? 'Best Practices' : a.metric}</span>
                <span>dropped {a.drop} points on {runs[a.index]?.date ? new Date(runs[a.index].date).toLocaleDateString() : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Config Info */}
      {selectedConfig && (
        <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-4">
          <span>Frequency: {selectedConfig.frequency}</span>
          <span>Browsers: {selectedConfig.browsers.join(', ')}</span>
          <span>Alert threshold: {selectedConfig.alert_threshold}%</span>
          <span className={selectedConfig.is_active ? 'text-green-600' : 'text-red-600'}>
            {selectedConfig.is_active ? '● Active' : '○ Inactive'}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Convert run data to CSV string for export.
 */
export function runDataToCSV(runs: QARunData[]): string {
  const headers = ['Date', 'Performance', 'Accessibility', 'Best Practices', 'SEO', 'Broken Links', 'Total Links', 'WCAG Compliance'];
  const rows = runs.map((r) => [
    r.date,
    r.performance,
    r.accessibility,
    r.bestPractices,
    r.seo,
    r.brokenLinks,
    r.totalLinks,
    r.wcagCompliance ?? '',
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}
