'use client';

import { useState, useEffect, useCallback } from 'react';
import type { WhatsAppUser } from '@/lib/types';

export default function WhatsAppSettings() {
  const [waUser, setWaUser] = useState<WhatsAppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Local form state
  const [dndStart, setDndStart] = useState('');
  const [dndEnd, setDndEnd] = useState('');
  const [frequencyCap, setFrequencyCap] = useState(10);
  const [optOut, setOptOut] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/me');
      const json = await res.json();
      if (json.data) {
        const user = json.data as WhatsAppUser;
        setWaUser(user);
        setDndStart(user.dnd_start || '');
        setDndEnd(user.dnd_end || '');
        setFrequencyCap(user.frequency_cap_per_hour);
        setOptOut(user.opt_out);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleSave = async () => {
    setError(null);
    setSuccess(null);
    setSaving(true);

    try {
      const res = await fetch('/api/whatsapp/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dnd_start: dndStart || null,
          dnd_end: dndEnd || null,
          frequency_cap_per_hour: frequencyCap,
          opt_out: optOut,
        }),
      });

      const json = await res.json();

      if (json.error) {
        setError(json.error);
      } else if (json.data) {
        setWaUser(json.data);
        setSuccess('Settings saved successfully');
      }
    } catch {
      setError('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleUnlink = async () => {
    if (!confirm('Are you sure you want to unlink your WhatsApp number? You will stop receiving all WhatsApp notifications.')) {
      return;
    }

    try {
      await fetch('/api/whatsapp/me', { method: 'DELETE' });
      setWaUser(null);
      setDndStart('');
      setDndEnd('');
      setFrequencyCap(10);
      setOptOut(false);
      setSuccess('Phone number unlinked');
    } catch {
      setError('Failed to unlink phone number');
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-48 rounded-xl bg-cream-dark/40 dark:bg-slate-800/40" />
      </div>
    );
  }

  if (!waUser) {
    return (
      <div className="rounded-xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface p-5">
        <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading mb-2">Notification Settings</h3>
        <p className="text-xs text-navy/50 dark:text-slate-400 font-body">
          Link your phone number first to configure WhatsApp notification settings.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface p-5">
      <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading mb-4">Notification Settings</h3>

      {error && (
        <div className="mb-3 p-2 rounded-lg bg-red-50 border border-red-200">
          <p className="text-xs text-red-600 font-body">{error}</p>
        </div>
      )}
      {success && (
        <div className="mb-3 p-2 rounded-lg bg-green-50 border border-green-200">
          <p className="text-xs text-green-600 font-body">{success}</p>
        </div>
      )}

      <div className="space-y-5">
        {/* Opt-out toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-navy dark:text-slate-100 font-body">Opt Out</p>
            <p className="text-xs text-navy/50 dark:text-slate-400 font-body">Stop all WhatsApp notifications</p>
          </div>
          <button
            onClick={() => setOptOut(!optOut)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              optOut ? 'bg-red-500' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                optOut ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* DND Window */}
        <div>
          <p className="text-sm font-medium text-navy dark:text-slate-100 font-body mb-2">Do Not Disturb Window</p>
          <p className="text-xs text-navy/50 dark:text-slate-400 font-body mb-3">
            Notifications during this window will be suppressed.
          </p>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">Start</label>
              <input
                type="time"
                value={dndStart}
                onChange={(e) => setDndStart(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30"
              />
            </div>
            <span className="text-navy/40 dark:text-slate-500 mt-5">to</span>
            <div className="flex-1">
              <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">End</label>
              <input
                type="time"
                value={dndEnd}
                onChange={(e) => setDndEnd(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30"
              />
            </div>
          </div>
        </div>

        {/* Frequency Cap */}
        <div>
          <p className="text-sm font-medium text-navy dark:text-slate-100 font-body mb-2">
            Frequency Cap: <span className="text-electric">{frequencyCap}/hour</span>
          </p>
          <p className="text-xs text-navy/50 dark:text-slate-400 font-body mb-3">
            Maximum number of WhatsApp messages you can receive per hour.
          </p>
          <input
            type="range"
            min={1}
            max={50}
            value={frequencyCap}
            onChange={(e) => setFrequencyCap(parseInt(e.target.value, 10))}
            className="w-full accent-electric"
          />
          <div className="flex justify-between text-xs text-navy/40 dark:text-slate-500 font-body mt-1">
            <span>1</span>
            <span>25</span>
            <span>50</span>
          </div>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full px-4 py-2 rounded-lg text-xs font-medium font-body bg-electric text-white hover:bg-electric/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>

        {/* Unlink button */}
        <button
          onClick={handleUnlink}
          className="w-full px-4 py-2 rounded-lg text-xs font-medium font-body bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 transition-colors"
        >
          Unlink Phone Number
        </button>
      </div>
    </div>
  );
}
