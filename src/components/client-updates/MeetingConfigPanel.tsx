'use client';

import { useState, useEffect } from 'react';
import Button from '@/components/ui/Button';

interface CalendarEvent {
  id: string;
  google_event_id: string;
  title: string;
  start_time: string;
  end_time: string;
  is_recurring: boolean;
}

interface Config {
  id: string;
  calendar_event_keyword: string;
  calendar_event_id: string | null;
  update_timing: string;
  custom_minutes: number | null;
  send_mode: 'auto_send' | 'approve';
  is_active: boolean;
}

interface Props {
  clientId: string;
}

const TIMING_OPTIONS = [
  { value: '30_min_before', label: '30 minutes before' },
  { value: '1_hour_before', label: '1 hour before' },
  { value: '2_hours_before', label: '2 hours before' },
  { value: '1_day_before', label: '1 day before' },
  { value: 'custom', label: 'Custom...' },
];

export default function MeetingConfigPanel({ clientId }: Props) {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [filter, setFilter] = useState('');

  // Form state
  const [selectedEventTitle, setSelectedEventTitle] = useState('');
  const [timing, setTiming] = useState('1_hour_before');
  const [customMinutes, setCustomMinutes] = useState(120);
  const [sendMode, setSendMode] = useState<'auto_send' | 'approve'>('approve');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    fetchConfig();
    fetchEvents();
  }, [clientId]);

  async function fetchConfig() {
    try {
      const res = await fetch(`/api/clients/${clientId}/meeting-config`);
      if (res.ok) {
        const data = await res.json();
        const cfg = data.data;
        if (cfg) {
          setConfig(cfg);
          setSelectedEventTitle(cfg.calendar_event_keyword || '');
          setTiming(cfg.update_timing || '1_hour_before');
          setCustomMinutes(cfg.custom_minutes || 120);
          setSendMode(cfg.send_mode);
          setIsActive(cfg.is_active);
        }
      }
    } catch {} finally {
      setLoading(false);
    }
  }

  async function fetchEvents() {
    setLoadingEvents(true);
    try {
      const res = await fetch('/api/google-calendar/events?days=30');
      if (res.ok) {
        const data = await res.json();
        setEvents(data.data || []);
      }
    } catch {} finally {
      setLoadingEvents(false);
    }
  }

  async function handleSave() {
    if (!selectedEventTitle.trim()) return;
    setSaving(true);
    try {
      const body = {
        calendar_event_keyword: selectedEventTitle.trim(),
        update_timing: timing,
        custom_minutes: timing === 'custom' ? customMinutes : null,
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

  function selectEvent(event: CalendarEvent) {
    setSelectedEventTitle(event.title);
    setFilter('');
  }

  // Deduplicate recurring events by title
  const uniqueEvents = events.reduce<CalendarEvent[]>((acc, e) => {
    if (!acc.find(x => x.title === e.title)) acc.push(e);
    return acc;
  }, []);

  const filteredEvents = filter.trim()
    ? uniqueEvents.filter(e => e.title.toLowerCase().includes(filter.toLowerCase()))
    : uniqueEvents;

  if (loading) {
    return (
      <div className="space-y-4">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-12 rounded-xl bg-cream-dark/50 dark:bg-slate-700/40 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Step 1: Pick the meeting */}
      <div>
        <label className="block text-xs font-semibold text-navy/70 dark:text-slate-300 mb-2 font-body uppercase tracking-wider">
          1. Which recurring meeting is for this client?
        </label>

        {/* Currently selected */}
        {selectedEventTitle && (
          <div className="flex items-center gap-2 bg-electric/5 dark:bg-electric/10 border border-electric/20 rounded-xl px-3 py-2 mb-2">
            <svg className="w-4 h-4 text-electric shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" strokeWidth="2" />
              <line x1="16" y1="2" x2="16" y2="6" strokeWidth="2" strokeLinecap="round" />
              <line x1="8" y1="2" x2="8" y2="6" strokeWidth="2" strokeLinecap="round" />
              <line x1="3" y1="10" x2="21" y2="10" strokeWidth="2" />
            </svg>
            <span className="text-sm font-medium text-navy dark:text-slate-100 font-body flex-1">{selectedEventTitle}</span>
            <button
              onClick={() => setSelectedEventTitle('')}
              className="text-navy/30 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Event picker */}
        {!selectedEventTitle && (
          <div>
            <input
              type="text"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Search your calendar events..."
              className="w-full px-3 py-2 rounded-xl bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body mb-2"
            />

            <div className="max-h-52 overflow-y-auto rounded-xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface divide-y divide-cream-dark/50 dark:divide-slate-700/50">
              {loadingEvents ? (
                <div className="px-3 py-4 text-xs text-navy/40 dark:text-slate-500 font-body text-center">
                  Loading calendar events...
                </div>
              ) : filteredEvents.length === 0 ? (
                <div className="px-3 py-4 text-xs text-navy/40 dark:text-slate-500 font-body text-center">
                  {events.length === 0
                    ? 'No calendar events found. Connect Google Calendar in Settings → Integrations first.'
                    : 'No events match your search.'}
                </div>
              ) : (
                filteredEvents.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => selectEvent(event)}
                    className="w-full text-left px-3 py-2.5 text-sm font-body transition-colors hover:bg-electric/5 dark:hover:bg-electric/10 cursor-pointer flex items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-navy dark:text-slate-200 font-medium truncate">{event.title}</p>
                      <p className="text-[11px] text-navy/40 dark:text-slate-500 mt-0.5">
                        Next: {new Date(event.start_time).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                        {' at '}
                        {new Date(event.start_time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                        {event.is_recurring && (
                          <span className="ml-1.5 text-electric/70">↻ recurring</span>
                        )}
                      </p>
                    </div>
                    <svg className="w-4 h-4 text-navy/20 dark:text-slate-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <line x1="12" y1="5" x2="12" y2="19" strokeWidth="2" strokeLinecap="round" />
                      <line x1="5" y1="12" x2="19" y2="12" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Step 2: When to send */}
      {selectedEventTitle && (
        <div>
          <label className="block text-xs font-semibold text-navy/70 dark:text-slate-300 mb-2 font-body uppercase tracking-wider">
            2. When to send the update?
          </label>
          <select
            value={timing}
            onChange={e => setTiming(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm font-body text-navy dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
          >
            {TIMING_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {timing === 'custom' && (
            <div className="flex items-center gap-2 mt-2">
              <input
                type="number"
                min={5}
                max={10080}
                value={customMinutes}
                onChange={e => setCustomMinutes(parseInt(e.target.value) || 60)}
                className="w-24 px-3 py-2 rounded-xl bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm font-body text-navy dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
              />
              <span className="text-sm text-navy/50 dark:text-slate-400 font-body">minutes before</span>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Send mode */}
      {selectedEventTitle && (
        <div>
          <label className="block text-xs font-semibold text-navy/70 dark:text-slate-300 mb-2 font-body uppercase tracking-wider">
            3. How to send?
          </label>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                checked={sendMode === 'approve'}
                onChange={() => setSendMode('approve')}
                className="accent-electric"
              />
              <span className="text-sm text-navy dark:text-slate-200 font-body">Review first</span>
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
      )}

      {/* Active toggle + Save */}
      {selectedEventTitle && (
        <div className="flex items-center justify-between pt-2">
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
          <Button size="sm" onClick={handleSave} loading={saving}>
            {config ? 'Save Changes' : 'Enable Updates'}
          </Button>
        </div>
      )}
    </div>
  );
}
