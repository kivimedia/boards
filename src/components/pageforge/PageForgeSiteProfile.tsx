'use client';

import { useState, useEffect } from 'react';
import type { PageForgeSiteProfile as SiteProfile, PageForgeBuilderType } from '@/lib/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface PageForgeSiteProfileProps {
  siteId?: string; // If editing an existing site
  onSaved?: (site: SiteProfile) => void;
}

// ---------------------------------------------------------------------------
// Form state
// ---------------------------------------------------------------------------
interface FormState {
  site_name: string;
  site_url: string;
  wp_rest_url: string;
  wp_username: string;
  wp_app_password: string;
  wp_ssh_host: string;
  wp_ssh_user: string;
  wp_ssh_key_path: string;
  figma_personal_token: string;
  figma_team_id: string;
  page_builder: PageForgeBuilderType;
  vqa_pass_threshold: number;
  lighthouse_min_score: number;
  max_vqa_fix_loops: number;
  yoast_enabled: boolean;
}

const INITIAL_FORM: FormState = {
  site_name: '',
  site_url: '',
  wp_rest_url: '',
  wp_username: '',
  wp_app_password: '',
  wp_ssh_host: '',
  wp_ssh_user: '',
  wp_ssh_key_path: '',
  figma_personal_token: '',
  figma_team_id: '',
  page_builder: 'gutenberg',
  vqa_pass_threshold: 90,
  lighthouse_min_score: 80,
  max_vqa_fix_loops: 15,
  yoast_enabled: false,
};

const BUILDERS: { value: PageForgeBuilderType; label: string }[] = [
  { value: 'gutenberg', label: 'Gutenberg' },
  { value: 'divi5', label: 'Divi 5' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function PageForgeSiteProfile({ siteId, onSaved }: PageForgeSiteProfileProps) {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [loading, setLoading] = useState(!!siteId);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    details?: Record<string, boolean>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sshOpen, setSshOpen] = useState(false);

  // Load existing site
  useEffect(() => {
    if (!siteId) return;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/pageforge/sites`);
        const json = await res.json();
        const sites = (json.data ?? []) as SiteProfile[];
        const site = sites.find((s) => s.id === siteId);
        if (site) {
          setForm({
            site_name: site.site_name,
            site_url: site.site_url,
            wp_rest_url: site.wp_rest_url,
            wp_username: site.wp_username ?? '',
            wp_app_password: site.wp_app_password ?? '',
            wp_ssh_host: site.wp_ssh_host ?? '',
            wp_ssh_user: site.wp_ssh_user ?? '',
            wp_ssh_key_path: site.wp_ssh_key_path ?? '',
            figma_personal_token: site.figma_personal_token ?? '',
            figma_team_id: site.figma_team_id ?? '',
            page_builder: site.page_builder,
            vqa_pass_threshold: site.vqa_pass_threshold,
            lighthouse_min_score: site.lighthouse_min_score,
            max_vqa_fix_loops: site.max_vqa_fix_loops,
            yoast_enabled: site.yoast_enabled,
          });
          if (site.wp_ssh_host) setSshOpen(true);
        }
      } catch (err) {
        console.error('Failed to load site:', err);
        setError('Failed to load site profile');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [siteId]);

  // ------- Update helpers -------
  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // ------- Test connection -------
  const handleTestConnection = async () => {
    if (!siteId) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/pageforge/sites/${siteId}/test`, {
        method: 'POST',
      });
      const json = await res.json();
      setTestResult(json.data ?? { success: false, message: 'No response' });
    } catch (err) {
      console.error('Connection test error:', err);
      setTestResult({ success: false, message: 'Failed to test connection' });
    } finally {
      setTesting(false);
    }
  };

  // ------- Save -------
  const handleSave = async () => {
    if (!form.site_name || !form.site_url || !form.wp_rest_url) return;
    setSaving(true);
    setError(null);
    try {
      const url = siteId ? `/api/pageforge/sites/${siteId}` : '/api/pageforge/sites';
      const method = siteId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Save failed');
      const json = await res.json();
      if (onSaved && json.data) onSaved(json.data);
    } catch (err) {
      console.error('Save error:', err);
      setError('Failed to save site profile');
    } finally {
      setSaving(false);
    }
  };

  // ------- Loading -------
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
      <h1 className="text-xl font-bold text-navy dark:text-slate-100 font-heading">
        {siteId ? 'Edit Site Profile' : 'New Site Profile'}
      </h1>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Basic info */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-navy dark:text-slate-200">Site Details</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-navy/60 dark:text-slate-400 mb-1">
              Site Name
            </label>
            <input
              type="text"
              value={form.site_name}
              onChange={(e) => updateField('site_name', e.target.value)}
              placeholder="My WordPress Site"
              className="w-full rounded-lg border border-navy/10 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-navy dark:text-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-electric/40"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-navy/60 dark:text-slate-400 mb-1">
              Site URL
            </label>
            <input
              type="url"
              value={form.site_url}
              onChange={(e) => updateField('site_url', e.target.value)}
              placeholder="https://example.com"
              className="w-full rounded-lg border border-navy/10 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-navy dark:text-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-electric/40"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-navy/60 dark:text-slate-400 mb-1">
            WP REST API URL
          </label>
          <input
            type="url"
            value={form.wp_rest_url}
            onChange={(e) => updateField('wp_rest_url', e.target.value)}
            placeholder="https://example.com/wp-json/wp/v2"
            className="w-full rounded-lg border border-navy/10 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-navy dark:text-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-electric/40"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-navy/60 dark:text-slate-400 mb-1">
              WP Username
            </label>
            <input
              type="text"
              value={form.wp_username}
              onChange={(e) => updateField('wp_username', e.target.value)}
              placeholder="admin"
              className="w-full rounded-lg border border-navy/10 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-navy dark:text-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-electric/40"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-navy/60 dark:text-slate-400 mb-1">
              WP Application Password
            </label>
            <input
              type="password"
              value={form.wp_app_password}
              onChange={(e) => updateField('wp_app_password', e.target.value)}
              placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
              className="w-full rounded-lg border border-navy/10 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-navy dark:text-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-electric/40"
            />
          </div>
        </div>
      </div>

      {/* SSH fields (collapsible) */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 overflow-hidden">
        <button
          onClick={() => setSshOpen(!sshOpen)}
          className="w-full flex items-center justify-between px-5 py-3 text-left"
        >
          <span className="text-sm font-semibold text-navy dark:text-slate-200">
            SSH Configuration (optional)
          </span>
          <svg
            className={`w-4 h-4 text-navy/40 dark:text-slate-500 transition-transform ${sshOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {sshOpen && (
          <div className="px-5 pb-5 space-y-4 border-t border-navy/5 dark:border-slate-700 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-navy/60 dark:text-slate-400 mb-1">
                  SSH Host
                </label>
                <input
                  type="text"
                  value={form.wp_ssh_host}
                  onChange={(e) => updateField('wp_ssh_host', e.target.value)}
                  placeholder="example.com or 1.2.3.4"
                  className="w-full rounded-lg border border-navy/10 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-navy dark:text-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-electric/40"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-navy/60 dark:text-slate-400 mb-1">
                  SSH User
                </label>
                <input
                  type="text"
                  value={form.wp_ssh_user}
                  onChange={(e) => updateField('wp_ssh_user', e.target.value)}
                  placeholder="root"
                  className="w-full rounded-lg border border-navy/10 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-navy dark:text-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-electric/40"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-navy/60 dark:text-slate-400 mb-1">
                SSH Key Path
              </label>
              <input
                type="text"
                value={form.wp_ssh_key_path}
                onChange={(e) => updateField('wp_ssh_key_path', e.target.value)}
                placeholder="/home/user/.ssh/id_rsa"
                className="w-full rounded-lg border border-navy/10 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-navy dark:text-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-electric/40"
              />
            </div>
          </div>
        )}
      </div>

      {/* Builder selector */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-navy dark:text-slate-200">Page Builder</h2>
        <div className="flex gap-3">
          {BUILDERS.map((b) => (
            <label
              key={b.value}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                form.page_builder === b.value
                  ? 'border-electric bg-electric/5 dark:bg-electric/10'
                  : 'border-navy/10 dark:border-slate-600 hover:border-navy/20 dark:hover:border-slate-500'
              }`}
            >
              <input
                type="radio"
                name="page_builder"
                value={b.value}
                checked={form.page_builder === b.value}
                onChange={() => updateField('page_builder', b.value)}
                className="sr-only"
              />
              <div
                className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                  form.page_builder === b.value
                    ? 'border-electric'
                    : 'border-navy/20 dark:border-slate-600'
                }`}
              >
                {form.page_builder === b.value && (
                  <div className="w-2 h-2 rounded-full bg-electric" />
                )}
              </div>
              <span className="text-sm font-medium text-navy dark:text-slate-200">
                {b.label}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Quality thresholds */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 p-5 space-y-5">
        <h2 className="text-sm font-semibold text-navy dark:text-slate-200">Quality Thresholds</h2>

        {/* VQA threshold */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-navy/60 dark:text-slate-400">
              VQA Pass Threshold
            </label>
            <span className="text-sm font-bold text-electric">{form.vqa_pass_threshold}%</span>
          </div>
          <input
            type="range"
            min={80}
            max={100}
            value={form.vqa_pass_threshold}
            onChange={(e) => updateField('vqa_pass_threshold', Number(e.target.value))}
            className="w-full h-2 bg-navy/10 dark:bg-slate-700 rounded-full appearance-none cursor-pointer accent-electric"
          />
          <div className="flex justify-between text-[10px] text-navy/30 dark:text-slate-600 mt-1">
            <span>80%</span>
            <span>100%</span>
          </div>
        </div>

        {/* Lighthouse min */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-navy/60 dark:text-slate-400">
              Lighthouse Minimum Score
            </label>
            <span className="text-sm font-bold text-electric">{form.lighthouse_min_score}</span>
          </div>
          <input
            type="range"
            min={50}
            max={100}
            value={form.lighthouse_min_score}
            onChange={(e) => updateField('lighthouse_min_score', Number(e.target.value))}
            className="w-full h-2 bg-navy/10 dark:bg-slate-700 rounded-full appearance-none cursor-pointer accent-electric"
          />
          <div className="flex justify-between text-[10px] text-navy/30 dark:text-slate-600 mt-1">
            <span>50</span>
            <span>100</span>
          </div>
        </div>

        {/* Max VQA loops */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-navy/60 dark:text-slate-400">
              Max VQA Fix Loops
            </label>
            <span className="text-sm font-bold text-electric">{form.max_vqa_fix_loops}</span>
          </div>
          <input
            type="range"
            min={1}
            max={5}
            value={form.max_vqa_fix_loops}
            onChange={(e) => updateField('max_vqa_fix_loops', Number(e.target.value))}
            className="w-full h-2 bg-navy/10 dark:bg-slate-700 rounded-full appearance-none cursor-pointer accent-electric"
          />
          <div className="flex justify-between text-[10px] text-navy/30 dark:text-slate-600 mt-1">
            <span>1</span>
            <span>5</span>
          </div>
        </div>

        {/* Yoast toggle */}
        <div className="flex items-center justify-between pt-2">
          <div>
            <span className="text-sm font-medium text-navy dark:text-slate-200">Yoast SEO</span>
            <p className="text-xs text-navy/40 dark:text-slate-500 mt-0.5">
              Enable Yoast SEO fields and meta configuration
            </p>
          </div>
          <button
            type="button"
            onClick={() => updateField('yoast_enabled', !form.yoast_enabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              form.yoast_enabled ? 'bg-electric' : 'bg-navy/20 dark:bg-slate-600'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white transition-transform shadow ${
                form.yoast_enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Test Connection */}
      {siteId && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-navy dark:text-slate-200">
              Connection Test
            </h2>
            <button
              onClick={handleTestConnection}
              disabled={testing}
              className="px-4 py-1.5 text-xs font-semibold text-electric border border-electric rounded-lg hover:bg-electric/5 dark:hover:bg-electric/10 transition-colors disabled:opacity-50"
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
          </div>

          {testResult && (
            <div
              className={`rounded-lg px-4 py-3 border ${
                testResult.success
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
              }`}
            >
              <p
                className={`text-sm font-medium ${
                  testResult.success
                    ? 'text-green-700 dark:text-green-300'
                    : 'text-red-700 dark:text-red-300'
                }`}
              >
                {testResult.message}
              </p>
              {testResult.details && (
                <div className="mt-2 space-y-1">
                  {Object.entries(testResult.details).map(([key, ok]) => (
                    <div key={key} className="flex items-center gap-2 text-xs">
                      <span className={ok ? 'text-success' : 'text-danger'}>
                        {ok ? '  ' : '  '}
                      </span>
                      <span className="text-navy/60 dark:text-slate-400">
                        {key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <a
          href="/pageforge"
          className="px-4 py-2 text-sm font-semibold text-navy/60 dark:text-slate-400 hover:text-navy dark:hover:text-slate-200 transition-colors"
        >
          Cancel
        </a>
        <button
          onClick={handleSave}
          disabled={saving || !form.site_name || !form.site_url || !form.wp_rest_url}
          className="px-6 py-2 text-sm font-semibold text-white bg-electric hover:bg-electric-bright rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : siteId ? 'Update Profile' : 'Create Profile'}
        </button>
      </div>
    </div>
  );
}
