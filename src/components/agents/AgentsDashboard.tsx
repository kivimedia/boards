'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import type { AgentSkill, AgentQualityTier } from '@/lib/types';

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
  meta: { label: 'Meta', icon: '' },
};

export default function AgentsDashboard() {
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSkill, setSelectedSkill] = useState<AgentSkill | null>(null);
  const [prompt, setPrompt] = useState('');
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchSkills();
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

  const runAgent = async () => {
    if (!selectedSkill || !prompt.trim()) return;

    setRunning(true);
    setOutput('');
    setError(null);

    try {
      const res = await fetch('/api/agents/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skill_id: selectedSkill.id,
          input_message: prompt.trim(),
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
        // Non-streaming response fallback
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
      {/* Navigation */}
      <div className="flex items-center gap-4 mb-6">
        <span className="text-sm font-semibold text-navy dark:text-slate-100">Agents</span>
        <Link
          href="/podcast/dashboard"
          className="text-sm font-medium text-navy/50 dark:text-slate-400 hover:text-electric dark:hover:text-electric transition-colors"
        >
          Podcast Dashboard
        </Link>
        <Link
          href="/podcast/approval"
          className="text-sm font-medium text-navy/50 dark:text-slate-400 hover:text-electric dark:hover:text-electric transition-colors"
        >
          Guest Approval
        </Link>
        <Link
          href="/settings/agents"
          className="text-sm font-medium text-navy/50 dark:text-slate-400 hover:text-electric dark:hover:text-electric transition-colors ml-auto"
        >
          Skill Quality Dashboard
        </Link>
      </div>

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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
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

            {/* Prompt input */}
            {selectedSkill && (
              <div className="space-y-3">
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
                <button
                  onClick={runAgent}
                  disabled={running || !prompt.trim()}
                  className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-electric text-white hover:bg-electric/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {running ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Running...
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
              </div>
            )}
          </div>

          {/* Output section */}
          {(output || error) && (
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
    </div>
  );
}
