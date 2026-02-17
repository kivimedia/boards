'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ClientEmailConfig, EmailTone } from '@/lib/types';

interface EmailConfigFormProps {
  clientId: string;
}

const CADENCE_OPTIONS: { value: NonNullable<ClientEmailConfig['update_cadence']>; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'monthly', label: 'Monthly' },
];

const TONE_OPTIONS: { value: EmailTone; label: string }[] = [
  { value: 'formal', label: 'Formal' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'casual', label: 'Casual' },
];

const DAY_OPTIONS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function EmailConfigForm({ clientId }: EmailConfigFormProps) {
  const [cadence, setCadence] = useState<ClientEmailConfig['update_cadence']>('weekly');
  const [sendDay, setSendDay] = useState('Monday');
  const [sendTime, setSendTime] = useState('09:00');
  const [tone, setTone] = useState<EmailTone>('friendly');
  const [recipientsText, setRecipientsText] = useState('');
  const [ccText, setCcText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/email-config`);
      if (!res.ok) throw new Error('Failed to load config');
      const json = await res.json();
      const config: ClientEmailConfig = json.data ?? {};

      setCadence(config.update_cadence ?? 'weekly');
      setSendDay(config.send_day ?? 'Monday');
      setSendTime(config.send_time ?? '09:00');
      setTone(config.tone ?? 'friendly');
      setRecipientsText((config.recipients ?? []).join(', '));
      setCcText((config.cc ?? []).join(', '));
    } catch {
      setError('Failed to load email configuration');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);

    const recipients = recipientsText
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);
    const cc = ccText
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);

    const config: ClientEmailConfig = {
      update_cadence: cadence,
      send_day: sendDay,
      send_time: sendTime,
      tone,
      recipients,
      cc,
    };

    try {
      const res = await fetch(`/api/clients/${clientId}/email-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to save configuration');
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface shadow-sm p-5">
        <div className="flex items-center justify-center py-8">
          <div className="flex items-center gap-3 text-navy/40 dark:text-slate-500">
            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-sm font-body">Loading configuration...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-navy/50">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-electric" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">Email Configuration</h3>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Error / Success */}
        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800 font-body">
            {error}
          </div>
        )}
        {success && (
          <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-sm text-green-800 font-body">
            Configuration saved successfully.
          </div>
        )}

        {/* Cadence */}
        <div>
          <label className="block text-xs font-semibold text-navy/60 dark:text-slate-400 uppercase tracking-wider font-heading mb-1.5">
            Update Cadence
          </label>
          <div className="flex gap-2">
            {CADENCE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setCadence(opt.value)}
                className={`
                  px-3 py-1.5 rounded-lg text-xs font-medium font-body border transition-all
                  ${cadence === opt.value
                    ? 'bg-electric text-white border-electric shadow-sm'
                    : 'bg-white dark:bg-dark-surface text-navy/60 dark:text-slate-400 border-cream-dark dark:border-slate-700 hover:border-electric/40 hover:text-navy dark:hover:text-slate-100'
                  }
                `}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Send Day and Time */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-navy/60 dark:text-slate-400 uppercase tracking-wider font-heading mb-1.5">
              Send Day
            </label>
            <select
              value={sendDay}
              onChange={(e) => setSendDay(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body"
            >
              {DAY_OPTIONS.map((day) => (
                <option key={day} value={day}>{day}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-navy/60 dark:text-slate-400 uppercase tracking-wider font-heading mb-1.5">
              Send Time
            </label>
            <input
              type="time"
              value={sendTime}
              onChange={(e) => setSendTime(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body"
            />
          </div>
        </div>

        {/* Tone */}
        <div>
          <label className="block text-xs font-semibold text-navy/60 dark:text-slate-400 uppercase tracking-wider font-heading mb-1.5">
            Default Tone
          </label>
          <div className="flex gap-2">
            {TONE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setTone(opt.value)}
                className={`
                  px-3 py-1.5 rounded-lg text-xs font-medium font-body border transition-all
                  ${tone === opt.value
                    ? 'bg-electric text-white border-electric shadow-sm'
                    : 'bg-white dark:bg-dark-surface text-navy/60 dark:text-slate-400 border-cream-dark dark:border-slate-700 hover:border-electric/40 hover:text-navy dark:hover:text-slate-100'
                  }
                `}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Recipients */}
        <div>
          <label className="block text-xs font-semibold text-navy/60 dark:text-slate-400 uppercase tracking-wider font-heading mb-1.5">
            Recipients
          </label>
          <input
            type="text"
            value={recipientsText}
            onChange={(e) => setRecipientsText(e.target.value)}
            placeholder="email@example.com, another@example.com"
            className="w-full p-2.5 rounded-xl bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:text-slate-600 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body"
          />
          <p className="text-xs text-navy/30 dark:text-slate-600 font-body mt-1">Separate multiple emails with commas</p>
        </div>

        {/* CC */}
        <div>
          <label className="block text-xs font-semibold text-navy/60 dark:text-slate-400 uppercase tracking-wider font-heading mb-1.5">
            CC
          </label>
          <input
            type="text"
            value={ccText}
            onChange={(e) => setCcText(e.target.value)}
            placeholder="cc@example.com"
            className="w-full p-2.5 rounded-xl bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:text-slate-600 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body"
          />
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-xl text-sm font-medium font-body bg-electric text-white hover:bg-electric/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>
    </div>
  );
}
