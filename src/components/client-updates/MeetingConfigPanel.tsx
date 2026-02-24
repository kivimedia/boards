'use client';

import { useState, useEffect, useCallback } from 'react';
import Button from '@/components/ui/Button';
import type { ClientMeetingConfig, CalendarEvent } from '@/lib/types';

interface Props {
  clientId: string;
}

export default function MeetingConfigPanel({ clientId }: Props) {
  const [config, setConfig] = useState<ClientMeetingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [timing, setTiming] = useState<'1_hour_before' | '1_day_before'>('1_hour_before');
  const [sendMode, setSendMode] = useState<'auto_send' | 'approve'>('approve');
  const [isActive, setIsActive] = useState(true);
  const [matchedEvents, setMatchedEvents] = useState<CalendarEvent[]>([]);
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchConfig();
  }, [clientId]);

  async function fetchConfig() {
    try {
      const res = await fetch(`/api/clients/${clientId}/meeting-config`);
      if (res.ok) {
        const data = await res.json();
        const cfg = data.data;
        if (cfg) {
          setConfig(cfg);
          setKeyword(cfg.calendar_event_keyword || '');
          setTiming(cfg.update_timing);
          setSendMode(cfg.send_mode);
          setIsActive(cfg.is_active);
        }
      }
    } catch {} finally {
      setLoading(false);
    }
  }

  const searchEvents = useCallback((kw: string) => {
    if (searchTimeout) clearTimeout(searchTimeout);
    if (!kw.trim()) { setMatchedEvents([]); return; }

    const timeout = setTimeout(async () => {
      try {
        const res = await fetch('/api/google-calendar/events?days=14');
        if (res.ok) {
          const data = await res.json();
          const events = (data.data || []).filter((e: CalendarEvent) =>
            e.title.toLowerCase().includes(kw.toLowerCase())
          );
          setMatchedEvents(events.slice(0, 5));
        }
      } catch {}
    }, 500);
    setSearchTimeout(timeout);
  }, [searchTimeout]);

  async function handleSave() {
    setSaving(true);
    try {
      const body = {
        calendar_event_keyword: keyword.trim(),
        update_timing: timing,
        send_mode: sendMode,
        is_active: isActive,
      };

      const method = config ? 'PATCH' : 'POST';
      const res = await fetch(`/api/clients/${clientId}/meeting-config`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        setConfig(data.data);
      }
    } catch {} finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-12 rounded-xl bg-cream-dark/50 dark:bg-slate-700/40 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading mb-1">
          Weekly Update Settings
        </h3>
        <p className="text-xs text-navy/50 dark:text-slate-400 font-body">
          Configure automatic weekly updates sent before client meetings
        </p>
      </div>

      {/* Keyword match */}
      <div>
        <label className="block text-xs font-medium text-navy/70 dark:text-slate-300 mb-1.5 font-body">
          Calendar event keyword
        </label>
        <input
          type="text"
          value={keyword}
          onChange={e => { setKeyword(e.target.value); searchEvents(e.target.value); }}
          placeholder="e.g. 'Acme Weekly' or 'Client Check-in'"
          className="w-full px-3 py-2 rounded-xl bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body"
        />
        {matchedEvents.length > 0 && (
          <div className="mt-2 space-y-1">
            <p className="text-xs text-navy/50 dark:text-slate-400 font-body">Matching events:</p>
            {matchedEvents.map(e => (
              <div key={e.id} className="text-xs px-2 py-1.5 rounded-lg bg-electric/5 text-navy/70 dark:text-slate-300 font-body">
                {e.title} — {new Date(e.start_time).toLocaleDateString()} {new Date(e.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            ))}
          </div>
        )}
        {keyword.trim() && matchedEvents.length === 0 && !loading && (
          <p className="text-xs text-navy/40 dark:text-slate-500 mt-1 font-body">
            No matching events found in the next 14 days
          </p>
        )}
      </div>

      {/* Timing */}
      <div>
        <label className="block text-xs font-medium text-navy/70 dark:text-slate-300 mb-1.5 font-body">
          Send update
        </label>
        <div className="flex gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={timing === '1_hour_before'}
              onChange={() => setTiming('1_hour_before')}
              className="accent-electric"
            />
            <span className="text-sm text-navy dark:text-slate-200 font-body">1 hour before</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={timing === '1_day_before'}
              onChange={() => setTiming('1_day_before')}
              className="accent-electric"
            />
            <span className="text-sm text-navy dark:text-slate-200 font-body">1 day before</span>
          </label>
        </div>
      </div>

      {/* Send mode */}
      <div>
        <label className="block text-xs font-medium text-navy/70 dark:text-slate-300 mb-1.5 font-body">
          Send mode
        </label>
        <div className="flex gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={sendMode === 'approve'}
              onChange={() => setSendMode('approve')}
              className="accent-electric"
            />
            <span className="text-sm text-navy dark:text-slate-200 font-body">Approve before sending</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={sendMode === 'auto_send'}
              onChange={() => setSendMode('auto_send')}
              className="accent-electric"
            />
            <span className="text-sm text-navy dark:text-slate-200 font-body">Auto-send</span>
          </label>
        </div>
      </div>

      {/* Active toggle */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setIsActive(!isActive)}
          className={`relative w-10 h-6 rounded-full transition-colors ${isActive ? 'bg-electric' : 'bg-cream-dark dark:bg-slate-600'}`}
        >
          <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${isActive ? 'translate-x-4' : ''}`} />
        </button>
        <span className="text-sm text-navy dark:text-slate-200 font-body">
          {isActive ? 'Active' : 'Paused'}
        </span>
      </div>

      <div className="flex gap-2 pt-2">
        <Button size="sm" onClick={handleSave} loading={saving} disabled={!keyword.trim()}>
          {config ? 'Save Changes' : 'Enable Weekly Updates'}
        </Button>
      </div>
    </div>
  );
}
