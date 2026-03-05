'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PKAMDailyTask, PKAMDailyTaskType } from '@/lib/types';

interface AMDailyTasksTabProps {
  canManage: boolean;
}

interface DailyTasksResponse {
  date: string;
  can_manage: boolean;
  am_options: string[];
  tasks: PKAMDailyTask[];
}

const TASK_TYPE_LABELS: Record<PKAMDailyTaskType, string> = {
  fathom_watch: 'Fathom To Watch',
  action_items_send: 'Action Items To Send',
  client_update: 'Clients To Update',
};

function getLocalISODate() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function parseTaskLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export default function AMDailyTasksTab({ canManage }: AMDailyTasksTabProps) {
  const [date, setDate] = useState(getLocalISODate());
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workingTaskId, setWorkingTaskId] = useState<string | null>(null);

  const [tasks, setTasks] = useState<PKAMDailyTask[]>([]);
  const [amOptions, setAmOptions] = useState<string[]>([]);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [amName, setAmName] = useState('');
  const [fathomInput, setFathomInput] = useState('');
  const [actionItemsInput, setActionItemsInput] = useState('');
  const [clientUpdatesInput, setClientUpdatesInput] = useState('');
  const [sharedNotes, setSharedNotes] = useState('');

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setErrorText(null);

    try {
      const params = new URLSearchParams({
        date,
        includeCompleted: includeCompleted ? 'true' : 'false',
        limit: '1000',
      });

      const res = await fetch(`/api/performance/daily-tasks?${params.toString()}`);
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.error || 'Failed to load daily tasks');
      }

      const payload = json as DailyTasksResponse;
      setTasks(payload.tasks || []);
      setAmOptions(payload.am_options || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load daily tasks';
      setErrorText(msg);
    } finally {
      setLoading(false);
    }
  }, [date, includeCompleted]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const groupedTasks = useMemo(() => {
    const map = new Map<string, PKAMDailyTask[]>();
    for (const task of tasks) {
      const key = task.account_manager_name || 'Unassigned';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(task);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [tasks]);

  const resetFormInputs = () => {
    setFathomInput('');
    setActionItemsInput('');
    setClientUpdatesInput('');
    setSharedNotes('');
  };

  const handleCreateTasks = async () => {
    if (!canManage) return;
    const manager = amName.trim();
    if (!manager) {
      setErrorText('Account manager name is required.');
      return;
    }

    const parsedTasks: Array<{ task_type: PKAMDailyTaskType; task_label: string; notes?: string | null }> = [
      ...parseTaskLines(fathomInput).map((label) => ({ task_type: 'fathom_watch' as const, task_label: label })),
      ...parseTaskLines(actionItemsInput).map((label) => ({ task_type: 'action_items_send' as const, task_label: label })),
      ...parseTaskLines(clientUpdatesInput).map((label) => ({ task_type: 'client_update' as const, task_label: label })),
    ];

    if (parsedTasks.length === 0) {
      setErrorText('Add at least one task line before saving.');
      return;
    }

    setSaving(true);
    setErrorText(null);
    setStatusText(null);

    try {
      const res = await fetch('/api/performance/daily-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_date: date,
          account_manager_name: manager,
          notes: sharedNotes.trim() || null,
          tasks: parsedTasks,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || 'Failed to save daily tasks');
      }

      const insertedCount = typeof json.inserted === 'number' ? json.inserted : parsedTasks.length;
      setStatusText(`Saved ${insertedCount} task${insertedCount !== 1 ? 's' : ''} for ${manager}.`);
      resetFormInputs();
      await fetchTasks();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save daily tasks';
      setErrorText(msg);
    } finally {
      setSaving(false);
    }
  };

  const toggleTaskCompletion = async (task: PKAMDailyTask) => {
    if (!canManage) return;
    setWorkingTaskId(task.id);
    setErrorText(null);

    try {
      const res = await fetch(`/api/performance/daily-tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_completed: !task.is_completed }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || 'Failed to update task');
      }
      await fetchTasks();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update task';
      setErrorText(msg);
    } finally {
      setWorkingTaskId(null);
    }
  };

  const deleteTask = async (task: PKAMDailyTask) => {
    if (!canManage) return;
    setWorkingTaskId(task.id);
    setErrorText(null);

    try {
      const res = await fetch(`/api/performance/daily-tasks/${task.id}`, {
        method: 'DELETE',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || 'Failed to delete task');
      }
      await fetchTasks();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete task';
      setErrorText(msg);
    } finally {
      setWorkingTaskId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-white/5 rounded-2xl border border-cream-dark/60 dark:border-white/10 p-4">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-navy dark:text-white">AM Daily Task Planner</h3>
            <p className="text-xs text-navy/50 dark:text-white/40">
              These tasks are now the source for AM reminder notifications.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div>
              <label className="block text-xs font-medium text-navy/60 dark:text-white/50 mb-1">Task Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="px-3 py-2 rounded-lg border border-cream-dark/70 dark:border-white/15 bg-white dark:bg-white/5 text-sm text-navy dark:text-white"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-navy/60 dark:text-white/50 mt-5 md:mt-0">
              <input
                type="checkbox"
                checked={includeCompleted}
                onChange={(e) => setIncludeCompleted(e.target.checked)}
              />
              Show completed
            </label>
          </div>
        </div>
      </div>

      {canManage && (
        <div className="bg-white dark:bg-white/5 rounded-2xl border border-cream-dark/60 dark:border-white/10 p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-navy/60 dark:text-white/50 mb-1">Account Manager</label>
              <input
                list="am-name-options"
                type="text"
                value={amName}
                onChange={(e) => setAmName(e.target.value)}
                placeholder="Type account manager name"
                className="w-full px-3 py-2 rounded-lg border border-cream-dark/70 dark:border-white/15 bg-white dark:bg-white/5 text-sm text-navy dark:text-white"
              />
              <datalist id="am-name-options">
                {amOptions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-medium text-navy/60 dark:text-white/50 mb-1">Notes (optional)</label>
              <input
                type="text"
                value={sharedNotes}
                onChange={(e) => setSharedNotes(e.target.value)}
                placeholder="Optional context for all tasks in this save"
                className="w-full px-3 py-2 rounded-lg border border-cream-dark/70 dark:border-white/15 bg-white dark:bg-white/5 text-sm text-navy dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <TaskInputCard
              title="Fathom Items To Watch"
              placeholder="One item per line"
              value={fathomInput}
              onChange={setFathomInput}
            />
            <TaskInputCard
              title="Action Items To Send"
              placeholder="One item per line"
              value={actionItemsInput}
              onChange={setActionItemsInput}
            />
            <TaskInputCard
              title="Clients To Update"
              placeholder="One item per line"
              value={clientUpdatesInput}
              onChange={setClientUpdatesInput}
            />
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-navy/50 dark:text-white/40">
              Tip: each new line creates one reminder task.
            </p>
            <button
              onClick={handleCreateTasks}
              disabled={saving}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                saving
                  ? 'bg-navy/10 dark:bg-white/10 text-navy/40 dark:text-white/40 cursor-not-allowed'
                  : 'bg-electric text-white hover:bg-electric/90'
              }`}
            >
              {saving ? 'Saving...' : 'Save Daily Tasks'}
            </button>
          </div>
        </div>
      )}

      {statusText && (
        <div className="px-4 py-2 rounded-xl bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 text-sm text-green-700 dark:text-green-300">
          {statusText}
        </div>
      )}

      {errorText && (
        <div className="px-4 py-2 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-sm text-red-700 dark:text-red-300">
          {errorText}
        </div>
      )}

      <div className="bg-white dark:bg-white/5 rounded-2xl border border-cream-dark/60 dark:border-white/10 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-navy dark:text-white">Tasks For {date}</h3>
          <button
            onClick={fetchTasks}
            className="text-xs text-electric hover:text-electric/80 font-medium"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-navy/50 dark:text-white/40 py-6">Loading daily tasks...</p>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-navy/50 dark:text-white/40 py-6">No tasks found for this date.</p>
        ) : (
          <div className="space-y-4">
            {groupedTasks.map(([managerName, rows]) => (
              <div key={managerName} className="border border-cream-dark/50 dark:border-white/10 rounded-xl overflow-hidden">
                <div className="px-3 py-2 bg-cream-dark/30 dark:bg-white/5 text-sm font-medium text-navy dark:text-white">
                  {managerName}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-cream-dark/50 dark:border-white/10">
                        <th className="text-left px-3 py-2 text-xs font-medium text-navy/60 dark:text-white/50">Type</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-navy/60 dark:text-white/50">Task</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-navy/60 dark:text-white/50">Status</th>
                        {canManage && (
                          <th className="text-right px-3 py-2 text-xs font-medium text-navy/60 dark:text-white/50">Actions</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((task) => (
                        <tr key={task.id} className="border-b border-cream-dark/30 dark:border-white/5 last:border-0">
                          <td className="px-3 py-2 text-xs text-navy/70 dark:text-white/60">
                            {TASK_TYPE_LABELS[task.task_type]}
                          </td>
                          <td className="px-3 py-2 text-sm text-navy dark:text-white">
                            <div>{task.task_label}</div>
                            {task.notes && (
                              <div className="text-xs text-navy/50 dark:text-white/40 mt-0.5">{task.notes}</div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                              task.is_completed
                                ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400'
                                : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400'
                            }`}>
                              {task.is_completed ? 'Completed' : 'Pending'}
                            </span>
                          </td>
                          {canManage && (
                            <td className="px-3 py-2">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => toggleTaskCompletion(task)}
                                  disabled={workingTaskId === task.id}
                                  className="text-xs px-2 py-1 rounded border border-cream-dark/70 dark:border-white/20 text-navy/70 dark:text-white/70 hover:bg-cream-dark/30 dark:hover:bg-white/10"
                                >
                                  {task.is_completed ? 'Mark Pending' : 'Mark Done'}
                                </button>
                                <button
                                  onClick={() => deleteTask(task)}
                                  disabled={workingTaskId === task.id}
                                  className="text-xs px-2 py-1 rounded border border-red-300 dark:border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TaskInputCard({
  title,
  placeholder,
  value,
  onChange,
}: {
  title: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="rounded-xl border border-cream-dark/60 dark:border-white/10 p-3">
      <p className="text-xs font-medium text-navy/70 dark:text-white/60 mb-2">{title}</p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={8}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-cream-dark/70 dark:border-white/15 bg-white dark:bg-white/5 text-sm text-navy dark:text-white resize-y"
      />
    </div>
  );
}
