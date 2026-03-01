'use client';

import { useState, useEffect, useCallback } from 'react';
import type { PageForgeSiteProfile } from '@/lib/types';

/**
 * PageForge Figma configuration section for the Settings > Integrations page.
 * Allows users to manage Figma personal tokens and team IDs per site profile.
 */
export default function PageForgeFigmaConfig() {
  const [sites, setSites] = useState<PageForgeSiteProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [teamId, setTeamId] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  const fetchSites = useCallback(async () => {
    try {
      const res = await fetch('/api/pageforge/sites');
      const json = await res.json();
      setSites(json.sites || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSites(); }, [fetchSites]);

  const startEdit = (site: PageForgeSiteProfile) => {
    setEditingSiteId(site.id);
    setToken(site.figma_personal_token || '');
    setTeamId(site.figma_team_id || '');
    setSavedId(null);
  };

  const cancelEdit = () => {
    setEditingSiteId(null);
    setToken('');
    setTeamId('');
  };

  const handleSave = async () => {
    if (!editingSiteId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/pageforge/sites/${editingSiteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          figmaPersonalToken: token || null,
          figmaTeamId: teamId || null,
        }),
      });
      if (res.ok) {
        setSavedId(editingSiteId);
        await fetchSites();
        setTimeout(() => setSavedId(null), 2000);
        cancelEdit();
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse h-20 rounded-xl bg-cream-dark/40 dark:bg-slate-800/40" />
    );
  }

  if (sites.length === 0) return null;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading mb-1">
          PageForge - Figma Access
        </h3>
        <p className="text-xs text-navy/50 dark:text-slate-400 font-body">
          Configure Figma API credentials for each PageForge site profile. These are used to fetch design files for builds.
        </p>
      </div>

      <div className="space-y-3">
        {sites.map((site) => {
          const isEditing = editingSiteId === site.id;
          const hasFigma = !!site.figma_personal_token;
          const justSaved = savedId === site.id;

          return (
            <div
              key={site.id}
              className={`rounded-xl border bg-white dark:bg-dark-surface p-4 transition-all ${
                isEditing
                  ? 'border-electric ring-2 ring-electric/20'
                  : 'border-cream-dark dark:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300 flex items-center justify-center font-mono text-sm font-bold">
                    F
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">
                      {site.site_name}
                    </h4>
                    <p className="text-xs text-navy/50 dark:text-slate-400 font-body">
                      {hasFigma ? (
                        <span className="text-green-600 dark:text-green-400">Figma connected</span>
                      ) : (
                        <span className="text-navy/30 dark:text-slate-600">No Figma token</span>
                      )}
                      {site.figma_team_id && (
                        <span className="ml-2 text-navy/30 dark:text-slate-600">Team: {site.figma_team_id}</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {justSaved && (
                    <span className="text-xs text-green-600 dark:text-green-400 font-semibold">Saved</span>
                  )}
                  {!isEditing && (
                    <button
                      onClick={() => startEdit(site)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium font-body bg-cream-dark dark:bg-slate-800 hover:bg-cream-dark/80 dark:hover:bg-slate-700 text-navy/60 dark:text-slate-400 transition-colors"
                    >
                      {hasFigma ? 'Edit' : 'Configure'}
                    </button>
                  )}
                </div>
              </div>

              {isEditing && (
                <div className="mt-4 space-y-3 border-t border-cream-dark dark:border-slate-700 pt-4">
                  <div>
                    <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">
                      Personal Access Token
                    </label>
                    <input
                      type="password"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder="figd_..."
                      className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30"
                    />
                    <p className="text-[10px] text-navy/30 dark:text-slate-600 mt-1 font-body">
                      <a href="https://www.figma.com/developers/api#access-tokens" target="_blank" rel="noopener noreferrer" className="text-electric hover:underline">
                        Generate token
                      </a>{' '}
                      in Figma Settings &gt; Personal access tokens
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">
                      Team ID
                    </label>
                    <input
                      type="text"
                      value={teamId}
                      onChange={(e) => setTeamId(e.target.value)}
                      placeholder="12345678"
                      className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30"
                    />
                    <p className="text-[10px] text-navy/30 dark:text-slate-600 mt-1 font-body">
                      From your team URL: figma.com/files/team/<strong>TEAM_ID</strong>/...
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="px-4 py-2 rounded-lg text-xs font-medium font-body bg-electric text-white hover:bg-electric/90 transition-colors disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="px-4 py-2 rounded-lg text-xs font-medium font-body bg-cream-dark dark:bg-slate-800 text-navy/60 dark:text-slate-400 hover:bg-cream-dark/80 dark:hover:bg-slate-700 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
