'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { SeoCalendarItem } from '@/lib/types';

interface Props {
  item: SeoCalendarItem;
  calendarId: string;
  silos: string[];
  onClose: () => void;
  onSaved: () => void;
}

export default function SeoCalendarItemEditor({ item, calendarId, silos, onClose, onSaved }: Props) {
  const [topic, setTopic] = useState(item.topic);
  const [silo, setSilo] = useState(item.silo || '');
  const [keywords, setKeywords] = useState<string[]>(item.keywords || []);
  const [keywordInput, setKeywordInput] = useState('');
  const [outlineNotes, setOutlineNotes] = useState(item.outline_notes || '');
  const [wordCount, setWordCount] = useState(item.target_word_count);
  const [scheduledDate, setScheduledDate] = useState(item.scheduled_date);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [launchingSingle, setLaunchingSingle] = useState(false);

  const isEditable = item.status === 'planned';
  const isLaunched = item.status === 'launched';
  const isSkipped = item.status === 'skipped';

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/seo/calendars/${calendarId}/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim(),
          silo: silo || null,
          keywords,
          outline_notes: outlineNotes || null,
          target_word_count: wordCount,
          scheduled_date: scheduledDate,
        }),
      });
      if (res.ok) onSaved();
    } catch (err) {
      console.error('Failed to save item:', err);
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirm('Delete this calendar item?')) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/seo/calendars/${calendarId}/items/${item.id}`, {
        method: 'DELETE',
      });
      if (res.ok) onSaved();
    } catch (err) {
      console.error('Failed to delete item:', err);
    }
    setDeleting(false);
  };

  const handleSkip = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/seo/calendars/${calendarId}/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'skipped' }),
      });
      if (res.ok) onSaved();
    } catch (err) {
      console.error('Failed to skip item:', err);
    }
    setSaving(false);
  };

  const handleUnskip = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/seo/calendars/${calendarId}/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'planned' }),
      });
      if (res.ok) onSaved();
    } catch (err) {
      console.error('Failed to unskip item:', err);
    }
    setSaving(false);
  };

  const handleLaunch = async () => {
    setLaunchingSingle(true);
    try {
      const res = await fetch(`/api/seo/calendars/${calendarId}/launch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_ids: [item.id] }),
      });
      if (res.ok) onSaved();
    } catch (err) {
      console.error('Failed to launch item:', err);
    }
    setLaunchingSingle(false);
  };

  const addKeyword = () => {
    const kw = keywordInput.trim();
    if (kw && !keywords.includes(kw)) {
      setKeywords(prev => [...prev, kw]);
      setKeywordInput('');
    }
  };

  const removeKeyword = (kw: string) => {
    setKeywords(prev => prev.filter(k => k !== kw));
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-end z-50" onClick={onClose}>
      <div
        className="w-full max-w-md h-full bg-white dark:bg-dark-card shadow-2xl overflow-y-auto animate-in slide-in-from-right"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-dark-card border-b border-cream-dark dark:border-slate-700 px-5 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold text-navy dark:text-white font-heading">
            {isLaunched ? 'Launched Item' : isSkipped ? 'Skipped Item' : 'Edit Item'}
          </h2>
          <button onClick={onClose} className="text-navy/40 dark:text-slate-500 hover:text-navy dark:hover:text-white text-xl leading-none">&times;</button>
        </div>

        <div className="p-5 space-y-5">
          {/* Status badge */}
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
              isLaunched ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
              isSkipped ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' :
              'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
            }`}>
              {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
            </span>
            {isLaunched && item.run_id && (
              <Link
                href={`/seo/${item.run_id}`}
                className="text-xs text-electric hover:underline font-body"
              >
                View Pipeline Run &rarr;
              </Link>
            )}
          </div>

          {/* Topic */}
          <div>
            <label className="block text-xs font-semibold text-navy/60 dark:text-slate-300 mb-1 font-heading">Topic</label>
            {isEditable ? (
              <input
                type="text"
                value={topic}
                onChange={e => setTopic(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 font-body"
              />
            ) : (
              <p className="text-sm text-navy dark:text-slate-100 font-body">{item.topic}</p>
            )}
          </div>

          {/* Silo */}
          <div>
            <label className="block text-xs font-semibold text-navy/60 dark:text-slate-300 mb-1 font-heading">Silo</label>
            {isEditable ? (
              <select
                value={silo}
                onChange={e => setSilo(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 font-body"
              >
                <option value="">None</option>
                {silos.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-navy dark:text-slate-100 font-body">{item.silo || 'None'}</p>
            )}
          </div>

          {/* Keywords */}
          <div>
            <label className="block text-xs font-semibold text-navy/60 dark:text-slate-300 mb-1 font-heading">Keywords</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {keywords.map(kw => (
                <span
                  key={kw}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-electric/10 text-electric dark:bg-electric/20 dark:text-blue-300 font-body"
                >
                  {kw}
                  {isEditable && (
                    <button onClick={() => removeKeyword(kw)} className="text-electric/60 hover:text-electric">&times;</button>
                  )}
                </span>
              ))}
              {keywords.length === 0 && <span className="text-xs text-navy/30 dark:text-slate-500 font-body">No keywords</span>}
            </div>
            {isEditable && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={keywordInput}
                  onChange={e => setKeywordInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } }}
                  placeholder="Add keyword..."
                  className="flex-1 px-3 py-1.5 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-xs text-navy dark:text-slate-100 font-body"
                />
                <button
                  onClick={addKeyword}
                  disabled={!keywordInput.trim()}
                  className="px-3 py-1.5 text-xs font-medium text-electric bg-electric/10 rounded-lg hover:bg-electric/20 transition-colors disabled:opacity-50 font-body"
                >
                  Add
                </button>
              </div>
            )}
          </div>

          {/* Outline notes */}
          <div>
            <label className="block text-xs font-semibold text-navy/60 dark:text-slate-300 mb-1 font-heading">Outline / Notes</label>
            {isEditable ? (
              <textarea
                value={outlineNotes}
                onChange={e => setOutlineNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 font-body resize-none"
              />
            ) : (
              <p className="text-sm text-navy dark:text-slate-100 font-body whitespace-pre-wrap">{item.outline_notes || 'None'}</p>
            )}
          </div>

          {/* Word count */}
          <div>
            <label className="block text-xs font-semibold text-navy/60 dark:text-slate-300 mb-1 font-heading">Target Word Count</label>
            {isEditable ? (
              <input
                type="number"
                value={wordCount}
                onChange={e => setWordCount(parseInt(e.target.value) || 1500)}
                min={500}
                max={5000}
                step={100}
                className="w-32 px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 font-body"
              />
            ) : (
              <p className="text-sm text-navy dark:text-slate-100 font-body">{item.target_word_count} words</p>
            )}
          </div>

          {/* Scheduled date */}
          <div>
            <label className="block text-xs font-semibold text-navy/60 dark:text-slate-300 mb-1 font-heading">Scheduled Date</label>
            {isEditable ? (
              <input
                type="date"
                value={scheduledDate}
                onChange={e => setScheduledDate(e.target.value)}
                className="px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 font-body"
              />
            ) : (
              <p className="text-sm text-navy dark:text-slate-100 font-body">
                {new Date(item.scheduled_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            )}
          </div>

          {/* Launched info */}
          {isLaunched && item.launched_at && (
            <div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg p-3">
              <p className="text-xs text-green-700 dark:text-green-300 font-body">
                Launched on {new Date(item.launched_at).toLocaleString()}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="border-t border-cream-dark dark:border-slate-700 pt-4 flex flex-wrap gap-2">
            {isEditable && (
              <>
                <button
                  onClick={handleSave}
                  disabled={saving || !topic.trim()}
                  className="px-4 py-2 text-sm font-semibold text-white bg-electric rounded-lg hover:bg-electric-dark transition-colors disabled:opacity-50 font-body"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  onClick={handleLaunch}
                  disabled={launchingSingle}
                  className="px-4 py-2 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 font-body"
                >
                  {launchingSingle ? 'Launching...' : 'Launch Now'}
                </button>
                <button
                  onClick={handleSkip}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-navy/60 dark:text-slate-400 bg-cream dark:bg-dark-surface rounded-lg hover:bg-cream-dark dark:hover:bg-slate-700 transition-colors font-body"
                >
                  Skip
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors font-body"
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              </>
            )}
            {isSkipped && (
              <button
                onClick={handleUnskip}
                disabled={saving}
                className="px-4 py-2 text-sm font-semibold text-electric bg-electric/10 rounded-lg hover:bg-electric/20 transition-colors disabled:opacity-50 font-body"
              >
                Restore to Planned
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-navy/60 dark:text-slate-400 hover:text-navy dark:hover:text-white transition-colors font-body ml-auto"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
