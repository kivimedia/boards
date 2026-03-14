'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export default function TeamPRSettingsPage() {
  const queryClient = useQueryClient();

  // VPS status
  const { data: vpsData, isLoading: vpsLoading } = useQuery({
    queryKey: ['pr-vps-status'],
    queryFn: async () => {
      const res = await fetch('/api/team-pr/settings/vps-status', { credentials: 'include' });
      const json = await res.json();
      return json.data;
    },
    refetchInterval: 30000,
  });

  // Config
  const { data: configData, isLoading: configLoading } = useQuery({
    queryKey: ['pr-config'],
    queryFn: async () => {
      const res = await fetch('/api/team-pr/settings', { credentials: 'include' });
      const json = await res.json();
      return json.data;
    },
  });

  const [maxOutlets, setMaxOutlets] = useState<number>(configData?.max_outlets ?? 50);
  const [relevanceThreshold, setRelevanceThreshold] = useState<number>(configData?.relevance_threshold ?? 0.5);
  const [qaThreshold, setQaThreshold] = useState<number>(configData?.qa_threshold ?? 0.6);
  const [verificationThreshold, setVerificationThreshold] = useState<number>(configData?.verification_threshold ?? 0.5);

  // Update when config loads
  const configLoaded = configData && !configLoading;

  const saveMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch('/api/team-pr/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to save');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pr-config'] }),
  });

  function handleSave() {
    saveMutation.mutate({
      max_outlets: maxOutlets,
      relevance_threshold: relevanceThreshold,
      qa_threshold: qaThreshold,
      verification_threshold: verificationThreshold,
    });
  }

  const vpsConnected = vpsData?.connected ?? false;
  const vpsUrl = vpsData?.url || 'Not configured';

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      <Link href="/team-pr" className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-navy dark:hover:text-white transition-colors -mb-4">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Back to Team PR
      </Link>
      <h1 className="text-2xl font-bold text-navy dark:text-white">Team PR Settings</h1>

      {/* VPS Connection */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-navy dark:text-white">VPS Connection</h2>
        <div className="p-4 rounded-xl border border-gray-500/20 bg-white dark:bg-[#141420]/50">
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-3 h-3 rounded-full ${vpsConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-gray-300">
              {vpsLoading ? 'Checking...' : vpsConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <div>
            <span className="text-xs text-gray-500">VPS URL</span>
            <p className="text-sm text-gray-300 font-mono">{vpsUrl}</p>
          </div>
        </div>
      </section>

      {/* Default Run Config */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-navy dark:text-white">Default Run Config</h2>
        <div className="p-4 rounded-xl border border-gray-500/20 bg-white dark:bg-[#141420]/50 space-y-5">
          {/* Max Outlets */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm text-gray-400">Max Outlets per Run</label>
              <span className="text-sm text-navy dark:text-white font-medium">{maxOutlets}</span>
            </div>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={maxOutlets}
              onChange={(e) => setMaxOutlets(Number(e.target.value))}
              className="w-full accent-purple-500"
            />
            <div className="flex justify-between text-[10px] text-gray-500">
              <span>10</span>
              <span>100</span>
            </div>
          </div>

          {/* Relevance Threshold */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm text-gray-400">Relevance Threshold</label>
              <span className="text-sm text-navy dark:text-white font-medium">{(relevanceThreshold * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={relevanceThreshold}
              onChange={(e) => setRelevanceThreshold(Number(e.target.value))}
              className="w-full accent-purple-500"
            />
            <div className="flex justify-between text-[10px] text-gray-500">
              <span>10%</span>
              <span>100%</span>
            </div>
          </div>

          {/* Verification Threshold */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm text-gray-400">Verification Threshold</label>
              <span className="text-sm text-navy dark:text-white font-medium">{(verificationThreshold * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={verificationThreshold}
              onChange={(e) => setVerificationThreshold(Number(e.target.value))}
              className="w-full accent-purple-500"
            />
            <div className="flex justify-between text-[10px] text-gray-500">
              <span>10%</span>
              <span>100%</span>
            </div>
          </div>

          {/* QA Threshold */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm text-gray-400">QA Threshold</label>
              <span className="text-sm text-navy dark:text-white font-medium">{(qaThreshold * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={qaThreshold}
              onChange={(e) => setQaThreshold(Number(e.target.value))}
              className="w-full accent-purple-500"
            />
            <div className="flex justify-between text-[10px] text-gray-500">
              <span>10%</span>
              <span>100%</span>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            {saveMutation.isPending ? 'Saving...' : 'Save Config'}
          </button>
          {saveMutation.isSuccess && <span className="ml-3 text-sm text-green-400">Saved!</span>}
        </div>
      </section>

      {/* API Keys */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-navy dark:text-white">API Keys</h2>
        <div className="p-4 rounded-xl border border-gray-500/20 bg-white dark:bg-[#141420]/50 space-y-4">
          <p className="text-xs text-gray-500">API keys are managed via environment variables. These are displayed read-only for reference.</p>
          {[
            { name: 'Hunter.io', envVar: 'HUNTER_API_KEY' },
            { name: 'Tavily', envVar: 'TAVILY_API_KEY' },
            { name: 'YouTube Data API', envVar: 'YOUTUBE_DATA_API_KEY' },
          ].map((key) => (
            <div key={key.envVar} className="flex items-center justify-between p-3 rounded-lg bg-gray-500/5 border border-gray-500/10">
              <div>
                <p className="text-sm text-navy dark:text-white">{key.name}</p>
                <p className="text-xs text-gray-500 font-mono">{key.envVar}</p>
              </div>
              <span className="text-xs text-gray-400 font-mono tracking-wider">
                ********
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
