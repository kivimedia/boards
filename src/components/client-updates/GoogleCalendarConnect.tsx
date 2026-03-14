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
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    try {
      const res = await fetch('/api/google-calendar/auth');
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || 'Failed to start Google Calendar auth');
      }
    } catch (err) {
      setError('Failed to connect to server');
    }
  }

  async function handleDisconnect() {
    try {
      await fetch('/api/google-calendar/disconnect', { method: 'POST' });
      await fetchStatus();
    } catch {}
  }

  async function handleSyncNow() {
    setSyncing(true);
    setSyncResult(null);
    setError(null);
    try {
      const res = await fetch('/api/google-calendar/sync', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setSyncResult(`Synced ${data.synced} events`);
        await fetchStatus();
      } else {
        setError(data.error || 'Sync failed');
      }
    } catch {
      setError('Sync request failed');
    } finally {
      setSyncing(false);
    }
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
              {' - '}
              <span className="text-navy/30 dark:text-slate-600">Daily auto-sync at 5:00 AM UTC</span>
            </p>
          )}
          {syncResult && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-1 font-body">
              {syncResult}
            </p>
          )}
          {(status?.syncError || error) && (
            <p className="text-xs text-red-500 mt-1 font-body">
              {error || `Sync error: ${status?.syncError}`}
            </p>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {status?.connected && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleSyncNow}
              disabled={syncing}
            >
              {syncing ? (
                <span className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Syncing...
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10" />
                    <polyline points="1 20 1 14 7 14" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                  </svg>
                  Sync Now
                </span>
              )}
            </Button>
          )}
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
