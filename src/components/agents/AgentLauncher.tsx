'use client';

import { useState, useMemo } from 'react';
import type { AgentSkill, AgentQualityTier } from '@/lib/types';

const TIER_CONFIG: Record<AgentQualityTier, { label: string; color: string; bg: string }> = {
  genuinely_smart: { label: 'Smart', color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
  solid: { label: 'Solid', color: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30' },
  has_potential: { label: 'Potential', color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/30' },
  placeholder: { label: 'Placeholder', color: 'text-red-700 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30' },
  tool_dependent: { label: 'Tool Dep.', color: 'text-gray-700 dark:text-gray-400', bg: 'bg-gray-100 dark:bg-gray-800' },
};

const CATEGORY_CONFIG: Record<string, { label: string; icon: string }> = {
  content: { label: 'Content', icon: '' },
  creative: { label: 'Creative', icon: '' },
  strategy: { label: 'Strategy', icon: '' },
  seo: { label: 'SEO', icon: '' },
  meta: { label: 'Meta', icon: '' },
};

interface AgentLauncherProps {
  skills: AgentSkill[];
  boards: { id: string; name: string }[];
  selectedSkill: AgentSkill | null;
  onSkillSelect: (skill: AgentSkill) => void;
  onLaunch: (skillId: string, prompt: string, boardId?: string) => void;
  launching: boolean;
}

export default function AgentLauncher({ skills, boards, selectedSkill, onSkillSelect, onLaunch, launching }: AgentLauncherProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [prompt, setPrompt] = useState('');
  const [selectedBoardId, setSelectedBoardId] = useState('');

  const filteredSkills = useMemo(() =>
    skills
      .filter((s) => {
        if (filterCategory !== 'all' && s.category !== filterCategory) return false;
        if (searchQuery && !s.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => a.sort_order - b.sort_order),
    [skills, filterCategory, searchQuery]
  );

  const handleRun = () => {
    if (!selectedSkill || !prompt.trim()) return;
    onLaunch(selectedSkill.id, prompt.trim(), selectedBoardId || undefined);
    setPrompt('');
  };

  return (
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
                onClick={() => onSkillSelect(skill)}
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

      {/* Board context + prompt input */}
      {selectedSkill && (
        <div className="space-y-3">
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
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleRun();
                }
              }}
              placeholder={`Tell ${selectedSkill.name} what to do...`}
              rows={4}
              className="w-full px-3 py-2 text-sm rounded-lg border border-navy/10 dark:border-slate-600 bg-cream dark:bg-slate-900 text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-electric/30 resize-none"
            />
          </div>
          <button
            onClick={handleRun}
            disabled={launching || !prompt.trim()}
            className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-electric text-white hover:bg-electric/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {launching ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Launching...
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
  );
}
