'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import type { AgentSkill, AgentQualityTier } from '@/lib/types';
import { useVpsAgentJob } from '@/hooks/useVpsAgentJob';
import VpsJobProgress from '@/components/agents/VpsJobProgress';
import { AVAILABLE_MODELS } from '@/lib/ai/pageforge-constants';
import TeamsPanel from '@/components/teams/TeamsPanel';

const TIER_CONFIG: Record<AgentQualityTier, { label: string; color: string; bg: string; emoji: string }> = {
  genuinely_smart: { label: 'Smart', color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30', emoji: '' },
  solid: { label: 'Solid', color: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30', emoji: '' },
  has_potential: { label: 'Potential', color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/30', emoji: '' },
  placeholder: { label: 'Placeholder', color: 'text-red-700 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30', emoji: '' },
  tool_dependent: { label: 'Tool Dep.', color: 'text-gray-700 dark:text-gray-400', bg: 'bg-gray-100 dark:bg-gray-800', emoji: '' },
};

const CATEGORY_CONFIG: Record<string, { label: string; icon: string }> = {
  content: { label: 'Content', icon: '' },
  creative: { label: 'Creative', icon: '' },
  strategy: { label: 'Strategy', icon: '' },
  seo: { label: 'SEO', icon: '' },
  ads: { label: 'Ads', icon: '' },
  meta: { label: 'Meta', icon: '' },
};

export default function AgentsDashboard({ defaultTab = 'standalone' }: { defaultTab?: 'standalone' | 'teams' | 'dashboards' }) {
  const [activeTab, setActiveTab] = useState<'standalone' | 'teams' | 'dashboards'>(defaultTab);
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSkill, setSelectedSkill] = useState<AgentSkill | null>(null);
  const [prompt, setPrompt] = useState('');
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [boards, setBoards] = useState<{ id: string; name: string }[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState('');
  const [toolCalls, setToolCalls] = useState<{ name: string; input: Record<string, unknown>; result?: string; success?: boolean; status: string }[]>([]);
  const [confirmation, setConfirmation] = useState<{ tool_call_id: string; name: string; input: Record<string, unknown>; message: string } | null>(null);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [useVps, setUseVps] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const vpsState = useVpsAgentJob();
  const [savingModel, setSavingModel] = useState(false);

  useEffect(() => {
    fetchSkills();
    fetchBoards();
  }, []);

  const fetchSkills = async () => {
    try {
      const res = await fetch('/api/agents/skills?is_active=true');
      const json = await res.json();
      setSkills(json.data ?? []);
    } catch (err) {
      console.error('Failed to fetch skills:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchBoards = async () => {
    try {
      const res = await fetch('/api/boards');
      const json = await res.json();
      setBoards((json.data ?? []).map((b: any) => ({ id: b.id, name: b.name })));
    } catch {}
  };

  const handleModelChange = async (skillId: string, modelId: string) => {
    setSavingModel(true);
    try {
      const res = await fetch(`/api/agents/skills/${skillId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_override: modelId || null,
        }),
      });
      if (res.ok) {
        // Update local state
        setSkills(prev => prev.map(s =>
          s.id === skillId ? { ...s, model_override: modelId || null } : s
        ));
        if (selectedSkill?.id === skillId) {
          setSelectedSkill(prev => prev ? { ...prev, model_override: modelId || null } : null);
        }
      }
    } catch {}
    setSavingModel(false);
  };

  const runAgent = async () => {
    if (!selectedSkill || !prompt.trim()) return;

    // VPS path: create background job and let VpsJobProgress handle the rest
    if (useVps) {
      setRunning(true);
      setOutput('');
      setError(null);
      const jobId = await vpsState.startJob({
        skill_id: selectedSkill.id,
        input_message: prompt.trim(),
        board_id: selectedBoardId || undefined,
      });
      if (!jobId) {
        setError('Failed to start VPS job');
      }
      setRunning(false);
      return;
    }

    setRunning(true);
    setOutput('');
    setError(null);
    setToolCalls([]);
    setConfirmation(null);

    try {
      const res = await fetch('/api/agents/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skill_id: selectedSkill.id,
          input_message: prompt.trim(),
          board_id: selectedBoardId || undefined,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({ error: 'Run failed' }));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }

      // Handle SSE stream
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = '';
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (currentEvent === 'token' && data.text) {
                accumulated += data.text;
                setOutput(accumulated);
                if (outputRef.current) {
                  outputRef.current.scrollTop = outputRef.current.scrollHeight;
                }
              } else if (currentEvent === 'tool_call') {
                setToolCalls(prev => [...prev, { name: data.name, input: data.input, status: 'running' }]);
              } else if (currentEvent === 'tool_result') {
                setToolCalls(prev => {
                  const copy = [...prev];
                  const last = copy.findIndex(tc => tc.name === data.name && tc.status === 'running');
                  if (last >= 0) copy[last] = { ...copy[last], result: data.result, success: data.success, status: data.success ? 'completed' : 'failed' };
                  return copy;
                });
              } else if (currentEvent === 'thinking') {
                // Show brief thinking indicator - already handled by tool_call for 'think'
              } else if (currentEvent === 'confirm') {
                setConfirmation({ tool_call_id: data.tool_call_id, name: data.name, input: data.input, message: data.message });
                setExecutionId(data.execution_id || null);
              } else if (currentEvent === 'chain_step') {
                // Chain steps are informational
              } else if (currentEvent === 'complete') {
                // done
              } else if (currentEvent === 'error' && data.error) {
                setError(data.error);
              }
            } catch {}
          }
        }
      }

      if (!accumulated && !error) {
        setOutput('Agent completed. Check the output above.');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  const filteredSkills = skills
    .filter((s) => {
      if (s.is_team_member) return false;
      if (filterCategory !== 'all' && s.category !== filterCategory) return false;
      if (searchQuery && !s.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => a.sort_order - b.sort_order);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Tabs + Navigation */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex items-center bg-cream dark:bg-dark-surface rounded-lg p-0.5 border border-navy/5 dark:border-slate-700">
          <button
            onClick={() => setActiveTab('standalone')}
            className={`px-4 py-2 text-sm font-semibold rounded-md transition-all ${
              activeTab === 'standalone'
                ? 'bg-white dark:bg-slate-800 text-navy dark:text-white shadow-sm'
                : 'text-navy/50 dark:text-slate-400 hover:text-navy dark:hover:text-slate-200'
            }`}
          >
            Standalone Agents
          </button>
          <button
            onClick={() => setActiveTab('teams')}
            className={`px-4 py-2 text-sm font-semibold rounded-md transition-all ${
              activeTab === 'teams'
                ? 'bg-white dark:bg-slate-800 text-navy dark:text-white shadow-sm'
                : 'text-navy/50 dark:text-slate-400 hover:text-navy dark:hover:text-slate-200'
            }`}
          >
            Teams
          </button>
          <button
            onClick={() => setActiveTab('dashboards')}
            className={`px-4 py-2 text-sm font-semibold rounded-md transition-all ${
              activeTab === 'dashboards'
                ? 'bg-white dark:bg-slate-800 text-navy dark:text-white shadow-sm'
                : 'text-navy/50 dark:text-slate-400 hover:text-navy dark:hover:text-slate-200'
            }`}
          >
            Dashboards
          </button>
        </div>
      </div>

      {activeTab === 'teams' ? (
        <TeamsPanel />
      ) : activeTab === 'dashboards' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link
            href="/seo"
            className="group bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 p-5 hover:border-electric/30 dark:hover:border-electric/30 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-xl">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600 dark:text-blue-400"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>
              </div>
              <h3 className="font-heading font-semibold text-navy dark:text-white group-hover:text-electric transition-colors">SEO Pipeline</h3>
            </div>
            <p className="text-xs text-navy/50 dark:text-slate-400">Keyword research, content briefs, and SEO optimization workflows.</p>
          </Link>

          <Link
            href="/pageforge"
            className="group bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 p-5 hover:border-electric/30 dark:hover:border-electric/30 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-600 dark:text-purple-400"><path d="M15 12h.01"/><path d="M3 3v18h18"/><path d="M18 9l-6-6-9 9"/><rect width="4" height="4" x="15" y="15" rx="1"/></svg>
              </div>
              <h3 className="font-heading font-semibold text-navy dark:text-white group-hover:text-electric transition-colors">PageForge</h3>
            </div>
            <p className="text-xs text-navy/50 dark:text-slate-400">AI-powered page building and deployment pipeline.</p>
          </Link>

          <Link
            href="/outreach"
            className="group bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 p-5 hover:border-electric/30 dark:hover:border-electric/30 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-sky-600 dark:text-sky-400"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect width="4" height="12" x="2" y="9"/><circle cx="4" cy="4" r="2"/></svg>
              </div>
              <h3 className="font-heading font-semibold text-navy dark:text-white group-hover:text-electric transition-colors">LinkedIn Outreach</h3>
            </div>
            <p className="text-xs text-navy/50 dark:text-slate-400">Automated LinkedIn prospecting and outreach campaigns.</p>
          </Link>

          <Link
            href="/team-pr"
            className="group bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 p-5 hover:border-electric/30 dark:hover:border-electric/30 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-teal-600 dark:text-teal-400"><path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9z"/><path d="M5 13l2 2c2.76-2.76 7.24-2.76 10 0l2-2C14.14 8.14 9.87 8.14 5 13z"/><path d="M9 17l3 3 3-3c-1.66-1.66-4.34-1.66-6 0z"/></svg>
              </div>
              <h3 className="font-heading font-semibold text-navy dark:text-white group-hover:text-electric transition-colors">Team PR</h3>
            </div>
            <p className="text-xs text-navy/50 dark:text-slate-400">Team public relations and brand presence management.</p>
          </Link>

          <Link
            href="/podcast/dashboard"
            className="group bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 p-5 hover:border-electric/30 dark:hover:border-electric/30 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center text-xl">🎙️</div>
              <h3 className="font-heading font-semibold text-navy dark:text-white group-hover:text-electric transition-colors">Podcast Dashboard</h3>
            </div>
            <p className="text-xs text-navy/50 dark:text-slate-400">Podcast episode management and guest coordination.</p>
          </Link>

          <Link
            href="/podcast/approval"
            className="group bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 p-5 hover:border-electric/30 dark:hover:border-electric/30 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-xl">✅</div>
              <h3 className="font-heading font-semibold text-navy dark:text-white group-hover:text-electric transition-colors">Guest Approval</h3>
            </div>
            <p className="text-xs text-navy/50 dark:text-slate-400">Review and approve podcast guest applications.</p>
          </Link>

          <Link
            href="/settings/agents"
            className="group bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 p-5 hover:border-electric/30 dark:hover:border-electric/30 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xl">📊</div>
              <h3 className="font-heading font-semibold text-navy dark:text-white group-hover:text-electric transition-colors">Skill Quality Dashboard</h3>
            </div>
            <p className="text-xs text-navy/50 dark:text-slate-400">Monitor and tune agent skill quality scores.</p>
          </Link>
        </div>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: skill picker + launcher */}
        <div className="lg:col-span-2 space-y-4">
          {/* Launch section */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 p-5">
            <h2 className="text-lg font-heading font-semibold text-navy dark:text-slate-100 mb-4">
              Launch an Agent
            </h2>

            {/* Skill selection */}
            <div className="mb-4">
              <label className="text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider mb-2 block">
                Select Skill
              </label>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  placeholder="Search skills..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm rounded-lg border border-navy/10 dark:border-slate-600 bg-cream dark:bg-slate-900 text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-electric/30"
                />
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="px-3 py-2 text-sm rounded-lg border border-navy/10 dark:border-slate-600 bg-cream dark:bg-slate-900 text-navy dark:text-slate-100"
                >
                  <option value="all">All Categories</option>
                  {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
                    <option key={key} value={key}>{cfg.icon} {cfg.label}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[480px] overflow-y-auto">
                {filteredSkills.map((skill) => {
                  const tier = TIER_CONFIG[skill.quality_tier];
                  const isSelected = selectedSkill?.id === skill.id;
                  return (
                    <button
                      key={skill.id}
                      onClick={() => {
                        setSelectedSkill(skill);
                        if (!prompt) setPrompt('');
                      }}
                      className={`text-left p-3 rounded-lg border transition-all ${
                        isSelected
                          ? 'border-electric bg-electric/5 dark:bg-electric/10 ring-1 ring-electric/30'
                          : 'border-navy/5 dark:border-slate-700 hover:border-navy/15 dark:hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">{skill.icon}</span>
                        <span className="text-sm font-semibold text-navy dark:text-slate-100 truncate">{skill.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${tier.bg} ${tier.color}`}>
                          {tier.label}
                        </span>
                        <span className="text-[10px] text-navy/40 dark:text-slate-500">
                          {CATEGORY_CONFIG[skill.category]?.label}
                        </span>
                        {skill.model_override && (
                          <span className="text-[9px] px-1 py-0.5 rounded bg-electric/10 text-electric font-medium truncate max-w-[80px]" title={skill.model_override}>
                            {AVAILABLE_MODELS.find(m => m.id === skill.model_override)?.label || skill.model_override}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              {filteredSkills.length === 0 && (
                <div className="text-center py-8 text-navy/40 dark:text-slate-500">
                  <p className="text-sm">No skills found. Try adjusting filters or seed defaults from the Skill Quality Dashboard.</p>
                </div>
              )}
            </div>

            {/* Board context + prompt input */}
            {selectedSkill && (
              <div className="space-y-3">
                {/* Board context selector (shown when skill has tools) */}
                {(selectedSkill.supported_tools?.length ?? 0) > 0 && boards.length > 0 && (
                  <div>
                    <label className="text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider mb-2 block">
                      Board Context (optional)
                    </label>
                    <select
                      value={selectedBoardId}
                      onChange={(e) => setSelectedBoardId(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-navy/10 dark:border-slate-600 bg-cream dark:bg-slate-900 text-navy dark:text-slate-100"
                    >
                      <option value="">No board (standalone)</option>
                      {boards.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                    <p className="text-[10px] text-navy/30 dark:text-slate-500 mt-1">
                      Selecting a board enables tools like list_cards, create_card, search_cards.
                    </p>
                  </div>
                )}

                <div>
                  <label className="text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider mb-2 block">
                    Instructions for {selectedSkill.name}
                  </label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={`Tell ${selectedSkill.name} what to do...`}
                    rows={4}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-navy/10 dark:border-slate-600 bg-cream dark:bg-slate-900 text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-electric/30 resize-none"
                  />
                </div>
                <div className="flex items-center gap-4">
                  <button
                    onClick={runAgent}
                    disabled={running || !prompt.trim()}
                    className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-electric text-white hover:bg-electric/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    {running ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        {useVps ? 'Starting...' : 'Running...'}
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                        Run Agent
                      </>
                    )}
                  </button>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useVps}
                      onChange={(e) => setUseVps(e.target.checked)}
                      className="w-4 h-4 rounded border-navy/20 dark:border-slate-600 text-electric focus:ring-electric/30"
                    />
                    <span className="text-xs text-navy/50 dark:text-slate-400">
                      VPS (background)
                    </span>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* VPS Job Progress */}
          {useVps && vpsState.job && (
            <VpsJobProgress state={vpsState} />
          )}

          {/* Output section (SSE path) */}
          {!useVps && (output || error || toolCalls.length > 0) && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-navy dark:text-slate-100">
                  {running ? 'Streaming Output...' : 'Agent Output'}
                </h3>
                {output && !running && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(output);
                    }}
                    className="text-xs text-navy/40 dark:text-slate-500 hover:text-electric transition-colors"
                  >
                    Copy
                  </button>
                )}
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-600 dark:text-red-400 mb-3">
                  {error}
                </div>
              )}

              {/* Tool calls display */}
              {toolCalls.length > 0 && (
                <div className="space-y-2 mb-3">
                  {toolCalls.map((tc, i) => (
                    <div
                      key={i}
                      className={`px-3 py-2 rounded-lg text-xs flex items-center gap-2 ${
                        tc.status === 'running' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' :
                        tc.status === 'completed' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' :
                        'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                      }`}
                    >
                      {tc.status === 'running' && <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />}
                      <span className="font-mono font-semibold">{tc.name}</span>
                      {tc.result && <span className="text-navy/40 dark:text-slate-500 truncate flex-1">{tc.result.slice(0, 100)}</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* Confirmation dialog */}
              {confirmation && (
                <div className="p-3 rounded-lg border-2 border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20 mb-3">
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-2">Confirmation Required</p>
                  <p className="text-sm text-amber-700 dark:text-amber-400 mb-3">{confirmation.message}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        setConfirmation(null);
                        // Resume via the resume endpoint
                        if (executionId && selectedSkill) {
                          setRunning(true);
                          try {
                            const res = await fetch('/api/agents/run/resume', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                execution_id: executionId,
                                tool_call_id: confirmation.tool_call_id,
                                action: 'approve',
                                skill_id: selectedSkill.id,
                                input_message: prompt.trim(),
                                board_id: selectedBoardId || undefined,
                              }),
                            });
                            // Handle SSE for resume (simplified)
                            const reader = res.body?.getReader();
                            if (reader) {
                              const decoder = new TextDecoder();
                              let buf = '';
                              let evt = '';
                              while (true) {
                                const { done, value } = await reader.read();
                                if (done) break;
                                buf += decoder.decode(value, { stream: true });
                                const lines = buf.split('\n');
                                buf = lines.pop() ?? '';
                                for (const ln of lines) {
                                  if (ln.startsWith('event: ')) evt = ln.slice(7).trim();
                                  else if (ln.startsWith('data: ')) {
                                    try {
                                      const d = JSON.parse(ln.slice(6));
                                      if (evt === 'token' && d.text) setOutput(prev => prev + d.text);
                                      else if (evt === 'error' && d.error) setError(d.error);
                                    } catch {}
                                  }
                                }
                              }
                            }
                          } catch (err: any) {
                            setError(err.message);
                          } finally {
                            setRunning(false);
                          }
                        }
                      }}
                      className="px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => setConfirmation(null)}
                      className="px-4 py-2 text-sm font-semibold rounded-lg border border-red-300 text-red-600 hover:bg-red-50 transition-colors"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              )}

              {output && (
                <div
                  ref={outputRef}
                  className="p-4 rounded-lg bg-cream dark:bg-slate-900 text-sm text-navy/80 dark:text-slate-300 max-h-96 overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed"
                >
                  {output}
                  {running && <span className="animate-pulse text-electric">|</span>}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: selected skill details */}
        <div className="lg:col-span-1">
          {selectedSkill ? (
            <div className="sticky top-4 bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 p-5">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">{selectedSkill.icon}</span>
                <div>
                  <h3 className="font-heading font-semibold text-navy dark:text-slate-100">{selectedSkill.name}</h3>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${TIER_CONFIG[selectedSkill.quality_tier].bg} ${TIER_CONFIG[selectedSkill.quality_tier].color}`}>
                    {TIER_CONFIG[selectedSkill.quality_tier].label}
                  </span>
                </div>
              </div>

              <p className="text-sm text-navy/60 dark:text-slate-400 mb-4">{selectedSkill.description}</p>

              {/* Quality score */}
              <div className="mb-4">
                <div className="flex justify-between text-xs text-navy/40 dark:text-slate-500 mb-1">
                  <span>Quality Score</span>
                  <span className="font-mono">{selectedSkill.quality_score}/100</span>
                </div>
                <div className="h-2 bg-cream dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      selectedSkill.quality_score >= 85 ? 'bg-emerald-500'
                        : selectedSkill.quality_score >= 70 ? 'bg-blue-500'
                        : selectedSkill.quality_score >= 55 ? 'bg-amber-500'
                        : 'bg-red-500'
                    }`}
                    style={{ width: `${selectedSkill.quality_score}%` }}
                  />
                </div>
              </div>

              {/* Model Override */}
              <div className="mb-4">
                <label className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase tracking-wider mb-1.5 block">
                  AI Model
                </label>
                <div className="relative">
                  <select
                    value={selectedSkill.model_override || ''}
                    onChange={(e) => handleModelChange(selectedSkill.id, e.target.value)}
                    disabled={savingModel}
                    className="appearance-none w-full px-3 py-2 pr-8 rounded-lg border border-navy/10 dark:border-slate-600 bg-cream dark:bg-slate-900 text-xs text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-all disabled:opacity-50"
                  >
                    <option value="">Default (Sonnet 4.5)</option>
                    {AVAILABLE_MODELS.map(m => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                    {savingModel ? (
                      <div className="w-3 h-3 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-navy/30"><polyline points="6 9 12 15 18 9" /></svg>
                    )}
                  </div>
                </div>
                <p className="text-[10px] text-navy/30 dark:text-slate-600 mt-1">
                  Overrides the global agent model for this skill only
                </p>
              </div>

              {/* Strengths */}
              {selectedSkill.strengths.length > 0 && (
                <div className="mb-3">
                  <h4 className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">Strengths</h4>
                  <ul className="space-y-0.5">
                    {selectedSkill.strengths.slice(0, 3).map((s, i) => (
                      <li key={i} className="text-xs text-navy/60 dark:text-slate-400 flex gap-1.5">
                        <span className="text-emerald-500 shrink-0">+</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Weaknesses */}
              {selectedSkill.weaknesses.length > 0 && (
                <div className="mb-3">
                  <h4 className="text-[10px] font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider mb-1">Weaknesses</h4>
                  <ul className="space-y-0.5">
                    {selectedSkill.weaknesses.slice(0, 3).map((w, i) => (
                      <li key={i} className="text-xs text-navy/60 dark:text-slate-400 flex gap-1.5">
                        <span className="text-red-500 shrink-0">-</span>
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Required context */}
              {selectedSkill.required_context.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase tracking-wider mb-1">Required Context</h4>
                  <div className="flex flex-wrap gap-1">
                    {selectedSkill.required_context.map((ctx) => (
                      <span key={ctx} className="text-[10px] px-1.5 py-0.5 rounded bg-cream dark:bg-slate-700 text-navy/50 dark:text-slate-400">
                        {ctx}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="sticky top-4 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-navy/10 dark:border-slate-700 p-8 text-center">
              <div className="text-4xl mb-3">🤖</div>
              <p className="text-sm text-navy/50 dark:text-slate-400 font-body">
                Select a skill to see details and launch an agent task.
              </p>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
