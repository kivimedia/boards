'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { PRRun, PRRunStatus } from '@/lib/types';

/* ------------------------------------------------------------------ */
/*  Agent Definitions                                                   */
/* ------------------------------------------------------------------ */

interface PRAgentDef {
  slug: string;
  name: string;
  role: string;
  icon: string;
  color: string;         // tailwind color prefix (purple, blue, cyan, amber, green)
  description: string;
  capabilities: string[];
  pipeline_stages: PRRunStatus[];
  model: string;
}

const PR_AGENTS: PRAgentDef[] = [
  {
    slug: 'orchestrator',
    name: 'PR Orchestrator',
    role: 'Pipeline Coordinator',
    icon: '\uD83C\uDFAF',
    color: 'purple',
    description:
      'Coordinates the entire PR pipeline. Routes tasks between agents, manages gate approvals, handles errors and retries, and ensures quality thresholds are met at each stage.',
    capabilities: [
      'Pipeline scheduling & routing',
      'Gate approval management',
      'Error recovery & retries',
      'Cost tracking & budget control',
      'Run configuration & overrides',
    ],
    pipeline_stages: ['PENDING', 'GATE_A', 'GATE_B', 'GATE_C', 'COMPLETED', 'FAILED', 'CANCELLED'],
    model: 'Claude Sonnet 4',
  },
  {
    slug: 'researcher',
    name: 'Research Agent',
    role: 'Outlet Discovery',
    icon: '\uD83D\uDD0D',
    color: 'blue',
    description:
      'Discovers relevant media outlets using Tavily, YouTube Data API, and Exa search. Scores each outlet for relevance to the client\'s industry, target markets, and pitch angles.',
    capabilities: [
      'Multi-source outlet discovery',
      'Relevance scoring (0-100%)',
      'Topic & audience analysis',
      'Duplicate detection',
      'Market-specific filtering',
    ],
    pipeline_stages: ['RESEARCH'],
    model: 'Claude Sonnet 4',
  },
  {
    slug: 'verifier',
    name: 'Verification Agent',
    role: 'Contact Verification',
    icon: '\u2705',
    color: 'cyan',
    description:
      'Verifies outlet contact information using Hunter.io and web scraping. Finds editor/journalist emails, validates deliverability, and assigns confidence scores.',
    capabilities: [
      'Email discovery via Hunter.io',
      'Contact name & role extraction',
      'Email deliverability validation',
      'Confidence scoring',
      'LinkedIn cross-referencing',
    ],
    pipeline_stages: ['VERIFICATION'],
    model: 'Claude Sonnet 4',
  },
  {
    slug: 'qa',
    name: 'QA Agent',
    role: 'Quality Assurance',
    icon: '\uD83D\uDEE1\uFE0F',
    color: 'rose',
    description:
      'Runs quality checks on verified outlets. Ensures the outlet is active, publishes relevant content, has editorial standards, and is not on the client exclusion list.',
    capabilities: [
      'Outlet activity verification',
      'Editorial quality check',
      'Exclusion list matching',
      'Content relevance re-scoring',
      'Red flag detection',
    ],
    pipeline_stages: ['QA_LOOP'],
    model: 'Claude Sonnet 4',
  },
  {
    slug: 'email-writer',
    name: 'Email Writer',
    role: 'Pitch Generation',
    icon: '\u270D\uFE0F',
    color: 'green',
    description:
      'Crafts personalized pitch emails using the client\'s brand voice, tone rules, and pitch angles. Adapts language and style for each territory and outlet type.',
    capabilities: [
      'Personalized pitch crafting',
      'Brand voice adherence',
      'Multi-language support',
      'A/B subject line generation',
      'Tone & formality matching',
    ],
    pipeline_stages: ['EMAIL_GEN'],
    model: 'Claude Sonnet 4',
  },
];

/* ------------------------------------------------------------------ */
/*  Color maps                                                          */
/* ------------------------------------------------------------------ */

const colorMap: Record<string, { bg: string; border: string; text: string; badge: string; dot: string; ring: string }> = {
  purple: {
    bg: 'bg-purple-50 dark:bg-purple-500/10',
    border: 'border-purple-200 dark:border-purple-500/30',
    text: 'text-purple-700 dark:text-purple-300',
    badge: 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300',
    dot: 'bg-purple-500',
    ring: 'ring-purple-500/30',
  },
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-500/10',
    border: 'border-blue-200 dark:border-blue-500/30',
    text: 'text-blue-700 dark:text-blue-300',
    badge: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300',
    dot: 'bg-blue-500',
    ring: 'ring-blue-500/30',
  },
  cyan: {
    bg: 'bg-cyan-50 dark:bg-cyan-500/10',
    border: 'border-cyan-200 dark:border-cyan-500/30',
    text: 'text-cyan-700 dark:text-cyan-300',
    badge: 'bg-cyan-100 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300',
    dot: 'bg-cyan-500',
    ring: 'ring-cyan-500/30',
  },
  amber: {
    bg: 'bg-amber-50 dark:bg-amber-500/10',
    border: 'border-amber-200 dark:border-amber-500/30',
    text: 'text-amber-700 dark:text-amber-300',
    badge: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300',
    dot: 'bg-amber-500',
    ring: 'ring-amber-500/30',
  },
  rose: {
    bg: 'bg-rose-50 dark:bg-rose-500/10',
    border: 'border-rose-200 dark:border-rose-500/30',
    text: 'text-rose-700 dark:text-rose-300',
    badge: 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300',
    dot: 'bg-rose-500',
    ring: 'ring-rose-500/30',
  },
  green: {
    bg: 'bg-green-50 dark:bg-green-500/10',
    border: 'border-green-200 dark:border-green-500/30',
    text: 'text-green-700 dark:text-green-300',
    badge: 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300',
    dot: 'bg-green-500',
    ring: 'ring-green-500/30',
  },
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function getAgentStatus(agent: PRAgentDef, activeRuns: PRRun[]): 'active' | 'idle' | 'waiting' {
  const activeForAgent = activeRuns.filter((r) => agent.pipeline_stages.includes(r.status));
  if (activeForAgent.length > 0) {
    if (agent.slug === 'orchestrator' && activeForAgent.every((r) => ['GATE_A', 'GATE_B', 'GATE_C'].includes(r.status))) {
      return 'waiting';
    }
    return 'active';
  }
  return 'idle';
}

function getAgentRunCount(agent: PRAgentDef, runs: PRRun[]): number {
  return runs.filter((r) => agent.pipeline_stages.includes(r.status)).length;
}

/* ------------------------------------------------------------------ */
/*  Components                                                          */
/* ------------------------------------------------------------------ */

function StatusDot({ status }: { status: 'active' | 'idle' | 'waiting' }) {
  if (status === 'active') {
    return (
      <span className="relative flex h-3 w-3">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
      </span>
    );
  }
  if (status === 'waiting') {
    return (
      <span className="relative flex h-3 w-3">
        <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-50" />
        <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
      </span>
    );
  }
  return <span className="inline-flex rounded-full h-3 w-3 bg-gray-400 dark:bg-gray-600" />;
}

function StatusLabel({ status }: { status: 'active' | 'idle' | 'waiting' }) {
  const styles: Record<string, string> = {
    active: 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400',
    idle: 'bg-gray-100 dark:bg-gray-500/20 text-gray-600 dark:text-gray-400',
    waiting: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400',
  };
  const labels: Record<string, string> = {
    active: 'Active',
    idle: 'Idle',
    waiting: 'Awaiting Gate',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function AgentCard({
  agent,
  status,
  activeCount,
  isSelected,
  onClick,
}: {
  agent: PRAgentDef;
  status: 'active' | 'idle' | 'waiting';
  activeCount: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  const c = colorMap[agent.color];
  return (
    <button
      onClick={onClick}
      className={`text-left w-full p-5 rounded-xl border-2 transition-all ${
        isSelected
          ? `${c.bg} ${c.border} ring-2 ${c.ring}`
          : 'bg-white dark:bg-[#141420]/50 border-gray-200 dark:border-gray-500/20 hover:border-gray-300 dark:hover:border-gray-500/40'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{agent.icon}</span>
          <div>
            <h3 className="text-sm font-semibold text-navy dark:text-white">{agent.name}</h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">{agent.role}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusDot status={status} />
          <StatusLabel status={status} />
        </div>
      </div>

      <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-2 mb-3">
        {agent.description}
      </p>

      <div className="flex items-center gap-3 text-[10px]">
        <span className={`px-2 py-0.5 rounded ${c.badge}`}>{agent.model}</span>
        {activeCount > 0 && (
          <span className="text-gray-500 dark:text-gray-400">
            {activeCount} active run{activeCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </button>
  );
}

function AgentDetail({ agent, status, activeCount }: { agent: PRAgentDef; status: 'active' | 'idle' | 'waiting'; activeCount: number }) {
  const c = colorMap[agent.color];
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl ${c.bg} ${c.border} border`}>
          {agent.icon}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-navy dark:text-white">{agent.name}</h2>
            <StatusLabel status={status} />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{agent.role}</p>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-500/20 bg-gray-50 dark:bg-[#141420]/50">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Model</p>
          <p className="text-sm font-medium text-navy dark:text-white mt-0.5">{agent.model}</p>
        </div>
        <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-500/20 bg-gray-50 dark:bg-[#141420]/50">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Active Runs</p>
          <p className="text-sm font-medium text-navy dark:text-white mt-0.5">{activeCount}</p>
        </div>
        <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-500/20 bg-gray-50 dark:bg-[#141420]/50">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Status</p>
          <p className="text-sm font-medium text-navy dark:text-white mt-0.5 capitalize">{status === 'waiting' ? 'Awaiting Gate' : status}</p>
        </div>
      </div>

      {/* Description */}
      <div>
        <h3 className="text-sm font-semibold text-navy dark:text-white mb-2">About</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{agent.description}</p>
      </div>

      {/* Capabilities */}
      <div>
        <h3 className="text-sm font-semibold text-navy dark:text-white mb-2">Capabilities</h3>
        <ul className="space-y-1.5">
          {agent.capabilities.map((cap) => (
            <li key={cap} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`mt-0.5 shrink-0 ${c.text}`}><polyline points="20 6 9 17 4 12"/></svg>
              {cap}
            </li>
          ))}
        </ul>
      </div>

      {/* Pipeline stages */}
      <div>
        <h3 className="text-sm font-semibold text-navy dark:text-white mb-2">Handles Stages</h3>
        <div className="flex flex-wrap gap-1.5">
          {agent.pipeline_stages.map((stage) => (
            <span key={stage} className={`px-2 py-0.5 rounded text-[10px] font-medium ${c.badge}`}>
              {stage.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Pipeline Flow Diagram                                               */
/* ------------------------------------------------------------------ */

function PipelineFlow({ activeRuns }: { activeRuns: PRRun[] }) {
  const stages = [
    { agent: PR_AGENTS[1], label: 'Research' },
    { agent: PR_AGENTS[2], label: 'Verify' },
    { agent: PR_AGENTS[3], label: 'QA' },
    { agent: PR_AGENTS[4], label: 'Emails' },
  ];

  return (
    <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-500/20 bg-white dark:bg-[#141420]/50">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">{PR_AGENTS[0].icon}</span>
        <h3 className="text-sm font-semibold text-navy dark:text-white">Pipeline Flow</h3>
        <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">Orchestrated by PR Orchestrator</span>
      </div>
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {stages.map((stage, i) => {
          const status = getAgentStatus(stage.agent, activeRuns);
          const c = colorMap[stage.agent.color];
          return (
            <div key={stage.agent.slug} className="flex items-center gap-1">
              {i > 0 && (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 dark:text-gray-600 shrink-0"><polyline points="9 18 15 12 9 6"/></svg>
              )}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium whitespace-nowrap ${
                status === 'active'
                  ? `${c.bg} ${c.border} ${c.text}`
                  : 'bg-gray-50 dark:bg-gray-500/5 border-gray-200 dark:border-gray-500/20 text-gray-500 dark:text-gray-400'
              }`}>
                <span>{stage.agent.icon}</span>
                {stage.label}
                {status === 'active' && <div className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
              </div>
              {/* Gate indicator between stages (except after last) */}
              {i < stages.length - 1 && (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 dark:text-gray-600 shrink-0"><polyline points="9 18 15 12 9 6"/></svg>
                  <div className="flex items-center gap-1 px-2 py-1.5 rounded border border-dashed border-amber-300 dark:border-amber-500/40 text-[10px] text-amber-600 dark:text-amber-400 whitespace-nowrap">
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    Gate {String.fromCharCode(65 + i)}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function TeamPRAgentsPage() {
  const [selectedSlug, setSelectedSlug] = useState<string>('orchestrator');

  const { data: runsData, isLoading } = useQuery({
    queryKey: ['pr-runs', 'active-agents'],
    queryFn: async () => {
      const res = await fetch('/api/team-pr/runs?limit=50', { credentials: 'include' });
      const json = await res.json();
      return json.data;
    },
  });

  const runs: PRRun[] = runsData?.items || [];
  const activeRuns = runs.filter((r) =>
    !['COMPLETED', 'FAILED', 'CANCELLED'].includes(r.status)
  );

  const selectedAgent = PR_AGENTS.find((a) => a.slug === selectedSlug) || PR_AGENTS[0];
  const selectedStatus = getAgentStatus(selectedAgent, activeRuns);
  const selectedActiveCount = getAgentRunCount(selectedAgent, activeRuns);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Back */}
      <Link
        href="/team-pr"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-navy dark:hover:text-white transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Back to Team PR
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy dark:text-white">PR Team Agents</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {activeRuns.length} active run{activeRuns.length !== 1 ? 's' : ''} across {PR_AGENTS.length} agents
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1.5"><StatusDot status="active" /> Active</span>
            <span className="flex items-center gap-1.5"><StatusDot status="waiting" /> Waiting</span>
            <span className="flex items-center gap-1.5"><StatusDot status="idle" /> Idle</span>
          </div>
        </div>
      </div>

      {/* Pipeline Flow */}
      <PipelineFlow activeRuns={activeRuns} />

      {/* Agent Grid + Detail */}
      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-28 rounded-xl bg-gray-200 dark:bg-gray-500/10 animate-pulse" />
            ))}
          </div>
          <div className="h-96 rounded-xl bg-gray-200 dark:bg-gray-500/10 animate-pulse" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Agent List */}
          <div className="lg:col-span-2 space-y-3">
            {PR_AGENTS.map((agent) => {
              const status = getAgentStatus(agent, activeRuns);
              const count = getAgentRunCount(agent, activeRuns);
              return (
                <AgentCard
                  key={agent.slug}
                  agent={agent}
                  status={status}
                  activeCount={count}
                  isSelected={selectedSlug === agent.slug}
                  onClick={() => setSelectedSlug(agent.slug)}
                />
              );
            })}
          </div>

          {/* Detail Panel */}
          <div className="lg:sticky lg:top-6 lg:self-start p-5 rounded-xl border border-gray-200 dark:border-gray-500/20 bg-white dark:bg-[#141420]/50">
            <AgentDetail agent={selectedAgent} status={selectedStatus} activeCount={selectedActiveCount} />
          </div>
        </div>
      )}
    </div>
  );
}
