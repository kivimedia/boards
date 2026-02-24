'use client';

import { useState, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import type { MeetingPrepTicket } from '@/lib/types';

interface MeetingPrepData {
  client: { id: string; name: string; company: string | null };
  meeting: { title: string; time: string; link: string | null };
  executive_summary: string;
  tickets: MeetingPrepTicket[];
  last_update: { id: string; sent_at: string | null; summary: string } | null;
  relevant_links: { label: string; url: string }[];
}

interface Props {
  clientId: string;
  meetingTitle: string;
  meetingTime: string;
  eventLink: string | null;
  isOpen: boolean;
  onClose: () => void;
  onStartMeeting: (sessionId: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  'Blocked': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  'In Review': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  'In Progress': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  'To Do': 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300',
  'Done': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};

export default function MeetingPrepPopup({ clientId, meetingTitle, meetingTime, eventLink, isOpen, onClose, onStartMeeting }: Props) {
  const [data, setData] = useState<MeetingPrepData | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (isOpen) fetchPrep();
  }, [isOpen, clientId]);

  async function fetchPrep() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ title: meetingTitle, time: meetingTime });
      if (eventLink) params.set('link', eventLink);
      const res = await fetch(`/api/meeting-prep/${clientId}?${params}`);
      if (res.ok) {
        const json = await res.json();
        setData(json.data || json);
      }
    } catch {} finally {
      setLoading(false);
    }
  }

  async function handleStartMeeting() {
    setStarting(true);
    try {
      const res = await fetch(`/api/meeting-prep/${clientId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meeting_title: meetingTitle, meeting_time: meetingTime, event_link: eventLink }),
      });
      if (res.ok) {
        const json = await res.json();
        onStartMeeting(json.data?.id || json.id);
      }
    } catch {} finally {
      setStarting(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-semibold text-navy dark:text-slate-100 font-heading">
              {data?.client.name || 'Loading...'}
            </h2>
            <p className="text-xs text-navy/50 dark:text-slate-400 font-body mt-0.5">
              {meetingTitle} — {new Date(meetingTime).toLocaleString()}
            </p>
          </div>
          {eventLink && (
            <a
              href={eventLink}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg bg-electric/10 text-electric text-sm font-medium hover:bg-electric/20 transition-colors font-body"
            >
              Join Meeting
            </a>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="h-16 rounded-xl bg-cream-dark/50 dark:bg-slate-700/40 animate-pulse" />
            ))}
          </div>
        ) : data ? (
          <>
            {/* Executive Summary */}
            <div className="bg-electric/5 dark:bg-electric/10 rounded-xl p-4 mb-5 border border-electric/20">
              <h3 className="text-xs font-semibold text-electric uppercase tracking-wide mb-2 font-heading">
                Executive Summary
              </h3>
              <p className="text-sm text-navy dark:text-slate-200 font-body leading-relaxed">
                {data.executive_summary}
              </p>
            </div>

            {/* Tickets */}
            <div className="mb-5">
              <h3 className="text-xs font-semibold text-navy/60 dark:text-slate-400 uppercase tracking-wide mb-3 font-heading">
                Tickets ({data.tickets.length})
              </h3>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {data.tickets.map(ticket => (
                  <div key={ticket.card_id} className="px-3 py-2.5 rounded-xl bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[ticket.status_label] || ''}`}>
                        {ticket.status_label}
                      </span>
                      <span className="text-sm font-medium text-navy dark:text-slate-100 font-body truncate">
                        {ticket.title}
                      </span>
                    </div>
                    {ticket.recent_comments.length > 0 && (
                      <p className="text-xs text-navy/50 dark:text-slate-400 font-body truncate mt-1">
                        Last: {ticket.recent_comments[0].author} — &ldquo;{ticket.recent_comments[0].content.slice(0, 100)}&rdquo;
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Last update */}
            {data.last_update && (
              <div className="mb-5">
                <h3 className="text-xs font-semibold text-navy/60 dark:text-slate-400 uppercase tracking-wide mb-2 font-heading">
                  Last Update Sent
                </h3>
                <p className="text-xs text-navy/40 dark:text-slate-500 font-body mb-1">
                  {data.last_update.sent_at ? new Date(data.last_update.sent_at).toLocaleDateString() : 'Draft'}
                </p>
                <p className="text-sm text-navy/70 dark:text-slate-300 font-body">
                  {data.last_update.summary}
                </p>
              </div>
            )}

            {/* Links */}
            {data.relevant_links.length > 0 && (
              <div className="flex gap-2 mb-5">
                {data.relevant_links.map(link => (
                  <a
                    key={link.url}
                    href={link.url}
                    className="px-3 py-1 rounded-lg bg-cream-dark/50 dark:bg-slate-700 text-xs text-navy/70 dark:text-slate-300 hover:text-electric transition-colors font-body"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-navy/40 dark:text-slate-500 font-body">Failed to load prep data</p>
        )}

        {/* Start Meeting */}
        <div className="pt-4 border-t border-cream-dark dark:border-slate-700">
          <Button onClick={handleStartMeeting} loading={starting} className="w-full py-3">
            Start Meeting Now
          </Button>
        </div>
      </div>
    </Modal>
  );
}
