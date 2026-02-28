'use client';

import { useEffect, useState, useCallback } from 'react';
import type { SeoTeamConfig } from '@/lib/types';

interface ConfigForm {
  client_id: string;
  site_url: string;
  site_name: string;
  wp_username: string;
  wp_app_password: string;
  slack_bot_token: string;
  slack_channel_id: string;
  min_qc_score: number;
  max_iterations: number;
  posts_per_week: number;
  content_silos: string[];
}

const EMPTY_FORM: ConfigForm = {
  client_id: '',
  site_url: '',
  site_name: '',
  wp_username: '',
  wp_app_password: '',
  slack_bot_token: '',
  slack_channel_id: '',
  min_qc_score: 70,
  max_iterations: 3,
  posts_per_week: 2,
  content_silos: [],
};

export default function SeoSettings() {
  const [configs, setConfigs] = useState<SeoTeamConfig[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ConfigForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newSilo, setNewSilo] = useState('');
  const [suggestingSilos, setSuggestingSilos] = useState(false);
  const [suggestedSilos, setSuggestedSilos] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [configsRes, clientsRes] = await Promise.all([
        fetch('/api/seo/configs'),
        fetch('/api/clients?limit=100'),
      ]);
      if (configsRes.ok) {
        const data = await configsRes.json();
        setConfigs(data.data || []);
      }
      if (clientsRes.ok) {
        const data = await clientsRes.json();
        const list = data.data?.clients || data.data || [];
        setClients(list.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
      }
    } catch (err) {
      console.error('Failed to fetch settings data:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleEdit = (config: SeoTeamConfig) => {
    setEditingId(config.id);
    setForm({
      client_id: config.client_id || '',
      site_url: config.site_url,
      site_name: config.site_name,
      wp_username: config.wp_credentials?.username || '',
      wp_app_password: config.wp_credentials?.app_password || '',
      slack_bot_token: config.slack_credentials?.bot_token || '',
      slack_channel_id: config.slack_credentials?.channel_id || '',
      min_qc_score: config.config?.quality_thresholds?.min_qc_score || 70,
      max_iterations: config.config?.quality_thresholds?.max_iterations || 3,
      posts_per_week: config.config?.schedule?.posts_per_week || 2,
      content_silos: config.config?.content_targets || [],
    });
    setNewSilo('');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.site_url.trim() || !form.site_name.trim()) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        client_id: form.client_id || null,
        site_url: form.site_url.trim(),
        site_name: form.site_name.trim(),
        wp_credentials: form.wp_username ? {
          username: form.wp_username,
          app_password: form.wp_app_password,
        } : null,
        slack_credentials: form.slack_bot_token ? {
          bot_token: form.slack_bot_token,
          channel_id: form.slack_channel_id,
        } : null,
        config: {
          quality_thresholds: {
            min_qc_score: form.min_qc_score,
            max_iterations: form.max_iterations,
          },
          schedule: {
            posts_per_week: form.posts_per_week,
          },
          content_targets: form.content_silos,
        },
      };

      if (editingId) {
        payload.id = editingId;
      }

      const res = await fetch('/api/seo/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setShowForm(false);
        setForm(EMPTY_FORM);
        setEditingId(null);
        fetchData();
      }
    } catch (err) {
      console.error('Failed to save config:', err);
    }
    setSaving(false);
  };

  const handleSuggestSilos = async () => {
    if (!form.site_url.trim() || !form.site_name.trim()) return;
    setSuggestingSilos(true);
    setSuggestedSilos([]);
    try {
      const res = await fetch('/api/seo/configs/suggest-silos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_url: form.site_url.trim(),
          site_name: form.site_name.trim(),
          existing_silos: form.content_silos.length > 0 ? form.content_silos : undefined,
        }),
      });
      if (res.ok) {
        const { data } = await res.json();
        setSuggestedSilos(data?.silos || []);
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to get suggestions');
      }
    } catch {
      alert('Failed to get silo suggestions');
    }
    setSuggestingSilos(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <svg className="animate-spin h-6 w-6 text-electric" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy dark:text-white font-heading">SEO Team Settings</h1>
          <p className="text-sm text-navy/50 dark:text-slate-400 mt-1 font-body">
            Configure SEO pipeline per client site
          </p>
        </div>
        <button
          onClick={() => { setEditingId(null); setForm(EMPTY_FORM); setShowForm(true); }}
          className="px-4 py-2 text-sm font-semibold text-white bg-electric rounded-lg hover:bg-electric-dark transition-colors font-body"
        >
          + Add Site
        </button>
      </div>

      {/* Configs List */}
      {configs.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700">
          <p className="text-navy/40 dark:text-slate-500 font-body">No SEO sites configured yet</p>
          <p className="text-sm text-navy/30 dark:text-slate-600 mt-1 font-body">Add a site to start running SEO pipelines</p>
        </div>
      ) : (
        <div className="space-y-3">
          {configs.map(config => (
            <div key={config.id} className="bg-white dark:bg-dark-card rounded-xl p-5 border border-cream-dark dark:border-slate-700">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-bold text-navy dark:text-white font-heading">{config.site_name}</h3>
                  <p className="text-sm text-navy/50 dark:text-slate-400 font-body">
                    {config.site_url}
                    {config.client && <span className="ml-2 text-navy/40 dark:text-slate-500">- {config.client.name}</span>}
                  </p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-navy/40 dark:text-slate-500 font-body">
                    <span className={config.wp_credentials ? 'text-green-600' : 'text-navy/30'}>
                      {config.wp_credentials ? '✓ WordPress' : '✗ WordPress'}
                    </span>
                    <span className={config.slack_credentials ? 'text-green-600' : 'text-navy/30'}>
                      {config.slack_credentials ? '✓ Slack' : '✗ Slack'}
                    </span>
                    <span>{config.is_active ? '● Active' : '○ Inactive'}</span>
                  </div>
                  {config.config?.content_targets && config.config.content_targets.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {config.config.content_targets.map((silo, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-electric/10 text-electric dark:bg-electric/20 dark:text-blue-300 font-body">
                          {silo}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleEdit(config)}
                  className="px-3 py-1.5 text-xs font-medium text-electric bg-electric/10 rounded-lg hover:bg-electric/20 transition-colors font-body"
                >
                  Edit
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto py-8" onClick={() => setShowForm(false)}>
          <div className="bg-white dark:bg-dark-card rounded-xl p-6 w-full max-w-lg shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-navy dark:text-white mb-4 font-heading">
              {editingId ? 'Edit Site Config' : 'Add SEO Site'}
            </h2>
            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Basic Info */}
              <div>
                <label className="block text-xs font-semibold text-navy/60 dark:text-slate-300 mb-1 font-heading">Client (optional)</label>
                <select
                  value={form.client_id}
                  onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm font-body"
                >
                  <option value="">No client</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-navy/60 dark:text-slate-300 mb-1 font-heading">Site Name</label>
                  <input type="text" value={form.site_name} onChange={e => setForm(f => ({ ...f, site_name: e.target.value }))} placeholder="My Blog" className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm font-body" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-navy/60 dark:text-slate-300 mb-1 font-heading">Site URL</label>
                  <input type="url" value={form.site_url} onChange={e => setForm(f => ({ ...f, site_url: e.target.value }))} placeholder="https://example.com" className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm font-body" />
                </div>
              </div>

              {/* WordPress */}
              <div className="border-t border-cream-dark dark:border-slate-700 pt-4">
                <h3 className="text-sm font-semibold text-navy dark:text-white mb-2 font-heading">WordPress Credentials</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-navy/50 dark:text-slate-400 mb-1 font-body">Username</label>
                    <input type="text" value={form.wp_username} onChange={e => setForm(f => ({ ...f, wp_username: e.target.value }))} placeholder="admin" className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm font-body" />
                  </div>
                  <div>
                    <label className="block text-xs text-navy/50 dark:text-slate-400 mb-1 font-body">App Password</label>
                    <input type="password" value={form.wp_app_password} onChange={e => setForm(f => ({ ...f, wp_app_password: e.target.value }))} placeholder="xxxx xxxx xxxx" className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm font-body" />
                  </div>
                </div>
              </div>

              {/* Slack */}
              <div className="border-t border-cream-dark dark:border-slate-700 pt-4">
                <h3 className="text-sm font-semibold text-navy dark:text-white mb-2 font-heading">Slack Notifications</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-navy/50 dark:text-slate-400 mb-1 font-body">Bot Token</label>
                    <input type="password" value={form.slack_bot_token} onChange={e => setForm(f => ({ ...f, slack_bot_token: e.target.value }))} placeholder="xoxb-..." className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm font-body" />
                  </div>
                  <div>
                    <label className="block text-xs text-navy/50 dark:text-slate-400 mb-1 font-body">Channel ID</label>
                    <input type="text" value={form.slack_channel_id} onChange={e => setForm(f => ({ ...f, slack_channel_id: e.target.value }))} placeholder="C0123456789" className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm font-body" />
                  </div>
                </div>
              </div>

              {/* Content Silos */}
              <div className="border-t border-cream-dark dark:border-slate-700 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-navy dark:text-white font-heading">Content Silos</h3>
                  <button
                    type="button"
                    onClick={handleSuggestSilos}
                    disabled={suggestingSilos || !form.site_url.trim() || !form.site_name.trim()}
                    className="px-3 py-1.5 text-[11px] font-semibold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors disabled:opacity-40 font-body inline-flex items-center gap-1.5"
                  >
                    {suggestingSilos ? (
                      <>
                        <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Scanning site...
                      </>
                    ) : form.content_silos.length > 0 ? (
                      'Suggest more with AI'
                    ) : (
                      'Suggest with AI'
                    )}
                  </button>
                </div>
                {/* AI suggestions */}
                {suggestedSilos.length > 0 && (
                  <div className="mb-3 p-3 bg-purple-50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 font-heading">AI Suggestions - click to add</p>
                      <button
                        type="button"
                        onClick={() => {
                          const newOnes = suggestedSilos.filter(s => !form.content_silos.includes(s));
                          if (newOnes.length > 0) {
                            setForm(f => ({ ...f, content_silos: [...f.content_silos, ...newOnes] }));
                          }
                        }}
                        disabled={suggestedSilos.every(s => form.content_silos.includes(s))}
                        className="text-[11px] text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-200 font-medium font-body disabled:opacity-40"
                      >
                        Add all
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {suggestedSilos.map((silo, idx) => {
                        const alreadyAdded = form.content_silos.includes(silo);
                        return (
                          <button
                            key={idx}
                            type="button"
                            disabled={alreadyAdded}
                            onClick={() => {
                              if (!alreadyAdded) {
                                setForm(f => ({ ...f, content_silos: [...f.content_silos, silo] }));
                              }
                            }}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors font-body ${
                              alreadyAdded
                                ? 'bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400 cursor-default'
                                : 'bg-white dark:bg-dark-surface text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700 hover:bg-purple-100 dark:hover:bg-purple-900/30 cursor-pointer'
                            }`}
                          >
                            {alreadyAdded ? '✓ ' : '+ '}{silo}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {/* Existing silos */}
                {form.content_silos.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {form.content_silos.map((silo, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-electric/10 text-electric dark:bg-electric/20 dark:text-blue-300 font-body"
                      >
                        {silo}
                        <button
                          type="button"
                          onClick={() => setForm(f => ({ ...f, content_silos: f.content_silos.filter((_, i) => i !== idx) }))}
                          className="text-electric/60 hover:text-electric dark:text-blue-400 dark:hover:text-blue-200 ml-0.5"
                        >
                          x
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newSilo}
                    onChange={e => setNewSilo(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newSilo.trim()) {
                        e.preventDefault();
                        const val = newSilo.trim();
                        if (!form.content_silos.includes(val)) {
                          setForm(f => ({ ...f, content_silos: [...f.content_silos, val] }));
                        }
                        setNewSilo('');
                      }
                    }}
                    placeholder="Type a silo and press Enter"
                    className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm font-body"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const val = newSilo.trim();
                      if (val && !form.content_silos.includes(val)) {
                        setForm(f => ({ ...f, content_silos: [...f.content_silos, val] }));
                      }
                      setNewSilo('');
                    }}
                    disabled={!newSilo.trim()}
                    className="px-3 py-2 text-xs font-semibold text-electric bg-electric/10 rounded-lg hover:bg-electric/20 transition-colors disabled:opacity-40 font-body"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Quality */}
              <div className="border-t border-cream-dark dark:border-slate-700 pt-4">
                <h3 className="text-sm font-semibold text-navy dark:text-white mb-2 font-heading">Quality Settings</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-navy/50 dark:text-slate-400 mb-1 font-body">Min QC Score</label>
                    <input type="number" min={0} max={100} value={form.min_qc_score} onChange={e => setForm(f => ({ ...f, min_qc_score: parseInt(e.target.value) || 70 }))} className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm font-body" />
                  </div>
                  <div>
                    <label className="block text-xs text-navy/50 dark:text-slate-400 mb-1 font-body">Max Iterations</label>
                    <input type="number" min={1} max={10} value={form.max_iterations} onChange={e => setForm(f => ({ ...f, max_iterations: parseInt(e.target.value) || 3 }))} className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm font-body" />
                  </div>
                  <div>
                    <label className="block text-xs text-navy/50 dark:text-slate-400 mb-1 font-body">Posts/Week</label>
                    <input type="number" min={1} max={14} value={form.posts_per_week} onChange={e => setForm(f => ({ ...f, posts_per_week: parseInt(e.target.value) || 2 }))} className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm font-body" />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-cream-dark dark:border-slate-700">
              <button onClick={() => { setShowForm(false); setEditingId(null); }} className="px-4 py-2 text-sm text-navy/60 dark:text-slate-400 hover:text-navy dark:hover:text-white transition-colors font-body">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving || !form.site_url.trim() || !form.site_name.trim()} className="px-4 py-2 text-sm font-semibold text-white bg-electric rounded-lg hover:bg-electric-dark transition-colors disabled:opacity-50 font-body">
                {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
