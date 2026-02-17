'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, ClientCardStatus, ApprovalStatus, ClientTicketType } from '@/lib/types';

interface ClientPortalKanbanProps {
  clientId: string;
}

interface PortalCard extends Card {
  labels?: { name: string; color: string }[];
}

interface Toast {
  type: 'success' | 'error';
  message: string;
}

const COLUMNS: { key: ClientCardStatus | 'client_requests'; label: string }[] = [
  { key: 'in_progress', label: 'In Progress' },
  { key: 'ready_for_review', label: 'Ready for Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'client_requests', label: 'Client Requests' },
];

const TICKET_TYPE_COLORS: Record<ClientTicketType, string> = {
  design: 'bg-purple-100 text-purple-700 border-purple-200',
  bug: 'bg-red-100 text-red-700 border-red-200',
  dev: 'bg-blue-100 text-blue-700 border-blue-200',
  content: 'bg-green-100 text-green-700 border-green-200',
  video: 'bg-orange-100 text-orange-700 border-orange-200',
  general: 'bg-gray-100 text-gray-700 border-gray-200',
};

const PRIORITY_INDICATORS: Record<string, { color: string; label: string }> = {
  urgent: { color: 'bg-red-500', label: 'Urgent' },
  high: { color: 'bg-orange-500', label: 'High' },
  medium: { color: 'bg-yellow-500', label: 'Medium' },
  low: { color: 'bg-green-500', label: 'Low' },
  none: { color: 'bg-gray-300', label: 'None' },
};

const APPROVAL_BADGES: Record<ApprovalStatus, { bg: string; label: string }> = {
  pending: { bg: 'bg-yellow-100 text-yellow-700', label: 'Pending Approval' },
  approved: { bg: 'bg-green-100 text-green-700', label: 'Approved' },
  rejected: { bg: 'bg-red-100 text-red-700', label: 'Rejected' },
  revision_requested: { bg: 'bg-orange-100 text-orange-700', label: 'Revision Requested' },
};

const COLUMN_HEADER_COLORS: Record<string, string> = {
  in_progress: 'bg-blue-500',
  ready_for_review: 'bg-yellow-500',
  approved: 'bg-green-500',
  delivered: 'bg-electric',
  client_requests: 'bg-purple-500',
};

export default function ClientPortalKanban({ clientId }: ClientPortalKanbanProps) {
  const [cards, setCards] = useState<PortalCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchCards = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/client-portal/cards?clientId=${clientId}`);
      if (!res.ok) throw new Error('Failed to load cards');
      const json = await res.json();
      setCards(json.data || []);
    } catch {
      showToast('error', 'Failed to load portal cards.');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  const groupedCards: Record<string, PortalCard[]> = {};
  for (const col of COLUMNS) {
    groupedCards[col.key] = [];
  }
  for (const card of cards) {
    const status = card.client_status || 'in_progress';
    if (groupedCards[status]) {
      groupedCards[status].push(card);
    } else {
      groupedCards['in_progress'].push(card);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <svg className="animate-spin h-8 w-8 text-electric" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Toast */}
      {toast && (
        <div
          className={`
            fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg font-body text-sm
            ${toast.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
            }
          `}
        >
          <div className="flex items-center gap-2">
            {toast.type === 'success' ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Kanban Columns */}
      <div className="flex gap-4 overflow-x-auto pb-4 px-1">
        {COLUMNS.map((col) => (
          <div key={col.key} className="flex-shrink-0 w-72">
            {/* Column Header */}
            <div className="flex items-center gap-2 mb-3 px-1">
              <div className={`w-2.5 h-2.5 rounded-full ${COLUMN_HEADER_COLORS[col.key] || 'bg-gray-400'}`} />
              <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">{col.label}</h3>
              <span className="ml-auto text-xs text-navy/40 dark:text-slate-500 font-body">
                {groupedCards[col.key]?.length || 0}
              </span>
            </div>

            {/* Column Body */}
            <div className="space-y-2.5 min-h-[200px] p-2 rounded-xl bg-cream-dark/50 dark:bg-slate-800/50 border border-cream-dark dark:border-slate-700">
              {(groupedCards[col.key] || []).length === 0 ? (
                <div className="flex items-center justify-center py-10">
                  <p className="text-xs text-navy/30 dark:text-slate-600 font-body">No cards</p>
                </div>
              ) : (
                (groupedCards[col.key] || []).map((card) => (
                  <div
                    key={card.id}
                    className="bg-white dark:bg-dark-surface rounded-xl border border-cream-dark dark:border-slate-700 p-3.5 shadow-card hover:shadow-card-hover transition-all duration-200"
                  >
                    {/* Ticket Type Badge */}
                    {card.client_ticket_type && (
                      <span
                        className={`
                          inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold border mb-2 font-heading uppercase tracking-wider
                          ${TICKET_TYPE_COLORS[card.client_ticket_type] || 'bg-gray-100 text-gray-600 border-gray-200'}
                        `}
                      >
                        {card.client_ticket_type}
                      </span>
                    )}

                    {/* Card Title */}
                    <h4 className="text-sm font-medium text-navy dark:text-slate-100 font-body leading-snug mb-2">
                      {card.title}
                    </h4>

                    {/* Priority + Approval row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Priority */}
                      {card.priority && card.priority !== 'none' && (
                        <div className="flex items-center gap-1.5">
                          <div className={`w-2 h-2 rounded-full ${PRIORITY_INDICATORS[card.priority]?.color || 'bg-gray-300'}`} />
                          <span className="text-[11px] text-navy/50 dark:text-slate-400 font-body">
                            {PRIORITY_INDICATORS[card.priority]?.label || card.priority}
                          </span>
                        </div>
                      )}

                      {/* Approval Status */}
                      {card.approval_status && (
                        <span
                          className={`
                            inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium font-body
                            ${APPROVAL_BADGES[card.approval_status]?.bg || 'bg-gray-100 text-gray-600'}
                          `}
                        >
                          {APPROVAL_BADGES[card.approval_status]?.label || card.approval_status}
                        </span>
                      )}
                    </div>

                    {/* Due Date */}
                    {card.due_date && (
                      <div className="flex items-center gap-1.5 mt-2">
                        <svg className="w-3.5 h-3.5 text-navy/30 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span className="text-[11px] text-navy/40 dark:text-slate-500 font-body">
                          {new Date(card.due_date).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
