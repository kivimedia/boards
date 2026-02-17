'use client';

import { useState, useEffect, useRef } from 'react';
import type { AgentSkill, CardAgentTask } from '@/lib/types';

// ============================================================================
// CARD AGENT TASKS PANEL
// Shows agent tasks on a card (inside CardModal)
// ============================================================================

interface Props {
  cardId: string;
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string; bg: string }> = {
    pending: { label: 'Pending', color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-100 dark:bg-gray-700' },
    running: { label: 'Running', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30' },
    completed: { label: 'Done', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
    failed: { label: 'Failed', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30' },
    cancelled: { label: 'Cancelled', color: 'text-gray-500 dark:text-gray-500', bg: 'bg-gray-100 dark:bg-gray-800' },
  };
  const c = config[status] ?? config.pending;

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.color}`}>
      {status === 'running' && <span className="animate-pulse mr-1">●</span>}
      {c.label}
    </span>
  );
}

function StarRating({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (rating: number) => void;
}) {
  const [hover, setHover] = useState(0);

  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(star)}
          className="text-lg transition-colors"
        >
          <span className={star <= (hover || value || 0) ? 'text-amber-400' : 'text-gray-300 dark:text-gray-600'}>
            ★
          </span>
        </button>
      ))}
    </div>
  );
}

export default function CardAgentTasksPanel({ cardId }: Props) {
  const [tasks, setTasks] = useState<CardAgentTask[]>([]);
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedSkillId, setSelectedSkillId] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskPrompt, setTaskPrompt] = useState('');
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const [streamingOutput, setStreamingOutput] = useState('');
  const [runError, setRunError] = useState<string | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchTasks();
    fetchSkills();
  }, [cardId]);

  const fetchTasks = async () => {
    try {
      const res = await fetch(`/api/cards/${cardId}/agent-tasks`);
      const json = await res.json();
      setTasks(json.data ?? []);
    } catch (err) {
      console.error('Failed to fetch agent tasks:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSkills = async () => {
    try {
      const res = await fetch('/api/agents/skills');
      const json = await res.json();
      setSkills(json.data ?? []);
    } catch (err) {
      console.error('Failed to fetch skills:', err);
    }
  };

  const addTask = async () => {
    if (!selectedSkillId || !taskTitle) return;

    try {
      const res = await fetch(`/api/cards/${cardId}/agent-tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skill_id: selectedSkillId,
          title: taskTitle,
          input_prompt: taskPrompt || undefined,
        }),
      });
      const json = await res.json();
      if (json.data) {
        setTasks(prev => [...prev, json.data]);
        setShowAddForm(false);
        setSelectedSkillId('');
        setTaskTitle('');
        setTaskPrompt('');
      }
    } catch (err) {
      console.error('Failed to add task:', err);
    }
  };

  const rateTask = async (taskId: string, rating: number) => {
    try {
      await fetch(`/api/cards/${cardId}/agent-tasks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId, quality_rating: rating }),
      });
      setTasks(prev =>
        prev.map(t => (t.id === taskId ? { ...t, quality_rating: rating } : t))
      );
    } catch (err) {
      console.error('Failed to rate task:', err);
    }
  };

  const deleteTask = async (taskId: string) => {
    try {
      await fetch(`/api/cards/${cardId}/agent-tasks?task_id=${taskId}`, {
        method: 'DELETE',
      });
      setTasks(prev => prev.filter(t => t.id !== taskId));
    } catch (err) {
      console.error('Failed to delete task:', err);
    }
  };

  const runTask = async (taskId: string) => {
    setRunningTaskId(taskId);
    setStreamingOutput('');
    setRunError(null);
    setExpandedTask(taskId);

    // Update local state to running
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'running' } : t));

    try {
      const res = await fetch(`/api/cards/${cardId}/agent-tasks/${taskId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({ error: 'Run failed' }));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }

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
            const rawData = line.slice(6);
            try {
              const data = JSON.parse(rawData);

              if (currentEvent === 'token' && data.text) {
                accumulated += data.text;
                setStreamingOutput(accumulated);
                // Auto-scroll
                if (outputRef.current) {
                  outputRef.current.scrollTop = outputRef.current.scrollHeight;
                }
              } else if (currentEvent === 'tool_call') {
                // Show tool call indicator in output
                accumulated += `\n[Tool: ${data.name}] `;
                setStreamingOutput(accumulated);
              } else if (currentEvent === 'tool_result') {
                accumulated += data.success ? 'done' : 'failed';
                accumulated += '\n';
                setStreamingOutput(accumulated);
              } else if (currentEvent === 'thinking') {
                // Brief indicator
              } else if (currentEvent === 'confirm') {
                accumulated += `\n[Confirmation needed: ${data.message}]\n`;
                setStreamingOutput(accumulated);
              } else if (currentEvent === 'complete') {
                setTasks(prev => prev.map(t =>
                  t.id === taskId
                    ? { ...t, status: 'completed', output_preview: data.output_preview, output_full: accumulated }
                    : t
                ));
              } else if (currentEvent === 'error' && data.error) {
                setRunError(data.error);
                setTasks(prev => prev.map(t =>
                  t.id === taskId ? { ...t, status: 'failed' } : t
                ));
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      setRunError(err.message);
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'failed' } : t));
    } finally {
      setRunningTaskId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <span>🤖</span> Agent Tasks
          {tasks.length > 0 && (
            <span className="text-xs text-gray-500 dark:text-gray-400 font-normal">({tasks.length})</span>
          )}
        </h3>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="text-xs px-2.5 py-1 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          + Add Task
        </button>
      </div>

      {/* Add Task Form */}
      {showAddForm && (
        <div className="p-3 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 space-y-2">
          <select
            value={selectedSkillId}
            onChange={e => {
              setSelectedSkillId(e.target.value);
              const skill = skills.find(s => s.id === e.target.value);
              if (skill && !taskTitle) {
                setTaskTitle(`Run ${skill.name}`);
              }
            }}
            className="w-full px-2.5 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          >
            <option value="">Select a skill...</option>
            {skills.map(s => (
              <option key={s.id} value={s.id}>
                {s.icon} {s.name} ({s.quality_tier})
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Task title..."
            value={taskTitle}
            onChange={e => setTaskTitle(e.target.value)}
            className="w-full px-2.5 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />

          <textarea
            placeholder="Instructions for the agent (optional)..."
            value={taskPrompt}
            onChange={e => setTaskPrompt(e.target.value)}
            rows={2}
            className="w-full px-2.5 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />

          <div className="flex gap-2">
            <button
              onClick={addTask}
              disabled={!selectedSkillId || !taskTitle}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Add Task
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Task List */}
      {tasks.length === 0 ? (
        <div className="text-center py-6 text-gray-500 dark:text-gray-400">
          <p className="text-sm">No agent tasks yet.</p>
          <p className="text-xs mt-1">Add tasks to run AI skills on this card.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map(task => (
            <div
              key={task.id}
              className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base shrink-0">{task.skill?.icon ?? '🤖'}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{task.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{task.skill?.name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <StatusBadge status={task.status} />
                  {/* Run button */}
                  {(task.status === 'pending' || task.status === 'failed') && (
                    <button
                      onClick={() => runTask(task.id)}
                      disabled={runningTaskId !== null}
                      className="text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      title="Run agent"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </button>
                  )}
                  {/* Delete button */}
                  <button
                    onClick={() => deleteTask(task.id)}
                    disabled={task.status === 'running'}
                    className="text-gray-400 hover:text-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title="Delete task"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Streaming output (while running) */}
              {task.id === runningTaskId && streamingOutput && (
                <div className="mt-2">
                  <p className="text-xs text-blue-600 dark:text-blue-400 mb-1 flex items-center gap-1">
                    <span className="animate-pulse">●</span> Streaming output...
                  </p>
                  <div
                    ref={outputRef}
                    className="p-2 rounded bg-gray-50 dark:bg-gray-900/50 text-xs text-gray-700 dark:text-gray-300 max-h-60 overflow-y-auto whitespace-pre-wrap font-mono"
                  >
                    {streamingOutput}
                    <span className="animate-pulse">|</span>
                  </div>
                </div>
              )}

              {/* Error message */}
              {task.id === expandedTask && runError && task.status === 'failed' && (
                <div className="mt-2 p-2 rounded bg-red-50 dark:bg-red-900/20 text-xs text-red-600 dark:text-red-400">
                  {runError}
                </div>
              )}

              {/* Output preview (after completion) */}
              {task.output_preview && task.id !== runningTaskId && (
                <div className="mt-2">
                  <button
                    onClick={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    {expandedTask === task.id ? 'Collapse output' : 'View output'}
                  </button>
                  {expandedTask === task.id && (
                    <div className="mt-1 p-2 rounded bg-gray-50 dark:bg-gray-900/50 text-xs text-gray-700 dark:text-gray-300 max-h-60 overflow-y-auto whitespace-pre-wrap font-mono">
                      {task.output_full || task.output_preview}
                    </div>
                  )}
                </div>
              )}

              {/* Rating */}
              {task.status === 'completed' && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Rate output:</span>
                  <StarRating
                    value={task.quality_rating}
                    onChange={(rating) => rateTask(task.id, rating)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
