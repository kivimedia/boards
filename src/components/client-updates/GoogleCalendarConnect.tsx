'use client';

import { useState, useEffect } from 'react';
import Button from '@/components/ui/Button';

export default function GoogleCalendarConnect() {
  const [status, setStatus] = useState<{
    connected: boolean;
    email: string | null;
    lastSyncAt: string | null;
    syncError: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStatus();
  }, []);

  async function fetchStatus() {
    try {
      const res = await fetch('/api/google-calendar/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data.data || data);
      }
    } catch {} finally {
      setLoading(false);
    }
  }

  async function handleConnect() {
    try {
      const res = await fetch('/api/google-calendar/auth');
      if (res.ok) {
        const data = await res.json();
        window.location.href = data.url;
      }
    } catch (err) {
      console.error('Failed to initiate Google Calendar auth:', err);
    }
  }

  async function handleDisconnect() {
    try {
      await fetch('/api/google-calendar/disconnect', { method: 'POST' });
      await fetchStatus();
    } catch {}
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-6 animate-pulse">
        <div className="h-12 w-12 rounded-xl bg-cream-dark/50 dark:bg-slate-700/40" />
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-6 mb-6">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-electric/10 flex items-center justify-center shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-electric">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-navy dark:text-slate-100 font-heading">
            Google Calendar
          </h3>
          <p className="text-sm text-navy/60 dark:text-slate-400 mt-1 font-body">
            {status?.connected
              ? `Connected as ${status.email}`
              : 'Connect your Google Calendar to sync meeting times with client updates'}
          </p>
          {status?.connected && status.lastSyncAt && (
            <p className="text-xs text-navy/40 dark:text-slate-500 mt-1 font-body">
              Last synced: {new Date(status.lastSyncAt).toLocaleString()}
            </p>
          )}
          {status?.syncError && (
            <p className="text-xs text-red-500 mt-1 font-body">
              Sync error: {status.syncError}
            </p>
          )}
        </div>
        <div className="shrink-0">
          {status?.connected ? (
            <Button size="sm" variant="ghost" onClick={handleDisconnect}>
              Disconnect
            </Button>
          ) : (
            <Button size="sm" onClick={handleConnect}>
              Connect
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
