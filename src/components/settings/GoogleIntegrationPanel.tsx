'use client';

import { useState, useEffect, useCallback } from 'react';

interface CalendarEntry {
  id: string;
  summary: string;
  description?: string;
  primary?: boolean;
  backgroundColor?: string;
  selected: boolean;
}

export default function GoogleIntegrationPanel() {
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [calendars, setCalendars] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectingOrDisconnecting, setConnectingOrDisconnecting] = useState(false);
  const [savingCalendars, setSavingCalendars] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/google/calendars');
      if (res.status === 401) {
        setConnected(false);
        return;
      }
      if (!res.ok) {
        setConnected(false);
        return;
      }
      const data = await res.json();
      setConnected(true);
      setCalendars(data.data?.calendars || []);
    } catch {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Check for query params from OAuth callback
    const params = new URLSearchParams(window.location.search);
    if (params.get('google_connected') === 'true') {
      // Clean the URL
      window.history.replaceState({}, '', '/settings');
    }
    if (params.get('google_error')) {
      setError(params.get('google_error'));
      window.history.replaceState({}, '', '/settings');
    }

    fetchStatus();
  }, [fetchStatus]);

  const handleConnect = async () => {
    setConnectingOrDisconnecting(true);
    setError(null);
    try {
      const res = await fetch('/api/integrations/google/connect');
      const data = await res.json();
      if (data.data?.url) {
        window.location.href = data.data.url;
      } else {
        setError('Failed to get Google authorization URL');
      }
    } catch {
      setError('Failed to initiate Google connection');
    } finally {
      setConnectingOrDisconnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect Google account? Email and calendar features will stop working.')) return;
    setConnectingOrDisconnecting(true);
    setError(null);
    try {
      const res = await fetch('/api/integrations/google/disconnect', { method: 'DELETE' });
      if (res.ok) {
        setConnected(false);
        setEmail(null);
        setCalendars([]);
      } else {
        setError('Failed to disconnect');
      }
    } catch {
      setError('Failed to disconnect');
    } finally {
      setConnectingOrDisconnecting(false);
    }
  };

  const toggleCalendar = async (calendarId: string) => {
    const updated = calendars.map((c) =>
      c.id === calendarId ? { ...c, selected: !c.selected } : c,
    );
    setCalendars(updated);

    setSavingCalendars(true);
    try {
      await fetch('/api/integrations/google/calendars', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          calendarIds: updated.filter((c) => c.selected).map((c) => c.id),
        }),
      });
    } catch {
      // Revert on failure
      setCalendars(calendars);
    } finally {
      setSavingCalendars(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-6">
        <div className="animate-pulse flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-cream-dark dark:bg-slate-700" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-cream-dark dark:bg-slate-700 rounded w-1/3" />
            <div className="h-3 bg-cream-dark dark:bg-slate-700 rounded w-2/3" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-6 col-span-1 md:col-span-2">
      <div className="flex items-start gap-4">
        {/* Google icon */}
        <div className="w-12 h-12 rounded-xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
            <path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-base">
              Google Workspace
            </h3>
            {connected ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Connected
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                Not connected
              </span>
            )}
          </div>

          <p className="text-navy/50 dark:text-slate-400 font-body text-sm leading-relaxed mb-4">
            {connected
              ? `Connected as ${email || 'Google account'}. Gmail drafts + Calendar visibility enabled.`
              : 'Connect your Google account to enable email drafts via Gmail and calendar visibility for capacity planning.'}
          </p>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Connect / Disconnect button */}
          {connected ? (
            <button
              onClick={handleDisconnect}
              disabled={connectingOrDisconnecting}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/40 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50"
            >
              {connectingOrDisconnecting ? 'Disconnecting...' : 'Disconnect Google'}
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={connectingOrDisconnecting}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-electric text-white hover:bg-electric-bright transition-colors disabled:opacity-50"
            >
              {connectingOrDisconnecting ? 'Connecting...' : 'Connect Google Account'}
            </button>
          )}

          {/* Calendar selection */}
          {connected && calendars.length > 0 && (
            <div className="mt-6 border-t border-cream-dark dark:border-slate-700 pt-4">
              <h4 className="text-sm font-semibold text-navy dark:text-slate-200 mb-3 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                Calendars to Monitor
                {savingCalendars && <span className="text-xs text-navy/40 dark:text-slate-500">Saving...</span>}
              </h4>
              <div className="space-y-2">
                {calendars.map((cal) => (
                  <label
                    key={cal.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-cream-dark/30 dark:hover:bg-slate-700/30 transition-colors cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={cal.selected}
                      onChange={() => toggleCalendar(cal.id)}
                      className="w-4 h-4 rounded border-cream-dark dark:border-slate-600 text-electric focus:ring-electric/30"
                    />
                    {cal.backgroundColor && (
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: cal.backgroundColor }}
                      />
                    )}
                    <span className="text-sm text-navy dark:text-slate-200 truncate">
                      {cal.summary}
                      {cal.primary && (
                        <span className="ml-1.5 text-[10px] text-navy/40 dark:text-slate-500 uppercase">Primary</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
