'use client';

import { useState, useEffect } from 'react';
import type {
  AgentSkill,
  AgentQualityTier,
  AgentSkillCategory,
  SkillQualityDashboard as DashboardData,
  AgentExecutionStats,
} from '@/lib/types';

// ============================================================================
// QUALITY TIER CONFIG
// ============================================================================

const TIER_CONFIG: Record<AgentQualityTier, { label: string; color: string; bgColor: string; darkBgColor: string; emoji: string }> = {
  genuinely_smart: { label: 'Genuinely Smart', color: 'text-emerald-700 dark:text-emerald-400', bgColor: 'bg-emerald-100', darkBgColor: 'dark:bg-emerald-900/30', emoji: '🟢' },
  solid: { label: 'Solid', color: 'text-blue-700 dark:text-blue-400', bgColor: 'bg-blue-100', darkBgColor: 'dark:bg-blue-900/30', emoji: '🟡' },
  has_potential: { label: 'Has Potential', color: 'text-amber-700 dark:text-amber-400', bgColor: 'bg-amber-100', darkBgColor: 'dark:bg-amber-900/30', emoji: '🟠' },
  placeholder: { label: 'Placeholder', color: 'text-red-700 dark:text-red-400', bgColor: 'bg-red-100', darkBgColor: 'dark:bg-red-900/30', emoji: '🔴' },
  tool_dependent: { label: 'Tool Dependent', color: 'text-gray-700 dark:text-gray-400', bgColor: 'bg-gray-100', darkBgColor: 'dark:bg-gray-800', emoji: '⚫' },
};

const CATEGORY_CONFIG: Record<string, { label: string; icon: string }> = {
  content: { label: 'Content', icon: '📝' },
  creative: { label: 'Creative', icon: '🎨' },
  strategy: { label: 'Strategy', icon: '🎯' },
  seo: { label: 'SEO', icon: '🔍' },
  meta: { label: 'Meta', icon: '🧠' },
};

// ============================================================================
// QUALITY SCORE BAR
// ============================================================================

function QualityScoreBar({ score }: { score: number }) {
  const getColor = () => {
    if (score >= 85) return 'bg-emerald-500';
    if (score >= 70) return 'bg-blue-500';
    if (score >= 55) return 'bg-amber-500';
    if (score >= 40) return 'bg-orange-500';
    return 'bg-red-500';
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${getColor()}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-xs font-mono text-gray-600 dark:text-gray-400 w-8 text-right">{score}</span>
    </div>
  );
}

// ============================================================================
// TIER BADGE
// ============================================================================

function TierBadge({ tier }: { tier: AgentQualityTier }) {
  const config = TIER_CONFIG[tier];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.bgColor} ${config.darkBgColor} ${config.color}`}>
      {config.emoji} {config.label}
    </span>
  );
}

// ============================================================================
// SKILL CARD
// ============================================================================

function SkillCard({
  skill,
  onSelect,
  isSelected,
}: {
  skill: AgentSkill;
  onSelect: (skill: AgentSkill) => void;
  isSelected: boolean;
}) {
  return (
    <div
      onClick={() => onSelect(skill)}
      className={`p-4 rounded-lg border cursor-pointer transition-all hover:shadow-md ${
        isSelected
          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 shadow-md'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">{skill.icon}</span>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{skill.name}</h3>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {CATEGORY_CONFIG[skill.category]?.icon} {CATEGORY_CONFIG[skill.category]?.label} &middot; {skill.pack}
            </span>
          </div>
        </div>
        <TierBadge tier={skill.quality_tier} />
      </div>

      <p className="text-xs text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">{skill.description}</p>

      <QualityScoreBar score={skill.quality_score} />

      {/* Dependency indicators */}
      {(skill.depends_on.length > 0 || skill.feeds_into.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {skill.depends_on.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
              needs {skill.depends_on.length} skill{skill.depends_on.length > 1 ? 's' : ''}
            </span>
          )}
          {skill.feeds_into.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
              feeds {skill.feeds_into.length} skill{skill.feeds_into.length > 1 ? 's' : ''}
            </span>
          )}
          {skill.requires_mcp_tools.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400">
              MCP: {skill.requires_mcp_tools.join(', ')}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SKILL DETAIL PANEL
// ============================================================================

function SkillDetailPanel({ skill }: { skill: AgentSkill }) {
  return (
    <div className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-3xl">{skill.icon}</span>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{skill.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            <TierBadge tier={skill.quality_tier} />
            <span className="text-sm text-gray-500 dark:text-gray-400">v{skill.version}</span>
          </div>
        </div>
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{skill.description}</p>

      {/* Quality Score */}
      <div className="mb-6">
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Quality Score</label>
        <div className="mt-1">
          <QualityScoreBar score={skill.quality_score} />
        </div>
      </div>

      {/* Assessment Notes */}
      {skill.quality_notes && (
        <div className="mb-6 p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Assessment</label>
          <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{skill.quality_notes}</p>
        </div>
      )}

      {/* Strengths */}
      {skill.strengths.length > 0 && (
        <div className="mb-4">
          <label className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wide flex items-center gap-1">
            <span>+</span> Strengths
          </label>
          <ul className="mt-1 space-y-1">
            {skill.strengths.map((s, i) => (
              <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                <span className="text-emerald-500 mt-0.5 shrink-0">+</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Weaknesses */}
      {skill.weaknesses.length > 0 && (
        <div className="mb-4">
          <label className="text-xs font-medium text-red-600 dark:text-red-400 uppercase tracking-wide flex items-center gap-1">
            <span>-</span> Weaknesses
          </label>
          <ul className="mt-1 space-y-1">
            {skill.weaknesses.map((w, i) => (
              <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                <span className="text-red-500 mt-0.5 shrink-0">-</span>
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Improvement Suggestions */}
      {skill.improvement_suggestions.length > 0 && (
        <div className="mb-4">
          <label className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wide flex items-center gap-1">
            <span>!</span> Improvement Roadmap
          </label>
          <ul className="mt-1 space-y-1">
            {skill.improvement_suggestions.map((s, i) => (
              <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                <span className="text-amber-500 mt-0.5 shrink-0">{i + 1}.</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Dependencies */}
      {(skill.depends_on.length > 0 || skill.feeds_into.length > 0) && (
        <div className="mb-4 p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
          <label className="text-xs font-medium text-purple-600 dark:text-purple-400 uppercase tracking-wide">Dependency Graph</label>
          {skill.depends_on.length > 0 && (
            <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
              <span className="font-medium">Depends on:</span>{' '}
              {skill.depends_on.map(d => (
                <span key={d} className="inline-block px-1.5 py-0.5 mr-1 rounded bg-purple-100 dark:bg-purple-800/50 text-purple-700 dark:text-purple-300 text-xs">
                  {d}
                </span>
              ))}
            </p>
          )}
          {skill.feeds_into.length > 0 && (
            <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
              <span className="font-medium">Feeds into:</span>{' '}
              {skill.feeds_into.map(d => (
                <span key={d} className="inline-block px-1.5 py-0.5 mr-1 rounded bg-indigo-100 dark:bg-indigo-800/50 text-indigo-700 dark:text-indigo-300 text-xs">
                  {d}
                </span>
              ))}
            </p>
          )}
        </div>
      )}

      {/* Reference Docs */}
      {skill.reference_docs.length > 0 && (
        <div className="mb-4">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Reference Material</label>
          <div className="mt-1 space-y-2">
            {skill.reference_docs.map((doc, i) => (
              <div key={i} className="p-2 rounded bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{doc.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{doc.content_summary}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 italic">Quality: {doc.quality}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Required Context */}
      <div className="flex flex-wrap gap-1 mt-4">
        {skill.required_context.map(ctx => (
          <span key={ctx} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
            {ctx}
          </span>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// TIER SUMMARY CARDS
// ============================================================================

function TierSummaryCards({ byTier }: { byTier: Record<AgentQualityTier, number> }) {
  const tiers: AgentQualityTier[] = ['genuinely_smart', 'solid', 'has_potential', 'placeholder', 'tool_dependent'];

  return (
    <div className="grid grid-cols-5 gap-3 mb-6">
      {tiers.map(tier => {
        const config = TIER_CONFIG[tier];
        const count = byTier[tier] ?? 0;
        return (
          <div
            key={tier}
            className={`p-3 rounded-lg border border-gray-200 dark:border-gray-700 ${config.bgColor} ${config.darkBgColor}`}
          >
            <div className="text-2xl font-bold ${config.color}">{count}</div>
            <div className={`text-xs font-medium ${config.color}`}>{config.emoji} {config.label}</div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// MAIN DASHBOARD COMPONENT
// ============================================================================

export default function SkillQualityDashboard() {
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<AgentSkill | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterPack, setFilterPack] = useState<string>('all');
  const [filterTier, setFilterTier] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'sort_order' | 'quality_score' | 'name'>('sort_order');

  useEffect(() => {
    fetchSkills();
  }, []);

  const fetchSkills = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/agents/skills');
      const json = await res.json();
      setSkills(json.data ?? []);
    } catch (err) {
      console.error('Failed to fetch skills:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Compute tier counts
  const byTier: Record<AgentQualityTier, number> = {
    genuinely_smart: 0, solid: 0, has_potential: 0, placeholder: 0, tool_dependent: 0,
  };
  for (const s of skills) {
    byTier[s.quality_tier] = (byTier[s.quality_tier] ?? 0) + 1;
  }

  // Filtered skills
  const filteredSkills = skills
    .filter(s => {
      if (filterCategory !== 'all' && s.category !== filterCategory) return false;
      if (filterPack !== 'all' && s.pack !== filterPack) return false;
      if (filterTier !== 'all' && s.quality_tier !== filterTier) return false;
      if (searchQuery && !s.name.toLowerCase().includes(searchQuery.toLowerCase()) && !s.description.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'quality_score') return b.quality_score - a.quality_score;
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return a.sort_order - b.sort_order;
    });

  const avgScore = skills.length > 0
    ? Math.round(skills.reduce((sum, s) => sum + s.quality_score, 0) / skills.length)
    : 0;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Agent Skills</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {skills.length} skills &middot; Avg quality: {avgScore}/100
          </p>
        </div>
        <button
          onClick={async () => {
            const res = await fetch('/api/agents/skills', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'seed' }),
            });
            const json = await res.json();
            alert(`Seeded: ${json.data?.created} created, ${json.data?.skipped} skipped`);
            fetchSkills();
          }}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          Seed Default Skills
        </button>
      </div>

      {/* Tier Summary */}
      <TierSummaryCards byTier={byTier} />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="Search skills..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />

        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
        >
          <option value="all">All Categories</option>
          {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
            <option key={key} value={key}>{cfg.icon} {cfg.label}</option>
          ))}
        </select>

        <select
          value={filterPack}
          onChange={e => setFilterPack(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
        >
          <option value="all">All Packs</option>
          <option value="skills">Skills Pack</option>
          <option value="creative">Creative Pack</option>
          <option value="custom">Custom</option>
        </select>

        <select
          value={filterTier}
          onChange={e => setFilterTier(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
        >
          <option value="all">All Tiers</option>
          {Object.entries(TIER_CONFIG).map(([key, cfg]) => (
            <option key={key} value={key}>{cfg.emoji} {cfg.label}</option>
          ))}
        </select>

        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as any)}
          className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
        >
          <option value="sort_order">Default Order</option>
          <option value="quality_score">Quality Score</option>
          <option value="name">Name</option>
        </select>
      </div>

      {/* Main Content: Grid + Detail Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Skill Grid */}
        <div className="lg:col-span-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
            </div>
          ) : filteredSkills.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <p className="text-lg">No skills found</p>
              <p className="text-sm mt-1">Try adjusting your filters or seed the default skills.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredSkills.map(skill => (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  onSelect={setSelectedSkill}
                  isSelected={selectedSkill?.id === skill.id}
                />
              ))}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        <div className="lg:col-span-1">
          {selectedSkill ? (
            <div className="sticky top-4">
              <SkillDetailPanel skill={selectedSkill} />
            </div>
          ) : (
            <div className="p-8 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-center text-gray-500 dark:text-gray-400">
              <p className="text-sm">Select a skill to see its quality assessment, strengths, weaknesses, and improvement roadmap.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
