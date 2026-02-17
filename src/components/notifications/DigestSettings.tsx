'use client';

import { useState, useEffect } from 'react';

interface DigestFormData {
  frequency: 'daily' | 'weekly';
  send_time: string;
  include_assigned: boolean;
  include_overdue: boolean;
  include_mentions: boolean;
  include_completed: boolean;
}

const DEFAULT_CONFIG: DigestFormData = {
  frequency: 'daily',
  send_time: '08:00',
  include_assigned: true,
  include_overdue: true,
  include_mentions: true,
  include_completed: false,
};

export default function DigestSettings() {
  const [config, setConfig] = useState<DigestFormData>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const fetchConfig = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/digest/config');
        const json = await res.json();
        if (json.data) {
          setConfig({
            frequency: json.data.frequency || 'daily',
            send_time: json.data.send_time || '08:00',
            include_assigned: json.data.include_assigned ?? true,
            include_overdue: json.data.include_overdue ?? true,
            include_mentions: json.data.include_mentions ?? true,
            include_completed: json.data.include_completed ?? false,
          });
        }
      } catch (err) {
        console.error('Failed to fetch digest config:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await fetch('/api/digest/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Failed to save digest config:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleCheckbox = (field: keyof DigestFormData) => {
    setConfig((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-electric border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-navy-light rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-6">
      <h3 className="text-base font-heading font-semibold text-navy dark:text-white mb-1">
        Email Digest
      </h3>
      <p className="text-sm text-navy/50 dark:text-white/50 mb-6">
        Configure how often you receive summary emails about your tasks.
      </p>

      <div className="space-y-5">
        {/* Frequency */}
        <div>
          <label className="block text-sm font-medium text-navy dark:text-white mb-1.5">
            Frequency
          </label>
          <select
            value={config.frequency}
            onChange={(e) => setConfig((prev) => ({ ...prev, frequency: e.target.value as 'daily' | 'weekly' }))}
            className="w-full max-w-xs text-sm bg-cream dark:bg-navy border-2 border-cream-dark dark:border-slate-700 rounded-xl px-3 py-2 text-navy dark:text-white focus:outline-none focus:border-electric transition-colors"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>

        {/* Send time */}
        <div>
          <label className="block text-sm font-medium text-navy dark:text-white mb-1.5">
            Send Time
          </label>
          <input
            type="time"
            value={config.send_time}
            onChange={(e) => setConfig((prev) => ({ ...prev, send_time: e.target.value }))}
            className="w-full max-w-xs text-sm bg-cream dark:bg-navy border-2 border-cream-dark dark:border-slate-700 rounded-xl px-3 py-2 text-navy dark:text-white focus:outline-none focus:border-electric transition-colors"
          />
        </div>

        {/* Include checkboxes */}
        <fieldset>
          <legend className="text-sm font-medium text-navy dark:text-white mb-3">
            Include in digest
          </legend>
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={config.include_assigned}
                onChange={() => handleCheckbox('include_assigned')}
                className="w-4 h-4 rounded border-cream-dark text-electric focus:ring-electric"
              />
              <span className="text-sm text-navy/70 dark:text-white/70">Assigned cards</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={config.include_overdue}
                onChange={() => handleCheckbox('include_overdue')}
                className="w-4 h-4 rounded border-cream-dark text-electric focus:ring-electric"
              />
              <span className="text-sm text-navy/70 dark:text-white/70">Overdue cards</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={config.include_mentions}
                onChange={() => handleCheckbox('include_mentions')}
                className="w-4 h-4 rounded border-cream-dark text-electric focus:ring-electric"
              />
              <span className="text-sm text-navy/70 dark:text-white/70">Mentions</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={config.include_completed}
                onChange={() => handleCheckbox('include_completed')}
                className="w-4 h-4 rounded border-cream-dark text-electric focus:ring-electric"
              />
              <span className="text-sm text-navy/70 dark:text-white/70">Completed cards</span>
            </label>
          </div>
        </fieldset>
      </div>

      {/* Save button */}
      <div className="flex items-center gap-3 mt-8">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 bg-electric text-white text-sm font-medium rounded-xl hover:bg-electric/90 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
        {saved && (
          <span className="text-sm text-success font-medium">Settings saved</span>
        )}
      </div>
    </div>
  );
}
