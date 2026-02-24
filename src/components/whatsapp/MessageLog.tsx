'use client';

import { useState, useEffect, useCallback } from 'react';
import type { WhatsAppMessage, WhatsAppMessageDirection, WhatsAppMessageType, WhatsAppMessageStatus } from '@/lib/types';

const DIRECTION_BADGES: Record<WhatsAppMessageDirection, { label: string; className: string }> = {
  outbound: { label: 'OUT', className: 'bg-blue-100 text-blue-700' },
  inbound: { label: 'IN', className: 'bg-green-100 text-green-700' },
};

const TYPE_BADGES: Record<WhatsAppMessageType, { label: string; className: string }> = {
  notification: { label: 'Notification', className: 'bg-electric/10 text-electric' },
  quick_action: { label: 'Quick Action', className: 'bg-purple-100 text-purple-700' },
  digest: { label: 'Digest', className: 'bg-amber-100 text-amber-700' },
  verification: { label: 'Verification', className: 'bg-teal-100 text-teal-700' },
  reply: { label: 'Reply', className: 'bg-gray-100 text-gray-700' },
};

const STATUS_BADGES: Record<WhatsAppMessageStatus, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-yellow-100 text-yellow-700' },
  sent: { label: 'Sent', className: 'bg-blue-100 text-blue-700' },
  delivered: { label: 'Delivered', className: 'bg-green-100 text-green-700' },
  read: { label: 'Read', className: 'bg-green-200 text-green-800' },
  failed: { label: 'Failed', className: 'bg-red-100 text-red-700' },
};

export default function MessageLog() {
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>('');

  const fetchMessages = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (typeFilter) params.set('message_type', typeFilter);
      params.set('limit', '100');

      const res = await fetch(`/api/whatsapp/messages?${params.toString()}`);
      const json = await res.json();
      if (json.data) setMessages(json.data);
    } finally {
      setLoading(false);
    }
  }, [typeFilter]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const formatTimestamp = (ts: string) => {
    const date = new Date(ts);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-16 rounded-lg bg-cream-dark/40 dark:bg-slate-800/40" />
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">Message Log</h3>
        <select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value);
            setLoading(true);
          }}
          className="px-3 py-1.5 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-xs text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30"
        >
          <option value="">All Types</option>
          <option value="notification">Notification</option>
          <option value="quick_action">Quick Action</option>
          <option value="digest">Digest</option>
          <option value="verification">Verification</option>
          <option value="reply">Reply</option>
        </select>
      </div>

      {messages.length === 0 ? (
        <p className="text-xs text-navy/50 dark:text-slate-400 font-body text-center py-8">No messages found.</p>
      ) : (
        <div className="max-h-[500px] overflow-y-auto space-y-2">
          {messages.map((msg) => {
            const dirBadge = DIRECTION_BADGES[msg.direction];
            const typeBadge = TYPE_BADGES[msg.message_type];
            const statusBadge = STATUS_BADGES[msg.status];

            return (
              <div
                key={msg.id}
                className="p-3 rounded-lg bg-cream/30 dark:bg-navy/30 border border-cream-dark/20 dark:border-slate-700/20 hover:bg-cream/50 dark:hover:bg-slate-800/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${dirBadge.className}`}
                      >
                        {dirBadge.label}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium font-body ${typeBadge.className}`}
                      >
                        {typeBadge.label}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium font-body ${statusBadge.className}`}
                      >
                        {statusBadge.label}
                      </span>
                    </div>
                    <p className="text-xs text-navy dark:text-slate-100 font-body truncate">{msg.content}</p>
                    {msg.error_message && (
                      <p className="text-xs text-red-500 font-body mt-1">{msg.error_message}</p>
                    )}
                  </div>
                  <span className="text-[10px] text-navy/40 dark:text-slate-500 font-body whitespace-nowrap">
                    {formatTimestamp(msg.created_at)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
