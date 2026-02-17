'use client';

import { useState, useEffect, useCallback } from 'react';
import type { RecurringCard, RecurrencePattern } from '@/lib/types';

interface RecurringCardManagerProps {
  boardId: string;
}

const RECURRENCE_OPTIONS: { value: RecurrencePattern; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
];

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function RecurringCardManager({ boardId }: RecurringCardManagerProps) {
  const [cards, setCards] = useState<RecurringCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingCard, setEditingCard] = useState<RecurringCard | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [listId, setListId] = useState('');
  const [pattern, setPattern] = useState<RecurrencePattern>('weekly');
  const [recurrenceDay, setRecurrenceDay] = useState<number>(1);
  const [recurrenceTime, setRecurrenceTime] = useState('09:00');
  const [priority, setPriority] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchCards = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/boards/${boardId}/recurring-cards`);
      if (!res.ok) throw new Error('Failed to load recurring cards');
      const json = await res.json();
      setCards(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  const resetForm = useCallback(() => {
    setTitle('');
    setDescription('');
    setListId('');
    setPattern('weekly');
    setRecurrenceDay(1);
    setRecurrenceTime('09:00');
    setPriority('');
    setEditingCard(null);
    setShowForm(false);
  }, []);

  const handleEdit = useCallback((card: RecurringCard) => {
    setEditingCard(card);
    setTitle(card.title);
    setDescription(card.description || '');
    setListId(card.list_id);
    setPattern(card.recurrence_pattern);
    setRecurrenceDay(card.recurrence_day ?? 1);
    setRecurrenceTime(card.recurrence_time || '09:00');
    setPriority(card.priority || '');
    setShowForm(true);
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required'); return; }

    setSaving(true);
    setError(null);

    try {
      if (editingCard) {
        const res = await fetch(`/api/boards/${boardId}/recurring-cards/${editingCard.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim() || undefined,
            recurrence_pattern: pattern,
            recurrence_day: recurrenceDay,
            priority: priority || undefined,
          }),
        });
        if (!res.ok) throw new Error('Failed to update');
      } else {
        if (!listId.trim()) { setError('List ID is required'); setSaving(false); return; }
        const res = await fetch(`/api/boards/${boardId}/recurring-cards`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            list_id: listId.trim(),
            title: title.trim(),
            description: description.trim() || undefined,
            recurrence_pattern: pattern,
            recurrence_day: recurrenceDay,
            recurrence_time: recurrenceTime,
            priority: priority || undefined,
          }),
        });
        if (!res.ok) throw new Error('Failed to create');
      }
      resetForm();
      fetchCards();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [editingCard, boardId, title, description, listId, pattern, recurrenceDay, recurrenceTime, priority, resetForm, fetchCards]);

  const handleDelete = useCallback(async (cardId: string) => {
    try {
      const res = await fetch(`/api/boards/${boardId}/recurring-cards/${cardId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete');
      setCards((prev) => prev.filter((c) => c.id !== cardId));
    } catch {
      setError('Failed to delete');
      setTimeout(() => setError(null), 3000);
    }
  }, [boardId]);

  const handleToggleActive = useCallback(async (card: RecurringCard) => {
    try {
      const res = await fetch(`/api/boards/${boardId}/recurring-cards/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !card.is_active }),
      });
      if (!res.ok) throw new Error('Failed to toggle');
      setCards((prev) =>
        prev.map((c) => c.id === card.id ? { ...c, is_active: !c.is_active } : c)
      );
    } catch {
      setError('Failed to toggle');
      setTimeout(() => setError(null), 3000);
    }
  }, [boardId]);

  return (
    <div className="rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-navy/50 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">Recurring Cards</h3>
          <p className="text-xs text-navy/40 dark:text-slate-500 font-body mt-0.5">Auto-create cards on a schedule</p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold font-body bg-electric text-white hover:bg-electric/90 transition-all"
          >
            + New
          </button>
        )}
      </div>

      {error && (
        <div className="px-5 py-2 bg-red-50 border-b border-red-100">
          <p className="text-xs text-red-600 font-body">{error}</p>
        </div>
      )}

      {/* Create/Edit form */}
      {showForm && (
        <div className="px-5 py-4 border-b border-cream-dark dark:border-slate-700 bg-cream/20 dark:bg-navy/20">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Card title"
                  className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
                />
              </div>
              {!editingCard && (
                <div>
                  <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">List ID</label>
                  <input
                    type="text"
                    value={listId}
                    onChange={(e) => setListId(e.target.value)}
                    placeholder="Target list ID"
                    className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
                  />
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">Pattern</label>
                <select
                  value={pattern}
                  onChange={(e) => setPattern(e.target.value as RecurrencePattern)}
                  className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
                >
                  {RECURRENCE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">
                  {pattern === 'weekly' || pattern === 'biweekly' ? 'Day of Week' : 'Day of Month'}
                </label>
                {(pattern === 'weekly' || pattern === 'biweekly') ? (
                  <select
                    value={recurrenceDay}
                    onChange={(e) => setRecurrenceDay(parseInt(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
                  >
                    {DAY_LABELS.map((label, idx) => (
                      <option key={idx} value={idx}>{label}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={recurrenceDay}
                    onChange={(e) => setRecurrenceDay(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
                  />
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">Time</label>
                <input
                  type="time"
                  value={recurrenceTime}
                  onChange={(e) => setRecurrenceTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
              >
                <option value="">None</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className={`px-4 py-2 rounded-xl text-sm font-semibold font-body bg-electric text-white hover:bg-electric/90 transition-all ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {saving ? 'Saving...' : editingCard ? 'Update' : 'Create'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 rounded-xl text-sm font-semibold font-body border border-cream-dark dark:border-slate-700 text-navy dark:text-slate-300 hover:bg-cream-dark dark:hover:bg-slate-800 transition-all"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Cards list */}
      {loading ? (
        <div className="p-6 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
        </div>
      ) : cards.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-sm text-navy/40 dark:text-slate-500 font-body">No recurring cards configured</p>
        </div>
      ) : (
        <div className="divide-y divide-cream-dark dark:divide-slate-700">
          {cards.map((card) => (
            <div key={card.id} className="px-5 py-3.5 hover:bg-cream/30 dark:hover:bg-slate-800/30 transition-colors group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={card.is_active}
                    onClick={() => handleToggleActive(card)}
                    className={`
                      relative w-8 h-[18px] rounded-full transition-colors duration-200 shrink-0
                      ${card.is_active ? 'bg-green-500' : 'bg-navy/20 dark:bg-slate-700'}
                    `}
                  >
                    <span
                      className={`
                        absolute top-[1px] left-[1px] w-4 h-4 rounded-full bg-white shadow transition-transform duration-200
                        ${card.is_active ? 'translate-x-[14px]' : 'translate-x-0'}
                      `}
                    />
                  </button>
                  <div className="min-w-0">
                    <p className={`text-sm font-medium font-body truncate ${card.is_active ? 'text-navy dark:text-slate-100' : 'text-navy/40 dark:text-slate-500'}`}>
                      {card.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-100 text-violet-700 capitalize">
                        {card.recurrence_pattern}
                      </span>
                      {card.recurrence_day !== null && (
                        <span className="text-[10px] text-navy/40 dark:text-slate-500 font-body">
                          {(card.recurrence_pattern === 'weekly' || card.recurrence_pattern === 'biweekly')
                            ? DAY_LABELS[card.recurrence_day]
                            : `Day ${card.recurrence_day}`
                          }
                        </span>
                      )}
                      <span className="text-[10px] text-navy/40 dark:text-slate-500 font-body">
                        at {card.recurrence_time}
                      </span>
                      {card.next_create_at && (
                        <span className="text-[10px] text-navy/30 dark:text-slate-600 font-body">
                          Next: {new Date(card.next_create_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleEdit(card)}
                    className="p-1.5 rounded-lg text-navy/30 dark:text-slate-600 hover:text-electric hover:bg-electric/5 transition-all"
                    title="Edit"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDelete(card.id)}
                    className="p-1.5 rounded-lg text-navy/30 dark:text-slate-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                    title="Delete"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
