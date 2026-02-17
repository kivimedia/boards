'use client';

import { useState, useEffect, useCallback } from 'react';
import type { AutomationExecutionLog } from '@/lib/types';

interface ExecutionLogProps {
  boardId: string;
  ruleId?: string;
}

type StatusFilter = 'all' | 'success' | 'failed' | 'skipped';

const STATUS_BADGE_CLASSES: Record<string, string> = {
  success: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  skipped: 'bg-yellow-100 text-yellow-700',
};

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function ExecutionLog({ boardId, ruleId }: ExecutionLogProps) {
  const [logs, setLogs] = useState<AutomationExecutionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (ruleId) params.set('rule_id', ruleId);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      params.set('limit', '100');

      const res = await fetch(`/api/boards/${boardId}/automations/logs?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load logs');
      const json = await res.json();
      setLogs(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [boardId, ruleId, statusFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const statusCounts = {
    success: logs.filter((l) => l.status === 'success').length,
    failed: logs.filter((l) => l.status === 'failed').length,
    skipped: logs.filter((l) => l.status === 'skipped').length,
  };

  return (
    <div className="rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-navy/50">
        <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">Execution Log</h3>
        <p className="text-xs text-navy/40 dark:text-slate-500 font-body mt-0.5">
          {logs.length} execution{logs.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Filters */}
      <div className="px-5 py-3 border-b border-cream-dark dark:border-slate-700 flex items-center gap-2">
        {(['all', 'success', 'failed', 'skipped'] as StatusFilter[]).map((status) => {
          const isActive = statusFilter === status;
          const count = status === 'all' ? logs.length : statusCounts[status];
          return (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`
                px-3 py-1.5 rounded-lg text-xs font-medium font-body transition-all
                ${isActive
                  ? 'bg-electric text-white'
                  : 'bg-cream-dark dark:bg-slate-800 text-navy/50 dark:text-slate-400 hover:text-navy dark:hover:text-slate-100 hover:bg-cream-dark/80 dark:hover:bg-slate-700'
                }
              `}
            >
              {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
              {' '}({count})
            </button>
          );
        })}
      </div>

      {error && (
        <div className="px-5 py-2 bg-red-50 border-b border-red-100">
          <p className="text-xs text-red-600 font-body">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="p-6 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
        </div>
      ) : logs.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-sm text-navy/40 dark:text-slate-500 font-body">No execution logs yet</p>
        </div>
      ) : (
        <div className="divide-y divide-cream-dark dark:divide-slate-700 max-h-96 overflow-y-auto">
          {logs.map((log) => (
            <div key={log.id} className="px-5 py-3 hover:bg-cream/30 dark:hover:bg-slate-800/30 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${STATUS_BADGE_CLASSES[log.status] || 'bg-gray-100 text-gray-700'}`}>
                    {log.status}
                  </span>
                  <span className="text-xs text-navy/50 dark:text-slate-400 font-body font-mono">
                    Rule: {log.rule_id.substring(0, 8)}
                  </span>
                  {log.card_id && (
                    <span className="text-xs text-navy/40 dark:text-slate-500 font-body font-mono">
                      Card: {log.card_id.substring(0, 8)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {log.execution_time_ms !== null && (
                    <span className="text-[10px] text-navy/30 dark:text-slate-600 font-body">
                      {log.execution_time_ms}ms
                    </span>
                  )}
                  <span className="text-[10px] text-navy/40 dark:text-slate-500 font-body">
                    {formatTimestamp(log.created_at)}
                  </span>
                </div>
              </div>
              {log.error_message && (
                <p className="text-xs text-red-500 font-body mt-1 truncate">
                  {log.error_message}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
