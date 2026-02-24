'use client';

import { useState, useEffect } from 'react';
import type { ClientWeeklyUpdate } from '@/lib/types';
import UpdatePreviewModal from './UpdatePreviewModal';

interface Props {
  clientId: string;
}

const STATUS_DOT: Record<string, string> = {
  draft: 'bg-gray-400',
  pending_approval: 'bg-amber-400',
  approved: 'bg-blue-400',
  scheduled: 'bg-electric',
  sent: 'bg-green-500',
  failed: 'bg-red-500',
  cancelled: 'bg-gray-300',
};

export default function UpdateHistoryList({ clientId }: Props) {
  const [updates, setUpdates] = useState<ClientWeeklyUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUpdate, setSelectedUpdate] = useState<ClientWeeklyUpdate | null>(null);

  useEffect(() => {
    fetchUpdates();
  }, [clientId]);

  async function fetchUpdates() {
    try {
      const res = await fetch(`/api/clients/${clientId}/weekly-updates?limit=10`);
      if (res.ok) {
        const data = await res.json();
        setUpdates(data.data || []);
      }
    } catch {} finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-2 p-4">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-14 rounded-xl bg-cream-dark/50 dark:bg-slate-700/40 animate-pulse" />
        ))}
      </div>
    );
  }

  if (updates.length === 0) {
    return (
      <div className="p-4 text-center">
        <p className="text-sm text-navy/40 dark:text-slate-500 font-body">
          No updates generated yet
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-1 p-4">
        {updates.map(update => (
          <button
            key={update.id}
            onClick={() => setSelectedUpdate(update)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-cream-dark/30 dark:hover:bg-slate-800/50 transition-colors text-left"
          >
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${STATUS_DOT[update.status] || 'bg-gray-400'}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-navy dark:text-slate-200 font-body truncate">
                {update.ai_summary?.slice(0, 80) || 'Update'}
              </p>
              <p className="text-xs text-navy/40 dark:text-slate-500 font-body">
                {new Date(update.created_at).toLocaleDateString()}
                {update.sent_at && ` — Sent ${new Date(update.sent_at).toLocaleDateString()}`}
              </p>
            </div>
            <span className="text-xs text-navy/40 dark:text-slate-500 font-body shrink-0 capitalize">
              {update.status.replace('_', ' ')}
            </span>
          </button>
        ))}
      </div>

      {selectedUpdate && (
        <UpdatePreviewModal
          update={selectedUpdate}
          isOpen={true}
          onClose={() => setSelectedUpdate(null)}
          onRefresh={() => { fetchUpdates(); setSelectedUpdate(null); }}
        />
      )}
    </>
  );
}
