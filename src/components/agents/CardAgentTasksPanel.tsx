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

// ─── Models ──────────────────────────────────────────────────────────────────
const AGENT_MODELS = [
  // Anthropic
  { id: 'claude-haiku-4-5-20251001',  label: 'Haiku (fast)',      provider: 'anthropic' as const },
  { id: 'claude-sonnet-4-5-20250929', label: 'Sonnet',            provider: 'anthropic' as const },
  { id: 'claude-opus-4-6',            label: 'Opus (best)',       provider: 'anthropic' as const },
  // OpenAI
  { id: 'gpt-4o-mini',                label: 'GPT-4o mini',       provider: 'openai' as const },
  { id: 'gpt-4o',                     label: 'GPT-4o',            provider: 'openai' as const },
  { id: 'o3-mini',                    label: 'o3 mini (5.2)',     provider: 'openai' as const },
  { id: 'o3',                         label: 'o3 (5.3)',          provider: 'openai' as const },
  // Google — Gemini 3 family
  { id: 'gemini-3.1-pro-preview',             label: 'Gemini 3.1 Pro (reasoning/coding)', provider: 'google' as const },
  { id: 'gemini-3.1-pro-preview-customtools', label: 'Gemini 3.1 Pro (custom tools)',     provider: 'google' as const },
  { id: 'gemini-3-pro-preview',               label: 'Gemini 3 Pro (multimodal)',          provider: 'google' as const },
  { id: 'gemini-3-flash-preview',             label: 'Gemini 3 Flash (fast)',              provider: 'google' as const },
  // Google — Gemini 2.5 family
  { id: 'gemini-2.5-pro',                     label: 'Gemini 2.5 Pro',                     provider: 'google' as const },
  { id: 'gemini-2.5-flash',                   label: 'Gemini 2.5 Flash',                   provider: 'google' as const },
  { id: 'gemini-2.5-flash-lite',              label: 'Gemini 2.5 Flash Lite (fastest)',    provider: 'google' as const },
] as const;

// ─── Chat types ──────────────────────────────────────────────────────────────
interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

interface ChatState {
  taskId: string;
  skillId: string;
  model: string;
  messages: ChatMsg[];
  // History passed to /api/agents/run for multi-turn (excludes current streaming msg)
  history: { role: 'user' | 'assistant'; content: string }[];
  phase: 'planning' | 'executing' | 'done';
  streaming: boolean;
  error: string | null;
}

// Keywords that trigger actual execution
const RUN_TRIGGERS = /^\s*(go|run|start|yes|ok|okay|do it|proceed|confirm|execute|sure|כן|בצע|התחל|המשך)\s*[.!]?\s*$/i;

export default function CardAgentTasksPanel({ cardId }: Props) {
  const [tasks, setTasks] = useState<CardAgentTask[]>([]);
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedSkillId, setSelectedSkillId] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskPrompt, setTaskPrompt] = useState('');
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  // Legacy running state (kept for actual execution streaming)
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  // Chat states per task
  const [chatStates, setChatStates] = useState<Record<string, ChatState>>({});
  const [chatInputs, setChatInputs] = useState<Record<string, string>>({});
  const chatEndRefs = useRef<Record<string, HTMLDivElement | null>>({});
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
        // Auto-open planning chat immediately after creating the task
        startChat(json.data);
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

  // ── Chat helpers ──────────────────────────────────────────────────────────

  const scrollChatToBottom = (taskId: string) => {
    setTimeout(() => {
      const el = chatEndRefs.current[taskId];
      el?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  };

  const updateChat = (taskId: string, updater: (prev: ChatState) => ChatState) => {
    setChatStates(prev => {
      const current = prev[taskId];
      if (!current) return prev;
      return { ...prev, [taskId]: updater(current) };
    });
  };

  /** Stream from /api/agents/run (planning or follow-up chat) */
  const streamAgentMessage = async (
    taskId: string,
    skillId: string,
    message: string,
    history: { role: 'user' | 'assistant'; content: string }[],
    isPlanningMode: boolean,
    modelOverride?: string,
  ) => {
    // Add streaming placeholder for assistant
    updateChat(taskId, s => ({
      ...s,
      messages: [...s.messages, { role: 'assistant', content: '', isStreaming: true }],
      streaming: true,
      error: null,
    }));

    try {
      const res = await fetch('/api/agents/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skill_id: skillId,
          input_message: message,
          card_id: cardId,
          planning_mode: isPlanningMode,
          conversation_history: history,
          model_override: modelOverride,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buf = '';
      let event = '';
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            event = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (event === 'token' && data.text) {
                accumulated += data.text;
                updateChat(taskId, s => ({
                  ...s,
                  messages: s.messages.map((m, i) =>
                    i === s.messages.length - 1 ? { ...m, content: accumulated } : m
                  ),
                }));
                scrollChatToBottom(taskId);
              } else if (event === 'complete') {
                updateChat(taskId, s => ({
                  ...s,
                  messages: s.messages.map((m, i) =>
                    i === s.messages.length - 1 ? { ...m, content: accumulated, isStreaming: false } : m
                  ),
                  history: [
                    ...s.history,
                    { role: 'user', content: message },
                    { role: 'assistant', content: accumulated },
                  ],
                  streaming: false,
                }));
              } else if (event === 'error') {
                throw new Error(data.error || 'Agent error');
              }
            } catch (parseErr: any) {
              if (parseErr?.message !== 'Agent error') return; // ignore JSON parse errors
              throw parseErr;
            }
          }
        }
      }
    } catch (err: any) {
      updateChat(taskId, s => ({
        ...s,
        messages: s.messages.map((m, i) =>
          i === s.messages.length - 1
            ? { ...m, content: m.content || 'Error: ' + err.message, isStreaming: false }
            : m
        ),
        streaming: false,
        error: err.message,
      }));
    } finally {
      // Always clear streaming state — guards against stream ending without a 'complete' event
      updateChat(taskId, s => {
        if (!s.streaming) return s; // already cleared
        return {
          ...s,
          streaming: false,
          messages: s.messages.map((m, i) =>
            i === s.messages.length - 1 ? { ...m, isStreaming: false } : m
          ),
        };
      });
    }
  };

  /** Stream actual task execution into the chat */
  const executeActualTask = async (taskId: string) => {
    updateChat(taskId, s => ({
      ...s,
      phase: 'executing',
      messages: [...s.messages, { role: 'assistant', content: '⚙️ Running…', isStreaming: true }],
      streaming: true,
    }));
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
      let buf = '';
      let event = '';
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            event = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (event === 'token' && data.text) {
                accumulated += data.text;
                updateChat(taskId, s => ({
                  ...s,
                  messages: s.messages.map((m, i) =>
                    i === s.messages.length - 1 ? { ...m, content: accumulated } : m
                  ),
                }));
                scrollChatToBottom(taskId);
              } else if (event === 'tool_call') {
                accumulated += `\n\`[${data.name}]\``;
                updateChat(taskId, s => ({
                  ...s,
                  messages: s.messages.map((m, i) =>
                    i === s.messages.length - 1 ? { ...m, content: accumulated } : m
                  ),
                }));
              } else if (event === 'complete') {
                updateChat(taskId, s => ({
                  ...s,
                  phase: 'done',
                  messages: s.messages.map((m, i) =>
                    i === s.messages.length - 1 ? { ...m, content: accumulated, isStreaming: false } : m
                  ),
                  streaming: false,
                }));
                setTasks(prev => prev.map(t =>
                  t.id === taskId ? { ...t, status: 'completed', output_preview: data.output_preview } : t
                ));
              } else if (event === 'error') {
                throw new Error(data.error || 'Execution failed');
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      updateChat(taskId, s => ({
        ...s,
        phase: 'done',
        messages: s.messages.map((m, i) =>
          i === s.messages.length - 1
            ? { ...m, content: 'Error: ' + err.message, isStreaming: false }
            : m
        ),
        streaming: false,
        error: err.message,
      }));
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'failed' } : t));
    }
  };

  /** Open planning chat for a task */
  const startChat = (task: CardAgentTask) => {
    const skillId = task.skill_id;
    const planningMsg = task.input_prompt
      ? `Task: "${task.title}"\nInstructions: ${task.input_prompt}`
      : `Task: "${task.title}"`;

    const initialState: ChatState = {
      taskId: task.id,
      skillId,
      model: AGENT_MODELS[1].id, // sonnet default
      messages: [{ role: 'user', content: planningMsg }],
      history: [],
      phase: 'planning',
      streaming: true,
      error: null,
    };

    setChatStates(prev => ({ ...prev, [task.id]: initialState }));
    setExpandedTask(task.id);

    streamAgentMessage(task.id, skillId, planningMsg, [], true, initialState.model);
  };

  /** Handle user typing in the chat input and sending */
  const sendChatMessage = async (taskId: string) => {
    const cs = chatStates[taskId];
    const input = (chatInputs[taskId] ?? '').trim();
    if (!cs || !input || cs.streaming) return;

    // Clear input
    setChatInputs(prev => ({ ...prev, [taskId]: '' }));

    // Add user message to chat
    updateChat(taskId, s => ({
      ...s,
      messages: [...s.messages, { role: 'user', content: input }],
    }));
    scrollChatToBottom(taskId);

    // Check if user is triggering execution
    if (RUN_TRIGGERS.test(input)) {
      await executeActualTask(taskId);
    } else {
      // Continue planning conversation
      await streamAgentMessage(taskId, cs.skillId, input, cs.history, true, cs.model);
    }
  };

  // Keep runTask for legacy fallback (unused now but preserved)
  const runTask = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (task) startChat(task);
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
              {/* Task header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base shrink-0">{task.skill?.icon ?? '🤖'}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{task.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{task.skill?.name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <StatusBadge status={chatStates[task.id] ? (chatStates[task.id].phase === 'executing' ? 'running' : task.status) : task.status} />
                  {/* Run / Chat button — opens planning chat */}
                  {!chatStates[task.id] && (task.status === 'pending' || task.status === 'failed' || task.status === 'completed') && (
                    <button
                      onClick={() => startChat(task)}
                      className="text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors"
                      title="Run with planning chat"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </button>
                  )}
                  {/* Close chat */}
                  {chatStates[task.id] && chatStates[task.id].phase !== 'executing' && (
                    <button
                      onClick={() => setChatStates(prev => { const n = { ...prev }; delete n[task.id]; return n; })}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors text-xs"
                      title="Close chat"
                    >✕</button>
                  )}
                  {/* Delete button */}
                  <button
                    onClick={() => deleteTask(task.id)}
                    disabled={chatStates[task.id]?.streaming}
                    className="text-gray-400 hover:text-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title="Delete task"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* ── CHAT INTERFACE ─────────────────────────────────────── */}
              {chatStates[task.id] && (() => {
                const cs = chatStates[task.id];
                return (
                  <div className="mt-3 flex flex-col gap-2">
                    {/* Phase banner + model selector */}
                    <div className="flex items-center gap-2">
                      <div className={`flex-1 text-xs px-2 py-1 rounded font-medium ${
                        cs.phase === 'planning'
                          ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                          : cs.phase === 'executing'
                          ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                          : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                      }`}>
                        {cs.phase === 'planning' && '💬 Planning — reply to answer questions, or type "go" to start'}
                        {cs.phase === 'executing' && '⚙️ Running the task…'}
                        {cs.phase === 'done' && '✅ Done'}
                      </div>
                      {cs.phase !== 'executing' && (
                        <select
                          value={cs.model}
                          onChange={e => updateChat(task.id, s => ({ ...s, model: e.target.value }))}
                          disabled={cs.streaming}
                          className="text-[10px] rounded px-1.5 py-0.5 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none shrink-0"
                        >
                          <optgroup label="Anthropic">
                            {AGENT_MODELS.filter(m => m.provider === 'anthropic').map(m => (
                              <option key={m.id} value={m.id}>{m.label}</option>
                            ))}
                          </optgroup>
                          <optgroup label="OpenAI">
                            {AGENT_MODELS.filter(m => m.provider === 'openai').map(m => (
                              <option key={m.id} value={m.id}>{m.label}</option>
                            ))}
                          </optgroup>
                          <optgroup label="Google">
                            {AGENT_MODELS.filter(m => m.provider === 'google').map(m => (
                              <option key={m.id} value={m.id}>{m.label}</option>
                            ))}
                          </optgroup>
                        </select>
                      )}
                    </div>

                    {/* Messages */}
                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 max-h-72 overflow-y-auto p-2 space-y-2 text-sm">
                      {cs.messages.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] px-3 py-2 rounded-xl text-xs whitespace-pre-wrap ${
                            msg.role === 'user'
                              ? 'bg-indigo-600 text-white rounded-br-sm'
                              : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 rounded-bl-sm'
                          }`}>
                            {msg.content}
                            {msg.isStreaming && <span className="animate-pulse ml-1">▌</span>}
                          </div>
                        </div>
                      ))}
                      <div ref={el => { chatEndRefs.current[task.id] = el; }} />
                    </div>

                    {/* Input — only during planning phase */}
                    {cs.phase === 'planning' && (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={chatInputs[task.id] ?? ''}
                          onChange={e => setChatInputs(prev => ({ ...prev, [task.id]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(task.id); } }}
                          placeholder={cs.streaming ? 'Waiting for agent…' : 'Reply, or type "go" to start…'}
                          disabled={cs.streaming}
                          className="flex-1 px-3 py-2 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <button
                          onClick={() => sendChatMessage(task.id)}
                          disabled={cs.streaming || !(chatInputs[task.id] ?? '').trim()}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          Send
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Rating (completed tasks without active chat) */}
              {task.status === 'completed' && !chatStates[task.id] && (
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
