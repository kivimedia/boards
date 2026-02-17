'use client';

import { useState } from 'react';
import { ClientTicketType, CardPriority } from '@/lib/types';
import Button from '@/components/ui/Button';

interface ClientTicketSubmitProps {
  clientId: string;
  onSubmit: () => void;
}

interface Toast {
  type: 'success' | 'error';
  message: string;
}

const TICKET_TYPES: { value: ClientTicketType; label: string }[] = [
  { value: 'general', label: 'General Request' },
  { value: 'design', label: 'Design' },
  { value: 'dev', label: 'Development' },
  { value: 'bug', label: 'Bug Report' },
  { value: 'content', label: 'Content' },
  { value: 'video', label: 'Video' },
];

const PRIORITIES: { value: CardPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

export default function ClientTicketSubmit({ clientId, onSubmit }: ClientTicketSubmitProps) {
  const [ticketType, setTicketType] = useState<ClientTicketType>('general');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<CardPriority>('medium');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      showToast('error', 'Please enter a ticket title.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket_type: ticketType,
          title: title.trim(),
          description: description.trim() || null,
          priority,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to submit ticket');
      }

      showToast('success', 'Ticket submitted successfully.');
      setTitle('');
      setDescription('');
      setTicketType('general');
      setPriority('medium');
      onSubmit();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to submit ticket.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-dark-surface rounded-2xl border border-cream-dark dark:border-slate-700 shadow-card p-6">
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

      {/* Header */}
      <div className="flex items-center gap-2 mb-5">
        <svg className="w-5 h-5 text-electric" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h3 className="text-base font-semibold text-navy dark:text-slate-100 font-heading">Submit a New Ticket</h3>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Ticket Type */}
        <div>
          <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1.5 uppercase tracking-wider font-heading">
            Ticket Type
          </label>
          <select
            value={ticketType}
            onChange={(e) => setTicketType(e.target.value as ClientTicketType)}
            className="
              w-full px-3 py-2.5 rounded-xl bg-cream dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100
              focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body
              appearance-none cursor-pointer
            "
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%230f172a' stroke-opacity='0.3'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 0.75rem center',
              backgroundSize: '1rem',
            }}
          >
            {TICKET_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* Title */}
        <div>
          <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1.5 uppercase tracking-wider font-heading">
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Brief description of your request"
            className="
              w-full px-3 py-2.5 rounded-xl bg-cream dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100
              placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30
              focus:border-electric font-body
            "
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1.5 uppercase tracking-wider font-heading">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Provide any additional details, links, or context..."
            rows={4}
            className="
              w-full px-3 py-2.5 rounded-xl bg-cream dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100
              placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30
              focus:border-electric font-body resize-none
            "
          />
        </div>

        {/* Priority */}
        <div>
          <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1.5 uppercase tracking-wider font-heading">
            Priority
          </label>
          <div className="flex gap-2">
            {PRIORITIES.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPriority(p.value)}
                className={`
                  flex-1 px-3 py-2 rounded-xl text-sm font-medium font-body transition-all duration-200
                  ${priority === p.value
                    ? 'bg-electric text-white shadow-sm'
                    : 'bg-cream dark:bg-dark-bg border border-cream-dark dark:border-slate-700 text-navy/60 dark:text-slate-400 hover:bg-cream-dark dark:hover:bg-slate-800 hover:text-navy dark:hover:text-slate-100'
                  }
                `}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Submit */}
        <div className="pt-2 border-t border-cream-dark dark:border-slate-700">
          <Button
            type="submit"
            size="md"
            disabled={!title.trim()}
            loading={submitting}
            className="w-full"
          >
            {submitting ? 'Submitting...' : 'Submit Ticket'}
          </Button>
        </div>
      </form>
    </div>
  );
}
