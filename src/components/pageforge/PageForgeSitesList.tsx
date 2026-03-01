'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { PageForgeSiteProfile, PageForgeBuilderType } from '@/lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isCredentialStale(createdAt: string): boolean {
  const diff = Date.now() - new Date(createdAt).getTime();
  return diff > 90 * 24 * 60 * 60 * 1000;
}

const BUILDER_LABELS: Record<string, string> = {
  gutenberg: 'Gutenberg',
  divi5: 'Divi 5',
};

const INPUT_CLS =
  'w-full rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 px-3 py-2 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric placeholder:text-navy/30 dark:placeholder:text-slate-500';

const BUILDERS: { value: PageForgeBuilderType; label: string }[] = [
  { value: 'gutenberg', label: 'Gutenberg' },
  { value: 'divi5', label: 'Divi 5' },
];

// ---------------------------------------------------------------------------
// Edit form state
// ---------------------------------------------------------------------------
interface EditForm {
  site_name: string;
  site_url: string;
  wp_rest_url: string;
  wp_username: string;
  wp_app_password: string;
  page_builder: PageForgeBuilderType;
  vqa_pass_threshold: number;
  lighthouse_min_score: number;
  max_vqa_fix_loops: number;
  yoast_enabled: boolean;
}

function siteToForm(s: PageForgeSiteProfile): EditForm {
  return {
    site_name: s.site_name,
    site_url: s.site_url,
    wp_rest_url: s.wp_rest_url,
    wp_username: s.wp_username ?? '',
    wp_app_password: s.wp_app_password ?? '',
    page_builder: s.page_builder,
    vqa_pass_threshold: s.vqa_pass_threshold,
    lighthouse_min_score: s.lighthouse_min_score,
    max_vqa_fix_loops: s.max_vqa_fix_loops,
    yoast_enabled: s.yoast_enabled,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function PageForgeSitesList() {
  const [sites, setSites] = useState<PageForgeSiteProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editing state
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ results: Record<string, { ok: boolean; message: string }>; allPassed: boolean } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Fetch sites
  const fetchSites = useCallback(async () => {
    try {
      const res = await fetch('/api/pageforge/sites');
      const json = await res.json();
      setSites(json.sites || []);
    } catch {
      setError('Failed to load sites');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSites(); }, [fetchSites]);

  // Start editing
  const startEdit = (site: PageForgeSiteProfile) => {
    setEditingSiteId(site.id);
    setEditForm(siteToForm(site));
    setTestResult(null);
  };

  // Cancel edit
  const cancelEdit = () => {
    setEditingSiteId(null);
    setEditForm(null);
    setTestResult(null);
  };

  // Save
  const handleSave = async () => {
    if (!editingSiteId || !editForm || !editForm.site_name || !editForm.site_url) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/pageforge/sites/${editingSiteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteName: editForm.site_name,
          siteUrl: editForm.site_url,
          wpRestUrl: editForm.wp_rest_url || `${editForm.site_url.replace(/\/+$/, '')}/wp-json`,
          wpUsername: editForm.wp_username || null,
          wpAppPassword: editForm.wp_app_password || null,
          pageBuilder: editForm.page_builder,
          vqaPassThreshold: editForm.vqa_pass_threshold,
          lighthouseMinScore: editForm.lighthouse_min_score,
          maxVqaFixLoops: editForm.max_vqa_fix_loops,
          yoastEnabled: editForm.yoast_enabled,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error || 'Save failed');
      }
      await fetchSites();
      cancelEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // Test connection
  const handleTest = async () => {
    if (!editingSiteId) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/pageforge/sites/${editingSiteId}/test`, { method: 'POST' });
      const json = await res.json();
      setTestResult(json);
    } catch {
      setTestResult({ results: {}, allPassed: false });
    } finally {
      setTesting(false);
    }
  };

  // Delete
  const handleDelete = async (id: string) => {
    if (!confirm('Delete this site profile? This cannot be undone.')) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/pageforge/sites/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      setSites((prev) => prev.filter((s) => s.id !== id));
      if (editingSiteId === id) cancelEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(null);
    }
  };

  // Update form helper
  const updateForm = <K extends keyof EditForm>(key: K, value: EditForm[K]) => {
    setEditForm((prev) => prev ? { ...prev, [key]: value } : prev);
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
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-navy dark:text-white font-heading">
            Site Profiles
          </h1>
          <p className="text-xs md:text-sm text-navy/50 dark:text-slate-400 mt-1 font-body">
            Manage WordPress sites connected to PageForge
          </p>
        </div>
        <Link
          href="/pageforge"
          className="shrink-0 px-4 py-2 text-sm font-semibold text-navy/60 dark:text-slate-400 hover:text-navy dark:hover:text-slate-200 transition-colors font-heading"
        >
          Back to PageForge
        </Link>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 text-lg leading-none">x</button>
        </div>
      )}

      {/* Sites List */}
      {sites.length === 0 ? (
        <div className="bg-white dark:bg-dark-surface rounded-xl border border-cream-dark dark:border-slate-700 p-10 text-center">
          <p className="text-sm text-navy/40 dark:text-slate-500 font-body">
            No site profiles yet. Create one from the{' '}
            <Link href="/pageforge" className="text-electric hover:underline">PageForge dashboard</Link>.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sites.map((site) => {
            const isEditing = editingSiteId === site.id;
            const stale = isCredentialStale(site.created_at);

            return (
              <div
                key={site.id}
                className={`bg-white dark:bg-dark-surface rounded-xl border transition-all ${
                  isEditing
                    ? 'border-electric ring-2 ring-electric/20'
                    : 'border-cream-dark dark:border-slate-700 hover:border-navy/20 dark:hover:border-slate-500'
                }`}
              >
                {/* Site summary row */}
                <div className="px-5 py-4 flex items-center gap-4">
                  {/* Icon */}
                  <div className="w-10 h-10 rounded-lg bg-electric/10 dark:bg-electric/20 flex items-center justify-center shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-electric"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-navy dark:text-slate-100 font-heading truncate">
                        {site.site_name}
                      </h3>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                        {BUILDER_LABELS[site.page_builder] || site.page_builder}
                      </span>
                      {stale && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                          Rotate Creds
                        </span>
                      )}
                      {site.client && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                          {site.client.name}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-navy/40 dark:text-slate-500 font-body mt-0.5 truncate">
                      {site.site_url}
                    </p>
                  </div>

                  {/* Badges */}
                  <div className="hidden sm:flex items-center gap-3 text-[10px] text-navy/40 dark:text-slate-500 shrink-0">
                    <span>VQA {site.vqa_pass_threshold}%</span>
                    <span>LH {site.lighthouse_min_score}</span>
                    {site.figma_personal_token && <span className="text-electric">Figma</span>}
                    {site.wp_username && <span className="text-green-600 dark:text-green-400">WP API</span>}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {isEditing ? (
                      <button
                        onClick={cancelEdit}
                        className="px-3 py-1.5 text-xs font-semibold text-navy/60 dark:text-slate-400 hover:text-navy dark:hover:text-slate-200 transition-colors font-heading"
                      >
                        Cancel
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => startEdit(site)}
                          className="px-3 py-1.5 text-xs font-semibold text-electric hover:text-electric-bright transition-colors font-heading"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(site.id)}
                          disabled={deleting === site.id}
                          className="px-3 py-1.5 text-xs font-semibold text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors font-heading disabled:opacity-50"
                        >
                          {deleting === site.id ? '...' : 'Delete'}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Expanded edit form */}
                {isEditing && editForm && (
                  <div className="border-t border-cream-dark dark:border-slate-700 px-5 py-5 space-y-5">
                    {/* Site Details */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-semibold text-navy/60 dark:text-slate-300 font-heading uppercase tracking-wider">
                        Site Details
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-navy/60 dark:text-slate-400 mb-1 font-heading">Site Name</label>
                          <input
                            type="text"
                            value={editForm.site_name}
                            onChange={(e) => updateForm('site_name', e.target.value)}
                            className={INPUT_CLS}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-navy/60 dark:text-slate-400 mb-1 font-heading">Site URL</label>
                          <input
                            type="text"
                            value={editForm.site_url}
                            onChange={(e) => {
                              const url = e.target.value;
                              const base = url.replace(/\/+$/, '');
                              updateForm('site_url', url);
                              updateForm('wp_rest_url', base ? `${base}/wp-json` : '');
                            }}
                            className={INPUT_CLS}
                          />
                          {editForm.wp_rest_url && (
                            <p className="text-[10px] text-navy/30 dark:text-slate-600 mt-1 font-body">REST API: {editForm.wp_rest_url}</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* WordPress API Access */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-semibold text-navy/60 dark:text-slate-300 font-heading uppercase tracking-wider">
                        WordPress API Access
                      </h4>
                      <p className="text-[10px] text-navy/40 dark:text-slate-500 font-body -mt-2">
                        PageForge uses Application Passwords to create and edit pages via the WP REST API.{' '}
                        <a href="https://wordpress.org/documentation/article/application-passwords/" target="_blank" rel="noopener noreferrer" className="text-electric hover:underline">
                          Learn more
                        </a>
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-navy/60 dark:text-slate-400 mb-1 font-heading">Username</label>
                          <input
                            type="text"
                            value={editForm.wp_username}
                            onChange={(e) => updateForm('wp_username', e.target.value)}
                            placeholder="WordPress username"
                            className={INPUT_CLS}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-navy/60 dark:text-slate-400 mb-1 font-heading">App Password</label>
                          <input
                            type="password"
                            value={editForm.wp_app_password}
                            onChange={(e) => updateForm('wp_app_password', e.target.value)}
                            placeholder="xxxx xxxx xxxx xxxx"
                            className={INPUT_CLS}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Page Builder */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-semibold text-navy/60 dark:text-slate-300 font-heading uppercase tracking-wider">
                        Page Builder
                      </h4>
                      <div className="flex gap-2">
                        {BUILDERS.map((b) => (
                          <label
                            key={b.value}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-colors text-sm ${
                              editForm.page_builder === b.value
                                ? 'border-electric bg-electric/5 dark:bg-electric/10 text-navy dark:text-slate-100 font-semibold'
                                : 'border-cream-dark dark:border-slate-700 text-navy/60 dark:text-slate-400 hover:border-navy/20'
                            }`}
                          >
                            <input
                              type="radio"
                              name="edit_page_builder"
                              value={b.value}
                              checked={editForm.page_builder === b.value}
                              onChange={() => updateForm('page_builder', b.value)}
                              className="sr-only"
                            />
                            {b.label}
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Quality Thresholds */}
                    <div className="space-y-4">
                      <h4 className="text-xs font-semibold text-navy/60 dark:text-slate-300 font-heading uppercase tracking-wider">
                        Quality Thresholds
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-semibold text-navy/60 dark:text-slate-400 font-heading">VQA Pass Score</label>
                            <span className="text-xs font-bold text-electric">{editForm.vqa_pass_threshold}%</span>
                          </div>
                          <p className="text-[10px] text-navy/30 dark:text-slate-600 font-body mb-1.5">Visual match threshold</p>
                          <input
                            type="range" min={80} max={100}
                            value={editForm.vqa_pass_threshold}
                            onChange={(e) => updateForm('vqa_pass_threshold', Number(e.target.value))}
                            className="w-full h-1.5 bg-navy/10 dark:bg-slate-700 rounded-full appearance-none cursor-pointer accent-electric"
                          />
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-semibold text-navy/60 dark:text-slate-400 font-heading">Lighthouse Min</label>
                            <span className="text-xs font-bold text-electric">{editForm.lighthouse_min_score}</span>
                          </div>
                          <p className="text-[10px] text-navy/30 dark:text-slate-600 font-body mb-1.5">Performance score floor</p>
                          <input
                            type="range" min={50} max={100}
                            value={editForm.lighthouse_min_score}
                            onChange={(e) => updateForm('lighthouse_min_score', Number(e.target.value))}
                            className="w-full h-1.5 bg-navy/10 dark:bg-slate-700 rounded-full appearance-none cursor-pointer accent-electric"
                          />
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-semibold text-navy/60 dark:text-slate-400 font-heading">Max Fix Loops</label>
                            <span className="text-xs font-bold text-electric">{editForm.max_vqa_fix_loops}</span>
                          </div>
                          <p className="text-[10px] text-navy/30 dark:text-slate-600 font-body mb-1.5">VQA retry attempts</p>
                          <input
                            type="range" min={1} max={5}
                            value={editForm.max_vqa_fix_loops}
                            onChange={(e) => updateForm('max_vqa_fix_loops', Number(e.target.value))}
                            className="w-full h-1.5 bg-navy/10 dark:bg-slate-700 rounded-full appearance-none cursor-pointer accent-electric"
                          />
                        </div>
                      </div>
                      {/* Yoast toggle */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-navy/60 dark:text-slate-400 font-heading">Yoast SEO</span>
                        <button
                          type="button"
                          onClick={() => updateForm('yoast_enabled', !editForm.yoast_enabled)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                            editForm.yoast_enabled ? 'bg-electric' : 'bg-navy/20 dark:bg-slate-600'
                          }`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform shadow ${
                            editForm.yoast_enabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
                          }`} />
                        </button>
                      </div>
                    </div>

                    {/* Test Connection */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <button
                        onClick={handleTest}
                        disabled={testing}
                        className="px-4 py-2 text-xs font-semibold text-electric border border-electric rounded-lg hover:bg-electric/5 dark:hover:bg-electric/10 transition-colors disabled:opacity-50 font-heading"
                      >
                        {testing ? 'Testing...' : 'Test Connection'}
                      </button>
                      {testResult && (
                        <div className="flex items-center gap-2">
                          {Object.entries(testResult.results).map(([key, val]) => (
                            <span
                              key={key}
                              className={`px-2 py-1 rounded text-[10px] font-semibold ${
                                val.ok
                                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                              }`}
                              title={val.message}
                            >
                              {key}: {val.ok ? 'OK' : 'FAIL'}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Save bar */}
                    <div className="flex items-center justify-end gap-3 pt-3 border-t border-cream-dark dark:border-slate-700">
                      <button
                        onClick={cancelEdit}
                        className="px-4 py-2 text-sm font-semibold text-navy/60 dark:text-slate-400 hover:text-navy dark:hover:text-slate-200 transition-colors font-heading"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={saving || !editForm.site_name || !editForm.site_url}
                        className="px-5 py-2 text-sm font-semibold text-white bg-electric hover:bg-electric-bright rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-heading"
                      >
                        {saving ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
