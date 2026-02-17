'use client';

import { useState, useRef, useEffect } from 'react';
import { BoardFilter, Label } from '@/lib/types';

interface FilterDropdownProps {
  filter: BoardFilter;
  onFilterChange: (filter: BoardFilter) => void;
  labels: Label[];
  boardId: string;
  isDark?: boolean;
}

const PRIORITIES = [
  { value: 'urgent', label: 'Urgent', color: 'bg-red-500' },
  { value: 'high', label: 'High', color: 'bg-orange-500' },
  { value: 'medium', label: 'Medium', color: 'bg-yellow-500' },
  { value: 'low', label: 'Low', color: 'bg-green-500' },
];

const DUE_OPTIONS = [
  { value: 'overdue', label: 'Overdue' },
  { value: 'due_soon', label: 'Due in 24h' },
  { value: 'no_date', label: 'No due date' },
];

export default function FilterDropdown({ filter, onFilterChange, labels, isDark }: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const activeCount =
    filter.labels.length +
    filter.members.length +
    filter.priority.length +
    (filter.dueDate ? 1 : 0);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const toggleLabel = (id: string) => {
    const next = filter.labels.includes(id)
      ? filter.labels.filter((l) => l !== id)
      : [...filter.labels, id];
    onFilterChange({ ...filter, labels: next });
  };

  const togglePriority = (p: string) => {
    const next = filter.priority.includes(p)
      ? filter.priority.filter((v) => v !== p)
      : [...filter.priority, p];
    onFilterChange({ ...filter, priority: next });
  };

  const setDueDate = (val: string) => {
    onFilterChange({
      ...filter,
      dueDate: filter.dueDate === val ? null : (val as BoardFilter['dueDate']),
    });
  };

  const clearAll = () => {
    onFilterChange({ labels: [], members: [], priority: [], dueDate: null });
  };

  const btnClass = isDark
    ? 'text-white/70 hover:text-white hover:bg-white/10'
    : 'text-navy/40 dark:text-slate-400 hover:text-navy dark:hover:text-white hover:bg-cream-dark dark:hover:bg-slate-800';

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Filter cards"
        className={`p-2 rounded-lg transition-colors relative ${btnClass}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
        </svg>
        {activeCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-electric text-white text-[10px] font-bold flex items-center justify-center">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 w-64 bg-white dark:bg-dark-surface rounded-xl shadow-modal border border-cream-dark dark:border-slate-700 z-50 p-3 max-h-[400px] overflow-y-auto scrollbar-thin">
          {/* Labels */}
          {labels.length > 0 && (
            <div className="mb-3">
              <p className="text-[11px] font-semibold text-navy/40 dark:text-slate-500 uppercase tracking-wider mb-2">Labels</p>
              <div className="space-y-1">
                {labels.map((label) => (
                  <button
                    key={label.id}
                    onClick={() => toggleLabel(label.id)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors ${
                      filter.labels.includes(label.id)
                        ? 'bg-electric/10 text-electric'
                        : 'text-navy dark:text-slate-200 hover:bg-cream-dark dark:hover:bg-slate-700'
                    }`}
                  >
                    <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: label.color }} />
                    <span className="truncate">{label.name}</span>
                    {filter.labels.includes(label.id) && (
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="ml-auto shrink-0">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Priority */}
          <div className="mb-3">
            <p className="text-[11px] font-semibold text-navy/40 dark:text-slate-500 uppercase tracking-wider mb-2">Priority</p>
            <div className="space-y-1">
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  onClick={() => togglePriority(p.value)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors ${
                    filter.priority.includes(p.value)
                      ? 'bg-electric/10 text-electric'
                      : 'text-navy dark:text-slate-200 hover:bg-cream-dark dark:hover:bg-slate-700'
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${p.color}`} />
                  {p.label}
                  {filter.priority.includes(p.value) && (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="ml-auto shrink-0">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Due Date */}
          <div className="mb-3">
            <p className="text-[11px] font-semibold text-navy/40 dark:text-slate-500 uppercase tracking-wider mb-2">Due Date</p>
            <div className="space-y-1">
              {DUE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setDueDate(opt.value)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors ${
                    filter.dueDate === opt.value
                      ? 'bg-electric/10 text-electric'
                      : 'text-navy dark:text-slate-200 hover:bg-cream-dark dark:hover:bg-slate-700'
                  }`}
                >
                  {opt.label}
                  {filter.dueDate === opt.value && (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="ml-auto shrink-0">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Clear */}
          {activeCount > 0 && (
            <button
              onClick={clearAll}
              className="w-full py-2 text-sm text-navy/50 dark:text-slate-400 hover:text-danger transition-colors rounded-lg"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
