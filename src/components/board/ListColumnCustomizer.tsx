'use client';

import { useState, useRef, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

// Column labels - must match keys used in useListColumns and ListView
export const COLUMN_LABELS: Record<string, string> = {
  title: 'Title',
  status: 'Status (List)',
  priority: 'Priority',
  due_date: 'Due Date',
  assignees: 'Assignees',
  labels: 'Labels',
  start_date: 'Start Date',
  created_at: 'Created',
  updated_at: 'Last Updated',
  approval_status: 'Approval',
  comments: 'Comments',
  attachments: 'Attachments',
  checklist: 'Checklist',
  is_mirror: 'Mirrored',
};

interface ListColumnCustomizerProps {
  allColumns: string[];
  isVisible: (key: string) => boolean;
  toggleColumn: (key: string) => void;
  moveColumn: (key: string, direction: 'up' | 'down') => void;
  reorderColumn?: (fromIndex: number, toIndex: number) => void;
  resetToDefault: () => void;
  isDefault: boolean;
}

export default function ListColumnCustomizer({
  allColumns,
  isVisible,
  toggleColumn,
  moveColumn,
  reorderColumn,
  resetToDefault,
  isDefault,
}: ListColumnCustomizerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const visibleCount = allColumns.filter(isVisible).length;

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const from = result.source.index;
    const to = result.destination.index;
    if (from === to) return;
    if (reorderColumn) {
      reorderColumn(from, to);
    }
  };

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className={`
          flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all
          ${open
            ? 'bg-electric/10 text-electric dark:bg-electric/20'
            : 'bg-cream-dark/50 dark:bg-slate-700/50 text-navy/60 dark:text-slate-400 hover:bg-cream-dark dark:hover:bg-slate-700 hover:text-navy dark:hover:text-slate-200'
          }
        `}
        title="Choose columns"
      >
        {/* Columns icon */}
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="18" rx="1" />
          <rect x="14" y="3" width="7" height="18" rx="1" />
        </svg>
        Columns
        {!isDefault && (
          <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-electric text-white text-[10px] font-bold leading-none">
            {visibleCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full right-0 mt-2 w-72 bg-white dark:bg-dark-surface rounded-xl shadow-modal border border-cream-dark dark:border-slate-700 z-50 overflow-hidden">
          {/* Header */}
          <div className="px-4 pt-3 pb-2 border-b border-cream-dark/50 dark:border-slate-700/50">
            <p className="text-[11px] font-semibold text-navy/40 dark:text-slate-500 uppercase tracking-wider font-heading">
              Columns
            </p>
          </div>

          {/* Column list with DnD */}
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="column-customizer">
              {(droppableProvided) => (
                <div
                  ref={droppableProvided.innerRef}
                  {...droppableProvided.droppableProps}
                  className="max-h-[380px] overflow-y-auto scrollbar-thin py-1"
                >
                  {allColumns.map((key, idx) => {
                    const label = COLUMN_LABELS[key] || key;
                    const visible = isVisible(key);

                    return (
                      <Draggable key={key} draggableId={`col-${key}`} index={idx}>
                        {(draggableProvided, snapshot) => (
                          <div
                            ref={draggableProvided.innerRef}
                            {...draggableProvided.draggableProps}
                            className={`
                              flex items-center gap-2 px-4 py-2 transition-colors
                              ${visible ? '' : 'opacity-60'}
                              ${snapshot.isDragging
                                ? 'bg-electric/5 dark:bg-electric/10 shadow-card rounded-lg'
                                : 'hover:bg-cream/50 dark:hover:bg-slate-800/50'
                              }
                            `}
                            style={{
                              ...draggableProvided.draggableProps.style,
                            }}
                          >
                            {/* Drag handle */}
                            <div
                              {...draggableProvided.dragHandleProps}
                              className="shrink-0 cursor-grab active:cursor-grabbing text-navy/30 dark:text-slate-500 hover:text-navy/60 dark:hover:text-slate-300 transition-colors"
                              title="Drag to reorder"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                <circle cx="9" cy="5" r="1.5" />
                                <circle cx="15" cy="5" r="1.5" />
                                <circle cx="9" cy="12" r="1.5" />
                                <circle cx="15" cy="12" r="1.5" />
                                <circle cx="9" cy="19" r="1.5" />
                                <circle cx="15" cy="19" r="1.5" />
                              </svg>
                            </div>

                            {/* Checkbox */}
                            <button
                              onClick={() => toggleColumn(key)}
                              className={`
                                w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all
                                ${visible
                                  ? 'bg-electric border-electric'
                                  : 'border-navy/20 dark:border-slate-600 hover:border-navy/40 dark:hover:border-slate-500'
                                }
                              `}
                            >
                              {visible && (
                                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              )}
                            </button>

                            {/* Label */}
                            <span className="flex-1 text-sm text-navy dark:text-slate-200 font-body select-none">
                              {label}
                            </span>
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {droppableProvided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>

          {/* Footer */}
          {!isDefault && (
            <div className="px-4 py-2.5 border-t border-cream-dark/50 dark:border-slate-700/50">
              <button
                onClick={resetToDefault}
                className="text-sm text-navy/50 dark:text-slate-400 hover:text-danger dark:hover:text-danger transition-colors font-body"
              >
                Reset to default
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
