'use client';

import { useState, useEffect, useCallback } from 'react';
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
  { value: '30_min_before', label: '30 min before' },
  { value: '1_hour_before', label: '1 hour before' },
  { value: '2_hours_before', label: '2 hours before' },
  { value: '1_day_before', label: '1 day before' },
  { value: 'custom', label: 'Custom...' },
];

const TIMING_LABELS: Record<string, string> = {
  '30_min_before': '30min before',
  '1_hour_before': '1h before',
  '2_hours_before': '2h before',
  '1_day_before': '1 day before',
  'custom': 'Custom',
};

// --------------- Config Card (collapsed view) ---------------
function ConfigCard({
  config,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  config: Config;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className={`rounded-xl border ${config.is_active ? 'border-electric/20 bg-electric/5 dark:bg-electric/10' : 'border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-slate-800/50'} px-3 py-2.5 transition-colors`}>
      <div className="flex items-center gap-2">
        {/* Calendar icon */}
        <svg className={`w-4 h-4 shrink-0 ${config.is_active ? 'text-electric' : 'text-navy/30 dark:text-slate-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" strokeWidth="2" />
          <line x1="16" y1="2" x2="16" y2="6" strokeWidth="2" strokeLinecap="round" />
          <line x1="8" y1="2" x2="8" y2="6" strokeWidth="2" strokeLinecap="round" />
          <line x1="3" y1="10" x2="21" y2="10" strokeWidth="2" />
        </svg>

        {/* Event title */}
        <span className={`text-sm font-medium font-body flex-1 min-w-0 truncate ${config.is_active ? 'text-navy dark:text-slate-100' : 'text-navy/50 dark:text-slate-400'}`}>
          {config.calendar_event_keyword}
        </span>

        {/* Badges */}
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cream-dark/60 dark:bg-slate-700/60 text-navy/50 dark:text-slate-400 font-body whitespace-nowrap">
          {config.custom_minutes && config.update_timing === 'custom'
            ? `${config.custom_minutes}min before`
            : TIMING_LABELS[config.update_timing] || config.update_timing}
        </span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-body whitespace-nowrap ${config.send_mode === 'auto_send' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'}`}>
          {config.send_mode === 'auto_send' ? 'Auto' : 'Review'}
        </span>

        {/* Active toggle */}
        <button
          onClick={onToggleActive}
          className={`relative w-8 h-5 rounded-full transition-colors shrink-0 ${config.is_active ? 'bg-electric' : 'bg-cream-dark dark:bg-slate-600'}`}
          title={config.is_active ? 'Pause' : 'Activate'}
        >
          <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${config.is_active ? 'translate-x-3' : ''}`} />
        </button>

        {/* Edit */}
        <button
          onClick={onEdit}
          className="p-1 text-navy/30 hover:text-electric dark:text-slate-500 dark:hover:text-electric transition-colors"
          title="Edit"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
          </svg>
        </button>

        {/* Delete */}
        {confirmDelete ? (
          <div className="flex items-center gap-1">
            <button onClick={onDelete} className="text-[10px] px-1.5 py-0.5 rounded bg-red-500 text-white font-body hover:bg-red-600 transition-colors">
              Delete
            </button>
            <button onClick={() => setConfirmDelete(false)} className="text-[10px] px-1.5 py-0.5 rounded bg-cream-dark dark:bg-slate-600 text-navy/60 dark:text-slate-300 font-body hover:bg-cream-dark/80 transition-colors">
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="p-1 text-navy/30 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 transition-colors"
            title="Delete"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// --------------- Config Form (for add & edit) ---------------
function ConfigForm({
  config,
  events,
  loadingEvents,
  saving,
  onSave,
  onCancel,
}: {
  config: Config | null;
  events: CalendarEvent[];
  loadingEvents: boolean;
  saving: boolean;
  onSave: (data: { calendar_event_keyword: string; update_timing: string; custom_minutes: number | null; send_mode: 'auto_send' | 'approve'; is_active: boolean; id?: string }) => void;
  onCancel: () => void;
}) {
  const [selectedEventTitle, setSelectedEventTitle] = useState(config?.calendar_event_keyword || '');
  const [timing, setTiming] = useState(config?.update_timing || '1_hour_before');
  const [customMinutes, setCustomMinutes] = useState(config?.custom_minutes || 120);
  const [sendMode, setSendMode] = useState<'auto_send' | 'approve'>(config?.send_mode || 'approve');
  const [isActive, setIsActive] = useState(config?.is_active ?? true);
  const [filter, setFilter] = useState('');

  // Deduplicate recurring events by title
  const uniqueEvents = events.reduce<CalendarEvent[]>((acc, e) => {
    if (!acc.find(x => x.title === e.title)) acc.push(e);
    return acc;
  }, []);

  const filteredEvents = filter.trim()
    ? uniqueEvents.filter(e => e.title.toLowerCase().includes(filter.toLowerCase()))
    : uniqueEvents;

  function handleSubmit() {
    if (!selectedEventTitle.trim()) return;
    onSave({
      calendar_event_keyword: selectedEventTitle.trim(),
      update_timing: timing,
      custom_minutes: timing === 'custom' ? customMinutes : null,
      send_mode: sendMode,
      is_active: isActive,
      ...(config ? { id: config.id } : {}),
    });
  }

  return (
    <div className="rounded-xl border border-electric/30 bg-white dark:bg-dark-surface p-3 space-y-4">
      {/* Event picker */}
      <div>
        <label className="block text-xs font-semibold text-navy/70 dark:text-slate-300 mb-1.5 font-body uppercase tracking-wider">
          Calendar event
        </label>
        {selectedEventTitle ? (
          <div className="flex items-center gap-2 bg-electric/5 dark:bg-electric/10 border border-electric/20 rounded-xl px-3 py-2">
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
        ) : (
          <div>
            <input
              type="text"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Search your calendar events..."
              className="w-full px-3 py-2 rounded-xl bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body mb-2"
            />
            <div className="max-h-40 overflow-y-auto rounded-xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface divide-y divide-cream-dark/50 dark:divide-slate-700/50">
              {loadingEvents ? (
                <div className="px-3 py-3 text-xs text-navy/40 dark:text-slate-500 font-body text-center">Loading events...</div>
              ) : filteredEvents.length === 0 ? (
                <div className="px-3 py-3 text-xs text-navy/40 dark:text-slate-500 font-body text-center">
                  {events.length === 0 ? 'No calendar events found.' : 'No events match.'}
                </div>
              ) : (
                filteredEvents.map(event => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => { setSelectedEventTitle(event.title); setFilter(''); }}
                    className="w-full text-left px-3 py-2 text-sm font-body transition-colors hover:bg-electric/5 dark:hover:bg-electric/10 cursor-pointer flex items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-navy dark:text-slate-200 font-medium truncate">{event.title}</p>
                      <p className="text-[11px] text-navy/40 dark:text-slate-500 mt-0.5">
                        {new Date(event.start_time).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                        {' at '}
                        {new Date(event.start_time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                        {event.is_recurring && <span className="ml-1.5 text-electric/70">↻ recurring</span>}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Timing + Mode row */}
      {selectedEventTitle && (
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-navy/70 dark:text-slate-300 mb-1.5 font-body uppercase tracking-wider">
              When to send
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
              <div className="flex items-center gap-2 mt-1.5">
                <input
                  type="number"
                  min={5}
                  max={10080}
                  value={customMinutes}
                  onChange={e => setCustomMinutes(parseInt(e.target.value) || 60)}
                  className="w-20 px-2 py-1.5 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm font-body text-navy dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-electric/30"
                />
                <span className="text-xs text-navy/50 dark:text-slate-400 font-body">min before</span>
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-navy/70 dark:text-slate-300 mb-1.5 font-body uppercase tracking-wider">
              Mode
            </label>
            <div className="flex flex-col gap-1">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" checked={sendMode === 'approve'} onChange={() => setSendMode('approve')} className="accent-electric" />
                <span className="text-xs text-navy dark:text-slate-200 font-body">Review first</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" checked={sendMode === 'auto_send'} onChange={() => setSendMode('auto_send')} className="accent-electric" />
                <span className="text-xs text-navy dark:text-slate-200 font-body">Auto-send</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      {selectedEventTitle && (
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsActive(!isActive)}
              className={`relative w-8 h-5 rounded-full transition-colors ${isActive ? 'bg-electric' : 'bg-cream-dark dark:bg-slate-600'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${isActive ? 'translate-x-3' : ''}`} />
            </button>
            <span className="text-xs text-navy/60 dark:text-slate-400 font-body">{isActive ? 'Active' : 'Paused'}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-3 py-1.5 text-xs text-navy/60 dark:text-slate-400 hover:text-navy dark:hover:text-slate-200 font-body transition-colors"
            >
              Cancel
            </button>
            <Button size="sm" onClick={handleSubmit} loading={saving}>
              {config ? 'Save' : 'Add'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// --------------- Main Panel ---------------
export default function MeetingConfigPanel({ clientId }: Props) {
  const [configs, setConfigs] = useState<Config[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);

  const fetchConfigs = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/meeting-config`);
      if (res.ok) {
        const data = await res.json();
        setConfigs(data.data || []);
      }
    } catch {} finally {
      setLoading(false);
    }
  }, [clientId]);

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

  useEffect(() => {
    fetchConfigs();
    fetchEvents();
  }, [clientId, fetchConfigs]);

  async function handleCreate(data: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/meeting-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setAddingNew(false);
        await fetchConfigs();
      }
    } catch {} finally {
      setSaving(false);
    }
  }

  async function handleUpdate(data: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/meeting-config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setEditingId(null);
        await fetchConfigs();
      }
    } catch {} finally {
      setSaving(false);
    }
  }

  async function handleDelete(configId: string) {
    try {
      const res = await fetch(`/api/clients/${clientId}/meeting-config?configId=${configId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await fetchConfigs();
      }
    } catch {}
  }

  async function handleToggleActive(config: Config) {
    try {
      await fetch(`/api/clients/${clientId}/meeting-config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: config.id, is_active: !config.is_active }),
      });
      await fetchConfigs();
    } catch {}
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1].map(i => (
          <div key={i} className="h-10 rounded-xl bg-cream-dark/50 dark:bg-slate-700/40 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Existing configs */}
      {configs.map(config =>
        editingId === config.id ? (
          <ConfigForm
            key={config.id}
            config={config}
            events={events}
            loadingEvents={loadingEvents}
            saving={saving}
            onSave={handleUpdate}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <ConfigCard
            key={config.id}
            config={config}
            onEdit={() => { setEditingId(config.id); setAddingNew(false); }}
            onDelete={() => handleDelete(config.id)}
            onToggleActive={() => handleToggleActive(config)}
          />
        )
      )}

      {/* Add new form */}
      {addingNew ? (
        <ConfigForm
          config={null}
          events={events}
          loadingEvents={loadingEvents}
          saving={saving}
          onSave={handleCreate}
          onCancel={() => setAddingNew(false)}
        />
      ) : (
        <button
          onClick={() => { setAddingNew(true); setEditingId(null); }}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-cream-dark dark:border-slate-600 text-sm text-navy/40 dark:text-slate-500 hover:border-electric/40 hover:text-electric dark:hover:border-electric/40 dark:hover:text-electric transition-colors font-body"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Meeting Config
        </button>
      )}

      {configs.length === 0 && !addingNew && (
        <p className="text-xs text-navy/30 dark:text-slate-500 font-body text-center py-2">
          No meetings configured. Add one to start getting prep updates.
        </p>
      )}
    </div>
  );
}
