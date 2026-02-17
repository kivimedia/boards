'use client';

import { useState, useEffect, useRef } from 'react';
import { Label } from '@/lib/types';

interface CardQuickEditProps {
  cardId: string;
  boardId: string;
  currentLabels: Label[];
  currentPriority: string;
  currentDueDate: string | null;
  onRefresh: () => void;
  onClose: () => void;
}

const PRIORITIES = [
  { value: 'urgent', label: 'Urgent', color: 'bg-red-500' },
  { value: 'high', label: 'High', color: 'bg-orange-500' },
  { value: 'medium', label: 'Medium', color: 'bg-yellow-500' },
  { value: 'low', label: 'Low', color: 'bg-green-500' },
  { value: 'none', label: 'None', color: 'bg-gray-400' },
];

type Section = 'main' | 'labels' | 'priority' | 'due_date';

export default function CardQuickEdit({
  cardId,
  boardId,
  currentLabels,
  currentPriority,
  currentDueDate,
  onRefresh,
  onClose,
}: CardQuickEditProps) {
  const [section, setSection] = useState<Section>('main');
  const [boardLabels, setBoardLabels] = useState<Label[]>([]);
  const [dueDate, setDueDate] = useState(currentDueDate?.split('T')[0] || '');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handle);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  useEffect(() => {
    if (section === 'labels') {
      fetch(`/api/boards/${boardId}/labels`)
        .then((r) => r.json())
        .then((d) => setBoardLabels(d.data || d || []))
        .catch(() => {});
    }
  }, [section, boardId]);

  const toggleLabel = async (labelId: string) => {
    await fetch(`/api/cards/${cardId}/labels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label_id: labelId }),
    });
    onRefresh();
  };

  const setPriority = async (priority: string) => {
    await fetch(`/api/cards/${cardId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priority }),
    });
    onRefresh();
    setSection('main');
  };

  const saveDueDate = async () => {
    await fetch(`/api/cards/${cardId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ due_date: dueDate || null }),
    });
    onRefresh();
    setSection('main');
  };

  const currentLabelIds = currentLabels.map((l) => l.id);

  return (
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      className="absolute right-0 top-0 z-20 w-48 bg-white dark:bg-dark-surface rounded-xl shadow-modal border border-cream-dark dark:border-slate-700 py-1.5"
    >
      {section === 'main' && (
        <>
          <button onClick={() => setSection('labels')} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-navy dark:text-slate-100 hover:bg-cream-dark dark:hover:bg-slate-700 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
            Labels
          </button>
          <button onClick={() => setSection('priority')} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-navy dark:text-slate-100 hover:bg-cream-dark dark:hover:bg-slate-700 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
            Priority
          </button>
          <button onClick={() => setSection('due_date')} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-navy dark:text-slate-100 hover:bg-cream-dark dark:hover:bg-slate-700 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Due Date
          </button>
        </>
      )}

      {section === 'labels' && (
        <div className="px-2">
          <button onClick={() => setSection('main')} className="flex items-center gap-1 px-1 py-1.5 text-[11px] text-navy/40 dark:text-slate-500 hover:text-navy dark:hover:text-white mb-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            Back
          </button>
          {boardLabels.map((label) => (
            <button
              key={label.id}
              onClick={() => toggleLabel(label.id)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors ${
                currentLabelIds.includes(label.id)
                  ? 'bg-electric/10 text-electric'
                  : 'text-navy dark:text-slate-200 hover:bg-cream-dark dark:hover:bg-slate-700'
              }`}
            >
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: label.color }} />
              <span className="truncate">{label.name}</span>
              {currentLabelIds.includes(label.id) && (
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="ml-auto"><polyline points="20 6 9 17 4 12"/></svg>
              )}
            </button>
          ))}
        </div>
      )}

      {section === 'priority' && (
        <div className="px-2">
          <button onClick={() => setSection('main')} className="flex items-center gap-1 px-1 py-1.5 text-[11px] text-navy/40 dark:text-slate-500 hover:text-navy dark:hover:text-white mb-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            Back
          </button>
          {PRIORITIES.map((p) => (
            <button
              key={p.value}
              onClick={() => setPriority(p.value)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors ${
                currentPriority === p.value
                  ? 'bg-electric/10 text-electric'
                  : 'text-navy dark:text-slate-200 hover:bg-cream-dark dark:hover:bg-slate-700'
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${p.color}`} />
              {p.label}
            </button>
          ))}
        </div>
      )}

      {section === 'due_date' && (
        <div className="px-3 py-2">
          <button onClick={() => setSection('main')} className="flex items-center gap-1 px-0 py-1.5 text-[11px] text-navy/40 dark:text-slate-500 hover:text-navy dark:hover:text-white mb-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            Back
          </button>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full px-2 py-1.5 rounded-lg text-sm bg-cream dark:bg-slate-800 border border-cream-dark dark:border-slate-700 text-navy dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-electric/30 mb-2"
          />
          <div className="flex gap-2">
            <button onClick={saveDueDate} className="flex-1 py-1.5 rounded-lg text-xs font-medium bg-electric text-white hover:bg-electric/90 transition-colors">Save</button>
            {dueDate && (
              <button
                onClick={() => { setDueDate(''); saveDueDate(); }}
                className="py-1.5 px-2 rounded-lg text-xs text-navy/50 dark:text-slate-400 hover:text-danger transition-colors"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
