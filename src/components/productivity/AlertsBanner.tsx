'use client';

import { useEffect, useState } from 'react';
import type { ProductivityAlert } from '@/lib/types';

interface AlertsBannerProps {
  boardId?: string;
}

export default function AlertsBanner({ boardId }: AlertsBannerProps) {
  const [alerts, setAlerts] = useState<ProductivityAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAlerts();
  }, [boardId]);

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ acknowledged: 'false', limit: '10' });
      if (boardId) params.set('board_id', boardId);
      const res = await fetch(`/api/productivity/alerts?${params}`);
      if (!res.ok) return;
      const json = await res.json();
      setAlerts(json.data ?? []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  const handleAcknowledge = async (alertId: string) => {
    try {
      const res = await fetch('/api/productivity/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alert_id: alertId }),
      });
      if (res.ok) {
        setAlerts((prev) => prev.filter((a) => a.id !== alertId));
      }
    } catch {
      // silently fail
    }
  };

  if (loading || alerts.length === 0) return null;

  const severityColors = {
    critical: 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200',
    warning: 'bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200',
    info: 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200',
  };

  const severityIcons = {
    critical: '🔴',
    warning: '🟡',
    info: 'ℹ️',
  };

  const metricLabels: Record<string, string> = {
    cycle_time: 'Cycle time',
    on_time_rate: 'On-time rate',
    revision_rate: 'Revision rate',
    ai_pass_rate: 'AI pass rate',
    tickets_completed: 'Tickets completed',
    revision_outliers: 'Revision outliers',
  };

  return (
    <div className="space-y-2 mb-4">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={`flex items-center justify-between px-4 py-2.5 rounded-lg border text-sm ${severityColors[alert.severity]}`}
        >
          <div className="flex items-center gap-2">
            <span>{severityIcons[alert.severity]}</span>
            <span className="font-medium">
              {metricLabels[alert.metric_name] ?? alert.metric_name}
            </span>
            <span className="opacity-75">
              {alert.alert_type === 'above_threshold'
                ? `at ${alert.current_value.toFixed(1)}% (threshold: ${alert.threshold_value.toFixed(1)}%)`
                : `at ${alert.current_value.toFixed(1)}% (min: ${alert.threshold_value.toFixed(1)}%)`}
            </span>
          </div>
          <button
            onClick={() => handleAcknowledge(alert.id)}
            className="text-xs px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}
