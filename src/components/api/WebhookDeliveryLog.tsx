'use client';

import { useState, useEffect, useCallback } from 'react';
import type { WebhookDelivery } from '@/lib/types';
import Button from '@/components/ui/Button';

interface WebhookDeliveryLogProps {
  webhookId: string;
  onBack?: () => void;
}

export default function WebhookDeliveryLog({ webhookId, onBack }: WebhookDeliveryLogProps) {
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [limit, setLimit] = useState(50);

  const fetchDeliveries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/webhooks/${webhookId}/deliveries?limit=${limit}`);
      const json = await res.json();
      if (json.data) {
        setDeliveries(json.data);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [webhookId, limit]);

  useEffect(() => {
    fetchDeliveries();
  }, [fetchDeliveries]);

  const formatTime = (d: string) => {
    return new Date(d).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-3 text-navy/40 dark:text-slate-500 font-body text-sm">
          <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Loading deliveries...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-navy/40 dark:text-slate-500 hover:text-navy dark:hover:text-slate-100 hover:bg-cream-dark dark:hover:bg-slate-800 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}
          <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-base">Delivery Log</h3>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={limit}
            onChange={(e) => setLimit(parseInt(e.target.value, 10))}
            className="appearance-none px-3 py-1.5 rounded-lg bg-white dark:bg-dark-surface border-2 border-cream-dark dark:border-slate-700 text-navy dark:text-slate-100 text-sm font-body focus:outline-none focus:border-electric"
          >
            <option value={25}>25 entries</option>
            <option value={50}>50 entries</option>
            <option value={100}>100 entries</option>
            <option value={200}>200 entries</option>
          </select>
          <Button variant="ghost" size="sm" onClick={fetchDeliveries}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Delivery Table */}
      <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 overflow-hidden">
        {deliveries.length === 0 ? (
          <div className="px-6 py-12 text-center text-navy/40 dark:text-slate-500 font-body text-sm">
            No deliveries yet.
          </div>
        ) : (
          <div className="divide-y divide-cream-dark dark:divide-slate-700">
            {deliveries.map((delivery) => (
              <div key={delivery.id}>
                {/* Row */}
                <button
                  onClick={() => setExpandedId(expandedId === delivery.id ? null : delivery.id)}
                  className="w-full flex items-center gap-4 px-6 py-3 hover:bg-cream/30 dark:hover:bg-slate-800/30 transition-colors text-left"
                >
                  {/* Status Badge */}
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium shrink-0 ${
                      delivery.success
                        ? 'bg-green-50 text-green-700 border border-green-200'
                        : 'bg-red-50 text-red-700 border border-red-200'
                    }`}
                  >
                    {delivery.success ? 'OK' : 'FAIL'}
                  </span>

                  {/* Event */}
                  <span className="text-sm font-medium text-navy dark:text-slate-100 font-body min-w-[140px]">
                    {delivery.event_type}
                  </span>

                  {/* Response Status */}
                  <span className="text-xs text-navy/50 dark:text-slate-400 font-mono min-w-[40px]">
                    {delivery.response_status ?? '--'}
                  </span>

                  {/* Response Time */}
                  <span className="text-xs text-navy/40 dark:text-slate-500 font-body min-w-[60px]">
                    {delivery.response_time_ms !== null ? `${delivery.response_time_ms}ms` : '--'}
                  </span>

                  {/* Error */}
                  {delivery.error_message && (
                    <span className="text-xs text-red-500 font-body truncate flex-1">
                      {delivery.error_message}
                    </span>
                  )}

                  {/* Time */}
                  <span className="text-xs text-navy/30 dark:text-slate-600 font-body ml-auto shrink-0">
                    {formatTime(delivery.delivered_at)}
                  </span>

                  {/* Expand arrow */}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`text-navy/20 dark:text-slate-600 transition-transform shrink-0 ${expandedId === delivery.id ? 'rotate-180' : ''}`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {/* Expanded Details */}
                {expandedId === delivery.id && (
                  <div className="px-6 pb-4 pt-1 bg-cream/20 dark:bg-navy/20 border-t border-cream-dark dark:border-slate-700">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Payload */}
                      <div>
                        <p className="text-xs font-semibold text-navy/60 dark:text-slate-400 mb-1.5 font-body">Payload</p>
                        <pre className="bg-navy/5 dark:bg-slate-800 border border-navy/10 dark:border-slate-700 rounded-xl p-3 text-xs text-navy dark:text-slate-100 font-mono overflow-auto max-h-48">
                          {JSON.stringify(delivery.payload, null, 2)}
                        </pre>
                      </div>

                      {/* Response */}
                      <div>
                        <p className="text-xs font-semibold text-navy/60 dark:text-slate-400 mb-1.5 font-body">Response</p>
                        <pre className="bg-navy/5 dark:bg-slate-800 border border-navy/10 dark:border-slate-700 rounded-xl p-3 text-xs text-navy dark:text-slate-100 font-mono overflow-auto max-h-48">
                          {delivery.response_body || '(no response body)'}
                        </pre>
                        {delivery.error_message && (
                          <div className="mt-2 p-2 rounded-lg bg-red-50 border border-red-200">
                            <p className="text-xs text-red-700 font-body">{delivery.error_message}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
