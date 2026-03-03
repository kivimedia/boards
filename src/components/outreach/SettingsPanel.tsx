'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import BudgetCapBar from './BudgetCapBar';

interface Settings {
  warmup_week: number;
  daily_send_limit: number;
  weekly_send_limit: number;
  budget_cap_usd: number;
  budget_alert_pct: number;
  shadow_mode: boolean;
  dry_run_mode: boolean;
  auto_generate_batches: boolean;
  pause_outreach: boolean;
  pause_reason: string | null;
  slack_webhook_url: string | null;
  auto_send_approved: boolean;
  min_delay_between_actions_ms: number;
  max_delay_between_actions_ms: number;
  enable_response_detection: boolean;
  response_check_interval_hours: number;
}

interface BrowserSession {
  id: string;
  linkedin_email: string | null;
  status: string;
  health_status: string;
  daily_actions_count: number;
  last_health_check_at: string | null;
  last_used_at: string | null;
}

export default function SettingsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [edited, setEdited] = useState<Partial<Settings>>({});
  const [browserSession, setBrowserSession] = useState<BrowserSession | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [stoppingEmergency, setStoppingEmergency] = useState(false);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/outreach/settings');
      const data = await res.json();
      if (res.ok) setSettings(data.data.settings);
    } finally {
      setLoading(false);
    }
  };

  const fetchBrowserSession = async () => {
    try {
      const res = await fetch('/api/outreach/browser-session');
      const data = await res.json();
      if (res.ok && data.data?.session) setBrowserSession(data.data.session);
    } catch { /* ignore */ }
  };

  const handleCheckHealth = async () => {
    setCheckingHealth(true);
    try {
      const res = await fetch('/api/outreach/browser-session/health', { method: 'POST' });
      const data = await res.json();
      if (data.data?.health) {
        setBrowserSession(prev => prev ? { ...prev, health_status: data.data.health, last_health_check_at: new Date().toISOString() } : prev);
      }
    } finally {
      setCheckingHealth(false);
    }
  };

  const handleEmergencyStop = async () => {
    if (!confirm('Emergency Stop: This will kill the browser and pause all outreach. Continue?')) return;
    setStoppingEmergency(true);
    try {
      await fetch('/api/outreach/emergency-stop', { method: 'POST' });
      fetchSettings();
      fetchBrowserSession();
    } finally {
      setStoppingEmergency(false);
    }
  };

  const handleCreateSession = async () => {
    const email = prompt('Enter your LinkedIn email:');
    if (!email) return;
    try {
      await fetch('/api/outreach/browser-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkedin_email: email, status: 'active' }),
      });
      fetchBrowserSession();
    } catch { /* ignore */ }
  };

  useEffect(() => { fetchSettings(); fetchBrowserSession(); }, []);

  const handleSave = async () => {
    if (Object.keys(edited).length === 0) return;
    setSaving(true);
    try {
      const res = await fetch('/api/outreach/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(edited),
      });
      const data = await res.json();
      if (res.ok) {
        setSettings(data.data.settings);
        setEdited({});
      }
    } finally {
      setSaving(false);
    }
  };

  const updateField = (key: keyof Settings, value: unknown) => {
    setEdited(prev => ({ ...prev, [key]: value }));
  };

  const currentValue = <K extends keyof Settings>(key: K): Settings[K] => {
    if (key in edited) return edited[key] as Settings[K];
    return settings?.[key] as Settings[K];
  };

  if (loading || !settings) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
      </div>
    );
  }

  const hasChanges = Object.keys(edited).length > 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/outreach" className="text-sm text-navy/40 dark:text-slate-500 hover:text-electric font-body transition-colors">
            Dashboard
          </Link>
          <span className="text-navy/20 dark:text-slate-700">/</span>
          <span className="text-sm font-semibold text-navy dark:text-white font-heading">Settings</span>
        </div>
        {hasChanges && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-xs font-semibold text-white bg-electric hover:bg-electric-bright rounded-lg disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Warm-up & Limits */}
        <div className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 p-5">
          <h3 className="text-xs font-semibold text-navy/60 dark:text-slate-400 uppercase font-heading mb-4">
            Warm-up & Limits
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-semibold text-navy/50 dark:text-slate-400 uppercase mb-1.5">
                Warm-up Week
              </label>
              <select
                value={currentValue('warmup_week')}
                onChange={(e) => updateField('warmup_week', parseInt(e.target.value))}
                className="w-full px-3 py-2 text-sm rounded-lg bg-cream dark:bg-dark-surface border border-navy/10 dark:border-slate-700 text-navy dark:text-white font-body"
              >
                {[1, 2, 3, 4, 5].map(w => (
                  <option key={w} value={w}>
                    Week {w} ({w === 1 ? '5' : w === 2 ? '10' : w === 3 ? '15' : w === 4 ? '20' : '25'}/day)
                  </option>
                ))}
              </select>
              <p className="text-[9px] text-navy/30 dark:text-slate-600 mt-1">
                Controls daily send limits for LinkedIn safety
              </p>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-navy/50 dark:text-slate-400 uppercase mb-1.5">
                Daily Send Limit
              </label>
              <input
                type="number"
                value={currentValue('daily_send_limit')}
                onChange={(e) => updateField('daily_send_limit', parseInt(e.target.value) || 0)}
                min={1}
                max={50}
                className="w-full px-3 py-2 text-sm rounded-lg bg-cream dark:bg-dark-surface border border-navy/10 dark:border-slate-700 text-navy dark:text-white font-body"
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-navy/50 dark:text-slate-400 uppercase mb-1.5">
                Weekly Send Limit
              </label>
              <input
                type="number"
                value={currentValue('weekly_send_limit')}
                onChange={(e) => updateField('weekly_send_limit', parseInt(e.target.value) || 0)}
                min={1}
                max={200}
                className="w-full px-3 py-2 text-sm rounded-lg bg-cream dark:bg-dark-surface border border-navy/10 dark:border-slate-700 text-navy dark:text-white font-body"
              />
            </div>
          </div>
        </div>

        {/* Budget */}
        <div className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 p-5">
          <h3 className="text-xs font-semibold text-navy/60 dark:text-slate-400 uppercase font-heading mb-4">
            Budget
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-semibold text-navy/50 dark:text-slate-400 uppercase mb-1.5">
                Monthly Budget Cap (USD)
              </label>
              <input
                type="number"
                value={currentValue('budget_cap_usd')}
                onChange={(e) => updateField('budget_cap_usd', parseFloat(e.target.value) || 0)}
                min={0}
                step={50}
                className="w-full px-3 py-2 text-sm rounded-lg bg-cream dark:bg-dark-surface border border-navy/10 dark:border-slate-700 text-navy dark:text-white font-body"
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-navy/50 dark:text-slate-400 uppercase mb-1.5">
                Budget Alert Threshold (%)
              </label>
              <input
                type="number"
                value={currentValue('budget_alert_pct')}
                onChange={(e) => updateField('budget_alert_pct', parseInt(e.target.value) || 80)}
                min={50}
                max={100}
                className="w-full px-3 py-2 text-sm rounded-lg bg-cream dark:bg-dark-surface border border-navy/10 dark:border-slate-700 text-navy dark:text-white font-body"
              />
              <p className="text-[9px] text-navy/30 dark:text-slate-600 mt-1">
                Warning shown when spend reaches this % of cap
              </p>
            </div>
          </div>
        </div>

        {/* Operation Modes */}
        <div className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 p-5">
          <h3 className="text-xs font-semibold text-navy/60 dark:text-slate-400 uppercase font-heading mb-4">
            Operation Modes
          </h3>
          <div className="space-y-3">
            <ToggleRow
              label="Shadow Mode"
              description="Agent runs but doesn't execute - you compare decisions"
              checked={currentValue('shadow_mode')}
              onChange={(v) => updateField('shadow_mode', v)}
            />
            <ToggleRow
              label="Dry Run Mode"
              description="Generate batches without marking as sendable"
              checked={currentValue('dry_run_mode')}
              onChange={(v) => updateField('dry_run_mode', v)}
            />
            <ToggleRow
              label="Auto-Generate Batches"
              description="Automatically generate daily batches at 9 AM EST"
              checked={currentValue('auto_generate_batches')}
              onChange={(v) => updateField('auto_generate_batches', v)}
            />
            <ToggleRow
              label="Pause Outreach"
              description={settings.pause_reason || 'Completely stop all outreach activity'}
              checked={currentValue('pause_outreach')}
              onChange={(v) => updateField('pause_outreach', v)}
              danger={currentValue('pause_outreach')}
            />
          </div>
        </div>

        {/* Notifications */}
        <div className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 p-5">
          <h3 className="text-xs font-semibold text-navy/60 dark:text-slate-400 uppercase font-heading mb-4">
            Notifications
          </h3>
          <div>
            <label className="block text-[10px] font-semibold text-navy/50 dark:text-slate-400 uppercase mb-1.5">
              Slack Webhook URL
            </label>
            <input
              type="url"
              value={currentValue('slack_webhook_url') || ''}
              onChange={(e) => updateField('slack_webhook_url', e.target.value || null)}
              placeholder="https://hooks.slack.com/services/..."
              className="w-full px-3 py-2 text-sm rounded-lg bg-cream dark:bg-dark-surface border border-navy/10 dark:border-slate-700 text-navy dark:text-white font-body placeholder:text-navy/20 dark:placeholder:text-slate-700"
            />
            <p className="text-[9px] text-navy/30 dark:text-slate-600 mt-1">
              Receive alerts for auto-pause events, budget warnings, and batch completions
            </p>
          </div>
        </div>

        {/* LinkedIn Browser Session */}
        <div className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 p-5">
          <h3 className="text-xs font-semibold text-navy/60 dark:text-slate-400 uppercase font-heading mb-4">
            LinkedIn Browser Session
          </h3>

          {browserSession ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${
                  browserSession.health_status === 'healthy' ? 'bg-green-500' :
                  browserSession.health_status === 'degraded' ? 'bg-amber-500' :
                  browserSession.health_status === 'logged_out' || browserSession.health_status === 'blocked' ? 'bg-red-500' :
                  'bg-gray-400'
                }`} />
                <span className="text-xs font-semibold text-navy dark:text-white font-heading capitalize">
                  {browserSession.health_status || 'Unknown'}
                </span>
                <span className="text-[10px] text-navy/30 dark:text-slate-600">
                  ({browserSession.status})
                </span>
              </div>

              {browserSession.linkedin_email && (
                <p className="text-[10px] text-navy/50 dark:text-slate-400 font-body">
                  Account: {browserSession.linkedin_email}
                </p>
              )}

              <p className="text-[10px] text-navy/40 dark:text-slate-500 font-body">
                Daily actions: {browserSession.daily_actions_count} | Last check: {browserSession.last_health_check_at ? new Date(browserSession.last_health_check_at).toLocaleTimeString() : 'Never'}
              </p>

              <div className="flex gap-2">
                <button
                  onClick={handleCheckHealth}
                  disabled={checkingHealth}
                  className="px-3 py-1.5 text-[10px] font-semibold bg-cream dark:bg-dark-surface text-navy dark:text-white border border-navy/10 dark:border-slate-700 rounded-lg hover:border-electric/30 transition-colors disabled:opacity-50"
                >
                  {checkingHealth ? 'Checking...' : 'Check Health'}
                </button>
                <button
                  onClick={handleEmergencyStop}
                  disabled={stoppingEmergency}
                  className="px-3 py-1.5 text-[10px] font-semibold bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50"
                >
                  {stoppingEmergency ? 'Stopping...' : 'Emergency Stop'}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-[10px] text-navy/40 dark:text-slate-500 font-body mb-3">No browser session configured</p>
              <button
                onClick={handleCreateSession}
                className="px-3 py-1.5 text-[10px] font-semibold bg-electric text-white rounded-lg hover:bg-electric-bright transition-colors"
              >
                Set Up Session
              </button>
              <p className="text-[9px] text-navy/30 dark:text-slate-600 mt-2">
                You'll need to log into LinkedIn on the VPS browser first
              </p>
            </div>
          )}
        </div>

        {/* Browser Automation */}
        <div className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 p-5">
          <h3 className="text-xs font-semibold text-navy/60 dark:text-slate-400 uppercase font-heading mb-4">
            Browser Automation
          </h3>
          <div className="space-y-3">
            <ToggleRow
              label="Auto-Send Approved Batches"
              description="Automatically send batches after approval"
              checked={currentValue('auto_send_approved')}
              onChange={(v) => updateField('auto_send_approved', v)}
            />
            <ToggleRow
              label="Response Detection"
              description="Periodically check for connection acceptances and replies"
              checked={currentValue('enable_response_detection')}
              onChange={(v) => updateField('enable_response_detection', v)}
            />
            <div>
              <label className="block text-[10px] font-semibold text-navy/50 dark:text-slate-400 uppercase mb-1.5">
                Min Delay Between Actions (seconds)
              </label>
              <input
                type="number"
                value={Math.round((currentValue('min_delay_between_actions_ms') || 45000) / 1000)}
                onChange={(e) => updateField('min_delay_between_actions_ms', (parseInt(e.target.value) || 45) * 1000)}
                min={30}
                max={300}
                className="w-full px-3 py-2 text-sm rounded-lg bg-cream dark:bg-dark-surface border border-navy/10 dark:border-slate-700 text-navy dark:text-white font-body"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-navy/50 dark:text-slate-400 uppercase mb-1.5">
                Max Delay Between Actions (seconds)
              </label>
              <input
                type="number"
                value={Math.round((currentValue('max_delay_between_actions_ms') || 120000) / 1000)}
                onChange={(e) => updateField('max_delay_between_actions_ms', (parseInt(e.target.value) || 120) * 1000)}
                min={60}
                max={600}
                className="w-full px-3 py-2 text-sm rounded-lg bg-cream dark:bg-dark-surface border border-navy/10 dark:border-slate-700 text-navy dark:text-white font-body"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-navy/50 dark:text-slate-400 uppercase mb-1.5">
                Response Check Interval (hours)
              </label>
              <select
                value={currentValue('response_check_interval_hours') || 4}
                onChange={(e) => updateField('response_check_interval_hours', parseInt(e.target.value))}
                className="w-full px-3 py-2 text-sm rounded-lg bg-cream dark:bg-dark-surface border border-navy/10 dark:border-slate-700 text-navy dark:text-white font-body"
              >
                {[2, 4, 6, 8, 12].map(h => (
                  <option key={h} value={h}>Every {h} hours</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  danger = false,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <p className={`text-xs font-semibold font-heading ${danger && checked ? 'text-red-600' : 'text-navy dark:text-white'}`}>
          {label}
        </p>
        <p className="text-[10px] text-navy/40 dark:text-slate-500 font-body">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors ${
          checked
            ? danger ? 'bg-red-500' : 'bg-electric'
            : 'bg-navy/15 dark:bg-slate-700'
        }`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}
