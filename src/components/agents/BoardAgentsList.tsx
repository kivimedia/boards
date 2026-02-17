'use client';

import { useState, useEffect } from 'react';
import type { BoardAgent, AgentSkill } from '@/lib/types';

// ============================================================================
// BOARD AGENTS LIST
// Shows which skills are enabled on a board + allows adding/removing
// ============================================================================

interface Props {
  boardId: string;
}

export default function BoardAgentsList({ boardId }: Props) {
  const [agents, setAgents] = useState<BoardAgent[]>([]);
  const [allSkills, setAllSkills] = useState<AgentSkill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    fetchAgents();
    fetchSkills();
  }, [boardId]);

  const fetchAgents = async () => {
    try {
      const res = await fetch(`/api/boards/${boardId}/agents?include_inactive=true`);
      const json = await res.json();
      setAgents(json.data ?? []);
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSkills = async () => {
    try {
      const res = await fetch('/api/agents/skills');
      const json = await res.json();
      setAllSkills(json.data ?? []);
    } catch (err) {
      console.error('Failed to fetch skills:', err);
    }
  };

  const addAgent = async (skillId: string) => {
    try {
      const res = await fetch(`/api/boards/${boardId}/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill_id: skillId }),
      });
      const json = await res.json();
      if (json.data) {
        setAgents(prev => [...prev, json.data]);
        setShowAddModal(false);
      }
    } catch (err) {
      console.error('Failed to add agent:', err);
    }
  };

  const toggleAgent = async (agentId: string, isActive: boolean) => {
    try {
      await fetch(`/api/boards/${boardId}/agents/${agentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !isActive }),
      });
      setAgents(prev =>
        prev.map(a => (a.id === agentId ? { ...a, is_active: !isActive } : a))
      );
    } catch (err) {
      console.error('Failed to toggle agent:', err);
    }
  };

  const removeAgent = async (agentId: string) => {
    if (!confirm('Remove this agent from the board?')) return;
    try {
      await fetch(`/api/boards/${boardId}/agents/${agentId}`, { method: 'DELETE' });
      setAgents(prev => prev.filter(a => a.id !== agentId));
    } catch (err) {
      console.error('Failed to remove agent:', err);
    }
  };

  // Skills not yet added to this board
  const addedSkillIds = new Set(agents.map(a => a.skill_id));
  const availableSkills = allSkills.filter(s => !addedSkillIds.has(s.id));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Board Agents ({agents.filter(a => a.is_active).length} active)
        </h3>
        <button
          onClick={() => setShowAddModal(!showAddModal)}
          className="text-xs px-2.5 py-1 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          + Add Skill
        </button>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="mb-4 p-3 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20">
          <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Available skills:</p>
          {availableSkills.length === 0 ? (
            <p className="text-xs text-gray-500">All skills already added to this board.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto">
              {availableSkills.map(skill => (
                <button
                  key={skill.id}
                  onClick={() => addAgent(skill.id)}
                  className="flex items-center gap-2 p-2 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 hover:border-indigo-400 dark:hover:border-indigo-500 text-left transition-colors"
                >
                  <span className="text-lg">{skill.icon}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">{skill.name}</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">{skill.category} &middot; score: {skill.quality_score}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Agent List */}
      {agents.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <p className="text-sm">No agents on this board yet.</p>
          <p className="text-xs mt-1">Add skills to enable AI agent tasks on cards.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {agents.map(agent => {
            const skill = agent.skill;
            return (
              <div
                key={agent.id}
                className={`p-3 rounded-lg border transition-all ${
                  agent.is_active
                    ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                    : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">{skill?.icon ?? '🤖'}</span>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{skill?.name ?? 'Unknown Skill'}</p>
                      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <span>{agent.total_executions} runs</span>
                        <span>&middot;</span>
                        <span>${agent.total_cost_usd.toFixed(2)} spent</span>
                        {agent.avg_quality_rating && (
                          <>
                            <span>&middot;</span>
                            <span>★ {agent.avg_quality_rating.toFixed(1)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Toggle active */}
                    <button
                      onClick={() => toggleAgent(agent.id, agent.is_active)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        agent.is_active ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                          agent.is_active ? 'translate-x-4.5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>

                    {/* Remove */}
                    <button
                      onClick={() => removeAgent(agent.id)}
                      className="text-gray-400 hover:text-red-500 transition-colors"
                      title="Remove from board"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
