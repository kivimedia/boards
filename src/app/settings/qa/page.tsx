'use client';

import { useState, useEffect, useCallback } from 'react';
import QATrendDashboard from '@/components/qa/QATrendDashboard';
import LinkCheckResults from '@/components/qa/LinkCheckResults';
import type { QAMonitoringConfig, QALinkCheck } from '@/lib/types';

interface QARunData {
  id: string;
  date: string;
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
  brokenLinks: number;
  totalLinks: number;
  wcagCompliance: number | null;
}

export default function QAMonitoringPage() {
  const [boards, setBoards] = useState<{ id: string; name: string }[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<string>('');
  const [configs, setConfigs] = useState<QAMonitoringConfig[]>([]);
  const [runs, setRuns] = useState<QARunData[]>([]);
  const [links, setLinks] = useState<QALinkCheck[]>([]);
  const [loadingConfigs, setLoadingConfigs] = useState(true);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New config form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newFrequency, setNewFrequency] = useState('daily');
  const [saving, setSaving] = useState(false);

  // Fetch boards
  useEffect(() => {
    async function loadBoards() {
      try {
        const res = await fetch('/api/boards');
        if (res.ok) {
          const json = await res.json();
          const list = (json.data ?? []).map((b: { id: string; name: string }) => ({
            id: b.id,
            name: b.name,
          }));
          setBoards(list);
          if (list.length > 0) setSelectedBoardId(list[0].id);
        }
      } catch { /* ignore */ }
    }
    loadBoards();
  }, []);

  // Fetch configs when board changes
  const fetchConfigs = useCallback(async () => {
    if (!selectedBoardId) return;
    setLoadingConfigs(true);
    setError(null);
    try {
      const res = await fetch(`/api/qa/monitoring-configs?board_id=${selectedBoardId}`);
      if (!res.ok) throw new Error('Failed to load configs');
      const json = await res.json();
      setConfigs(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load configs');
    } finally {
      setLoadingConfigs(false);
    }
  }, [selectedBoardId]);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  // Fetch runs for selected config - build from last_scores
  const fetchRuns = useCallback(async (configId: string) => {
    setLoadingRuns(true);
    try {
      const config = configs.find((c) => c.id === configId);
      if (config && config.last_scores && Object.keys(config.last_scores).length > 0) {
        const scores = config.last_scores;
        const runData: QARunData = {
          id: config.id,
          date: config.last_run_at ?? new Date().toISOString(),
          performance: scores.performance ?? 0,
          accessibility: scores.accessibility ?? 0,
          bestPractices: scores.bestPractices ?? scores['best-practices'] ?? 0,
          seo: scores.seo ?? 0,
          brokenLinks: scores.brokenLinks ?? 0,
          totalLinks: scores.totalLinks ?? 0,
          wcagCompliance: scores.wcagCompliance ?? null,
        };
        setRuns([runData]);
      } else {
        setRuns([]);
      }
    } catch { /* ignore */ }
    finally { setLoadingRuns(false); }
  }, [configs]);

  // Fetch link check results for a config
  const fetchLinks = useCallback(async (_configId: string) => {
    setLoadingLinks(true);
    try {
      // Link check results are stored in ai_qa_link_checks
      // For now, clear links until a dedicated API is built
      setLinks([]);
    } catch { /* ignore */ }
    finally { setLoadingLinks(false); }
  }, []);

  const handleConfigSelect = (configId: string) => {
    fetchRuns(configId);
    fetchLinks(configId);
  };

  const handleExport = () => {
    if (runs.length === 0) return;
    const headers = ['Date', 'Performance', 'Accessibility', 'Best Practices', 'SEO', 'Broken Links', 'Total Links'];
    const csvRows = runs.map((r) =>
      [r.date, r.performance, r.accessibility, r.bestPractices, r.seo, r.brokenLinks, r.totalLinks].join(',')
    );
    const csv = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'qa-trends.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleAddConfig = async () => {
    if (!newUrl.trim() || !selectedBoardId) return;
    setSaving(true);
    try {
      const res = await fetch('/api/qa/monitoring-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          board_id: selectedBoardId,
          url: newUrl.trim(),
          frequency: newFrequency,
        }),
      });
      if (!res.ok) throw new Error('Failed to create config');
      setNewUrl('');
      setShowAddForm(false);
      await fetchConfigs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create config');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (config: QAMonitoringConfig) => {
    try {
      await fetch('/api/qa/monitoring-configs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config_id: config.id,
          is_active: !config.is_active,
        }),
      });
      await fetchConfigs();
    } catch {
      setError('Failed to toggle config');
    }
  };

  return (
    <div className="min-h-screen bg-cream dark:bg-slate-900">
      {/* Header */}
      <div className="border-b border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface">
        <div className="max-w-6xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-navy dark:text-white font-heading">
                QA Monitoring
              </h1>
              <p className="text-sm text-navy/50 dark:text-slate-400 font-body mt-0.5">
                Track Lighthouse scores, link health, and WCAG compliance across your sites
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Board Selector */}
              {boards.length > 0 && (
                <select
                  value={selectedBoardId}
                  onChange={(e) => setSelectedBoardId(e.target.value)}
                  className="text-sm rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-slate-800 text-navy dark:text-white px-3 py-1.5"
                >
                  {boards.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              )}
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="px-4 py-1.5 text-sm font-medium rounded-lg bg-electric text-white hover:bg-electric-bright transition-colors"
              >
                + Add URL
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Add Config Form */}
        {showAddForm && (
          <div className="rounded-xl border-2 border-electric/20 dark:border-electric/30 bg-white dark:bg-dark-surface p-5">
            <h3 className="text-sm font-semibold text-navy dark:text-white font-heading mb-4">
              Add Monitoring URL
            </h3>
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 mb-1">URL</label>
                <input
                  type="url"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-slate-800 text-navy dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-electric/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 mb-1">Frequency</label>
                <select
                  value={newFrequency}
                  onChange={(e) => setNewFrequency(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-slate-800 text-navy dark:text-white text-sm"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <button
                onClick={handleAddConfig}
                disabled={saving || !newUrl.trim()}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-electric text-white hover:bg-electric-bright disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : 'Add'}
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 text-sm text-navy/50 dark:text-slate-400 hover:text-navy dark:hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Configs List */}
        {loadingConfigs ? (
          <div className="text-center py-12 text-sm text-navy/40 dark:text-slate-500">Loading configs...</div>
        ) : configs.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-navy/40 dark:text-slate-500">
              No monitoring URLs configured for this board.
            </p>
            <button
              onClick={() => setShowAddForm(true)}
              className="mt-3 px-4 py-2 text-sm font-medium rounded-lg bg-electric text-white hover:bg-electric-bright transition-colors"
            >
              Add Your First URL
            </button>
          </div>
        ) : (
          <>
            {/* Monitoring configs table */}
            <div className="rounded-xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-cream/50 dark:bg-slate-800/50">
                    <th className="px-4 py-3 text-left text-xs font-medium text-navy/50 dark:text-slate-400">URL</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-navy/50 dark:text-slate-400">Frequency</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-navy/50 dark:text-slate-400">Browsers</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-navy/50 dark:text-slate-400">Status</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-navy/50 dark:text-slate-400">Last Run</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-navy/50 dark:text-slate-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-dark dark:divide-slate-700">
                  {configs.map((config) => (
                    <tr key={config.id} className="hover:bg-cream/30 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-navy dark:text-white max-w-xs truncate">
                        {config.url.replace(/^https?:\/\//, '').slice(0, 50)}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-navy/60 dark:text-slate-400 capitalize">
                        {config.frequency}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-navy/60 dark:text-slate-400">
                        {config.browsers.join(', ')}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleToggleActive(config)}
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            config.is_active
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                          }`}
                        >
                          {config.is_active ? 'Active' : 'Paused'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-navy/60 dark:text-slate-400">
                        {config.last_run_at
                          ? new Date(config.last_run_at).toLocaleDateString()
                          : 'Never'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleConfigSelect(config.id)}
                          className="text-xs text-electric hover:text-electric-bright font-medium transition-colors"
                        >
                          View Results
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Trend Dashboard */}
            <div className="rounded-xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface p-5">
              <QATrendDashboard
                configs={configs}
                runs={runs}
                onConfigSelect={handleConfigSelect}
                onExport={handleExport}
              />
            </div>

            {/* Link Check Results */}
            {links.length > 0 && (
              <div className="rounded-xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface p-5">
                <h3 className="text-sm font-semibold text-navy dark:text-white font-heading mb-4">
                  Link Health Check
                </h3>
                <LinkCheckResults links={links} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
