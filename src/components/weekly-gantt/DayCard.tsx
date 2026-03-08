'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Droppable, Draggable } from '@hello-pangea/dnd';
import type { WeeklyTask, WeeklyTaskColor } from '@/lib/types';

interface ClientContact {
  name: string;
  email?: string;
}

export interface TeamMember {
  user_id: string;
  role: string;
  profile?: {
    id: string;
    display_name: string;
    avatar_url: string | null;
    agency_role: string | null;
  };
}

interface DayCardProps {
  dayIndex: number; // 0=weekly, 1=Mon ... 7=Sun
  dayLabel: string;
  date: number;
  month: string;
  isToday: boolean;
  isWeekend: boolean;
  tasks: WeeklyTask[];
  clientContacts: ClientContact[];
  teamMembers?: TeamMember[];
  dayColor?: string | null;
  dayLabelText?: string | null;
  isClientView?: boolean;
  onUpdateTask: (taskId: string, updates: Partial<WeeklyTask>) => void;
  onDeleteTask: (taskId: string) => void;
  onAddTask: (title: string, dayIndex: number) => void;
  onUpdateDayColor?: (dayIndex: number, color: string | null) => void;
  onUpdateDayLabel?: (dayIndex: number, label: string) => void;
}

const TASK_COLORS: Record<string, { bar: string; dot: string; label: string }> = {
  blue:   { bar: '#3b82f6', dot: 'bg-blue-500',   label: 'Blue' },
  purple: { bar: '#8b5cf6', dot: 'bg-purple-500', label: 'Purple' },
  green:  { bar: '#22c55e', dot: 'bg-green-500',  label: 'Green' },
  orange: { bar: '#f97316', dot: 'bg-orange-500', label: 'Orange' },
  red:    { bar: '#ef4444', dot: 'bg-red-500',    label: 'Red' },
  pink:   { bar: '#ec4899', dot: 'bg-pink-500',   label: 'Pink' },
  teal:   { bar: '#14b8a6', dot: 'bg-teal-500',   label: 'Teal' },
  yellow: { bar: '#eab308', dot: 'bg-yellow-500', label: 'Yellow' },
};

const PRIORITY_COLORS: Record<string, { dot: string }> = {
  high:   { dot: 'bg-orange-400' },
  medium: { dot: 'bg-electric' },
  low:    { dot: 'bg-green-400' },
};

const DAY_BG_COLORS = [
  { hex: '#fef3c7', label: 'Yellow' },
  { hex: '#dbeafe', label: 'Blue' },
  { hex: '#dcfce7', label: 'Green' },
  { hex: '#fce7f3', label: 'Pink' },
  { hex: '#ede9fe', label: 'Purple' },
  { hex: '#ffedd5', label: 'Orange' },
  { hex: '#e0f2fe', label: 'Sky' },
  { hex: '#f1f5f9', label: 'Gray' },
];

export function DayCard({
  dayIndex,
  dayLabel,
  date,
  month,
  isToday,
  isWeekend,
  tasks,
  clientContacts,
  teamMembers = [],
  dayColor,
  dayLabelText,
  isClientView = false,
  onUpdateTask,
  onDeleteTask,
  onAddTask,
  onUpdateDayColor,
  onUpdateDayLabel,
}: DayCardProps) {
  const [addingTask, setAddingTask] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [showDayColorPicker, setShowDayColorPicker] = useState(false);
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(dayLabelText || '');
  const addInputRef = useRef<HTMLInputElement>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);
  const dayColorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (addingTask && addInputRef.current) addInputRef.current.focus();
  }, [addingTask]);

  useEffect(() => {
    if (editingLabel && labelInputRef.current) labelInputRef.current.focus();
  }, [editingLabel]);

  // Close day color picker on outside click
  useEffect(() => {
    if (!showDayColorPicker) return;
    const handler = (e: MouseEvent) => {
      if (dayColorRef.current && !dayColorRef.current.contains(e.target as Node)) {
        setShowDayColorPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDayColorPicker]);

  const submitNewTask = () => {
    if (newTitle.trim()) {
      onAddTask(newTitle.trim(), dayIndex);
      setNewTitle('');
    }
    addInputRef.current?.focus();
  };

  const saveLabel = () => {
    setEditingLabel(false);
    if (onUpdateDayLabel) {
      onUpdateDayLabel(dayIndex, labelDraft.trim());
    }
  };

  const completedCount = tasks.filter(t => t.completed).length;
  const sortedTasks = [...tasks].sort((a, b) => a.sort_order - b.sort_order);
  const isWeeklySlot = dayIndex === 0;

  return (
    <div
      className={`flex flex-col rounded-xl border transition-colors min-h-[180px] ${
        isToday
          ? 'border-electric/40 bg-electric/[0.03] dark:bg-electric/[0.06] ring-1 ring-electric/20'
          : 'border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface'
      }`}
      style={dayColor ? { backgroundColor: dayColor } : undefined}
    >
      {/* Day header */}
      <div className={`flex items-center justify-between px-3 py-2 border-b ${
        isToday ? 'border-electric/20' : 'border-cream-dark/50 dark:border-slate-700/50'
      }`}>
        <div className="flex items-center gap-2 min-w-0">
          {/* Day color picker (admin only) */}
          {!isClientView && !isWeeklySlot && onUpdateDayColor && (
            <div className="relative" ref={dayColorRef}>
              <button
                type="button"
                onClick={() => setShowDayColorPicker(v => !v)}
                className="w-3 h-3 rounded-full shrink-0 border border-navy/10 dark:border-slate-600 hover:ring-2 hover:ring-electric/30 transition-all"
                style={{ backgroundColor: dayColor || '#ffffff' }}
                title="Day background color"
              />
              {showDayColorPicker && (
                <div className="absolute top-full left-0 mt-1 z-30 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-cream-dark dark:border-slate-700 p-2 min-w-[110px]">
                  <div className="grid grid-cols-4 gap-1.5">
                    {DAY_BG_COLORS.map(c => (
                      <button
                        key={c.hex}
                        type="button"
                        onClick={() => { onUpdateDayColor(dayIndex, c.hex); setShowDayColorPicker(false); }}
                        className={`w-5 h-5 rounded-full border transition-all hover:scale-110 ${
                          dayColor === c.hex ? 'ring-2 ring-offset-1 ring-navy/30 scale-110' : 'border-navy/10'
                        }`}
                        style={{ backgroundColor: c.hex }}
                        title={c.label}
                      />
                    ))}
                  </div>
                  {dayColor && (
                    <button
                      type="button"
                      onClick={() => { onUpdateDayColor(dayIndex, null); setShowDayColorPicker(false); }}
                      className="w-full mt-1 text-[9px] text-navy/40 dark:text-slate-500 hover:text-navy dark:hover:text-slate-300 font-body py-0.5 text-center"
                    >
                      Reset
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          <span className={`text-xs font-semibold font-heading uppercase tracking-wider ${
            isWeeklySlot ? 'text-electric' : isToday ? 'text-electric' : 'text-navy/50 dark:text-slate-400'
          }`}>
            {dayLabel}
          </span>
          {!isWeeklySlot && (
            <span className={`text-lg font-bold font-heading ${
              isToday ? 'text-electric' : 'text-navy dark:text-slate-200'
            }`}>
              {date}
            </span>
          )}
          {isToday && (
            <span className="text-[9px] font-bold text-electric bg-electric/10 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
              Today
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Day label (editable) */}
          {!isWeeklySlot && !isClientView && (
            editingLabel ? (
              <input
                ref={labelInputRef}
                value={labelDraft}
                onChange={e => setLabelDraft(e.target.value)}
                onBlur={saveLabel}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveLabel();
                  if (e.key === 'Escape') { setLabelDraft(dayLabelText || ''); setEditingLabel(false); }
                }}
                placeholder="Label..."
                className="text-[9px] font-body bg-transparent outline-none border-b border-electric/30 text-navy/60 dark:text-slate-400 w-20 py-0"
              />
            ) : (
              <button
                type="button"
                onClick={() => { setLabelDraft(dayLabelText || ''); setEditingLabel(true); }}
                className={`text-[9px] font-body transition-colors truncate max-w-[80px] ${
                  dayLabelText
                    ? 'text-navy/50 dark:text-slate-400 hover:text-electric'
                    : 'text-navy/15 dark:text-slate-700 hover:text-navy/30 opacity-0 group-hover:opacity-100'
                }`}
                title={dayLabelText || 'Add label'}
              >
                {dayLabelText || '+ label'}
              </button>
            )
          )}
          {/* Read-only label display */}
          {isClientView && dayLabelText && (
            <span className="text-[9px] font-body text-navy/50 dark:text-slate-400 truncate max-w-[80px]">
              {dayLabelText}
            </span>
          )}
          {tasks.length > 0 && (
            <span className="text-[10px] text-navy/30 dark:text-slate-600 font-body">
              {completedCount}/{tasks.length}
            </span>
          )}
        </div>
      </div>

      {/* Tasks list - Droppable zone */}
      <Droppable droppableId={`day-${dayIndex}`} isDropDisabled={isClientView}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 px-2 py-1.5 space-y-0.5 overflow-y-auto max-h-[300px] transition-colors ${
              snapshot.isDraggingOver ? 'bg-electric/5 dark:bg-electric/10' : ''
            }`}
          >
            {sortedTasks.map((task, index) => (
              <Draggable
                key={task.id}
                draggableId={task.id}
                index={index}
                isDragDisabled={isClientView}
              >
                {(dragProvided, dragSnapshot) => (
                  <div
                    ref={dragProvided.innerRef}
                    {...dragProvided.draggableProps}
                    {...dragProvided.dragHandleProps}
                    className={dragSnapshot.isDragging ? 'opacity-90 shadow-lg rounded-md' : ''}
                  >
                    <TaskItem
                      task={task}
                      clientContacts={clientContacts}
                      teamMembers={teamMembers}
                      isClientView={isClientView}
                      onUpdate={(updates) => onUpdateTask(task.id, updates)}
                      onDelete={() => onDeleteTask(task.id)}
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}

            {/* Add task inline (admin only) */}
            {!isClientView && (
              addingTask ? (
                <div className="flex items-center gap-1.5 px-1.5 py-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-navy/10 dark:bg-slate-600 shrink-0" />
                  <input
                    ref={addInputRef}
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') submitNewTask();
                      if (e.key === 'Escape') { setAddingTask(false); setNewTitle(''); }
                    }}
                    onBlur={() => {
                      if (!newTitle.trim()) { setAddingTask(false); setNewTitle(''); }
                    }}
                    placeholder="Task name..."
                    className="flex-1 text-xs font-body bg-transparent outline-none text-navy dark:text-slate-100 placeholder:text-navy/20 dark:placeholder:text-slate-600 border-b border-electric/30 py-0.5"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingTask(true)}
                  className="w-full text-left px-1.5 py-1 text-[11px] text-navy/25 dark:text-slate-600 hover:text-electric dark:hover:text-electric font-body transition-colors flex items-center gap-1.5 rounded hover:bg-electric/5"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Add task
                </button>
              )
            )}
          </div>
        )}
      </Droppable>
    </div>
  );
}

// -- Compact Task Item within a Day Card --
function TaskItem({
  task,
  clientContacts,
  teamMembers = [],
  isClientView = false,
  onUpdate,
  onDelete,
}: {
  task: WeeklyTask;
  clientContacts: ClientContact[];
  teamMembers?: TeamMember[];
  isClientView?: boolean;
  onUpdate: (updates: Partial<WeeklyTask>) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showOwnerPicker, setShowOwnerPicker] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const colorRef = useRef<HTMLDivElement>(null);
  const ownerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  // Close popups on outside click
  useEffect(() => {
    if (!showColorPicker && !showOwnerPicker) return;
    const handler = (e: MouseEvent) => {
      if (showColorPicker && colorRef.current && !colorRef.current.contains(e.target as Node)) {
        setShowColorPicker(false);
      }
      if (showOwnerPicker && ownerRef.current && !ownerRef.current.contains(e.target as Node)) {
        setShowOwnerPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showColorPicker, showOwnerPicker]);

  const saveTitle = () => {
    setEditing(false);
    if (title.trim() && title !== task.title) {
      onUpdate({ title: title.trim() });
    } else {
      setTitle(task.title);
    }
  };

  const toggleComplete = useCallback(() => {
    const newCompleted = !task.completed;
    if (newCompleted) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 1200);
    }
    onUpdate({ completed: newCompleted });
  }, [task.completed, onUpdate]);

  const taskColor = task.color ? TASK_COLORS[task.color] : null;
  const PRIORITY_HEX: Record<string, string> = { high: '#fb923c', medium: '#6366f1', low: '#4ade80' };
  const barHex = taskColor?.bar || PRIORITY_HEX[task.priority] || PRIORITY_HEX.medium;

  return (
    <div
      className={`group flex items-center gap-1.5 pl-0 pr-1.5 py-1 rounded-md transition-colors relative border-l-[3px] ${
        task.completed ? 'opacity-50' : 'hover:bg-cream/60 dark:hover:bg-slate-800/40'
      }`}
      style={{
        borderLeftColor: barHex,
        backgroundColor: task.color && !task.completed ? `${barHex}08` : undefined,
      }}
    >
      {/* Confetti */}
      {showConfetti && <MiniConfetti />}

      {/* Color indicator (clickable for admin) */}
      <div className="relative pl-1" ref={colorRef}>
        <button
          type="button"
          onClick={() => !isClientView && setShowColorPicker(v => !v)}
          className={`w-2 h-2 rounded-full shrink-0 transition-colors ${
            isClientView ? '' : 'hover:ring-2 hover:ring-electric/40 cursor-pointer'
          }`}
          style={{ backgroundColor: barHex }}
          title={task.color ? `Color: ${task.color}` : `Priority: ${task.priority}`}
        />
        {showColorPicker && !isClientView && (
          <div className="absolute top-full left-0 mt-1 z-30 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-cream-dark dark:border-slate-700 p-2 min-w-[110px]">
            <div className="grid grid-cols-4 gap-1.5">
              {Object.entries(TASK_COLORS).map(([key, c]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { onUpdate({ color: key as WeeklyTaskColor }); setShowColorPicker(false); }}
                  className={`w-5 h-5 rounded-full ${c.dot} transition-all hover:scale-110 ${
                    task.color === key ? 'ring-2 ring-offset-1 ring-navy/30 dark:ring-slate-400 scale-110' : ''
                  }`}
                  title={c.label}
                />
              ))}
            </div>
            {task.color && (
              <button
                type="button"
                onClick={() => { onUpdate({ color: null }); setShowColorPicker(false); }}
                className="w-full mt-1 text-[9px] text-navy/40 dark:text-slate-500 hover:text-navy dark:hover:text-slate-300 font-body py-0.5 text-center"
              >
                Reset
              </button>
            )}
          </div>
        )}
      </div>

      {/* Checkbox */}
      <button
        type="button"
        onClick={toggleComplete}
        className={`w-3.5 h-3.5 rounded border-[1.5px] shrink-0 flex items-center justify-center transition-all ${
          task.completed
            ? 'bg-green-500 border-green-500'
            : 'border-navy/20 dark:border-slate-600 hover:border-electric'
        }`}
      >
        {task.completed && (
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>

      {/* Title */}
      {editing && !isClientView ? (
        <input
          ref={inputRef}
          value={title}
          onChange={e => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={e => {
            if (e.key === 'Enter') saveTitle();
            if (e.key === 'Escape') { setTitle(task.title); setEditing(false); }
          }}
          className="flex-1 text-xs font-body bg-transparent border-b border-electric/50 outline-none text-navy dark:text-slate-100 py-0 min-w-0"
        />
      ) : (
        <span
          onClick={() => !task.completed && !isClientView && setEditing(true)}
          className={`flex-1 text-xs font-body truncate min-w-0 ${
            isClientView ? '' : 'cursor-text'
          } ${
            task.completed
              ? 'line-through text-navy/30 dark:text-slate-600'
              : 'text-navy dark:text-slate-100'
          }`}
          title={task.title}
        >
          {task.title}
        </span>
      )}

      {/* Owner (initials) */}
      <div className="relative shrink-0" ref={ownerRef}>
        <button
          type="button"
          onClick={() => !isClientView && setShowOwnerPicker(v => !v)}
          className="flex items-center"
          title={task.assignee_name || 'Assign owner'}
        >
          {task.assignee_name ? (
            <span className="w-5 h-5 rounded-full bg-electric/20 text-electric text-[8px] font-bold flex items-center justify-center">
              {task.assignee_name.slice(0, 2).toUpperCase()}
            </span>
          ) : !isClientView ? (
            <span className="w-5 h-5 rounded-full border border-dashed border-navy/15 dark:border-slate-600 text-navy/20 dark:text-slate-600 text-[8px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </span>
          ) : null}
        </button>

        {showOwnerPicker && !isClientView && (
          <div className="absolute top-full right-0 mt-1 z-20 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-cream-dark dark:border-slate-700 py-1 min-w-[160px] max-h-[240px] overflow-y-auto">
            <button
              type="button"
              onClick={() => { onUpdate({ assignee_name: null, owner_id: null }); setShowOwnerPicker(false); }}
              className="w-full text-left px-3 py-1.5 text-[11px] text-navy/50 dark:text-slate-400 hover:bg-cream dark:hover:bg-slate-700 font-body"
            >
              Unassigned
            </button>

            {/* Team members section */}
            {teamMembers.length > 0 && (
              <>
                <div className="px-3 pt-2 pb-1 text-[9px] font-bold text-navy/30 dark:text-slate-600 uppercase tracking-wider font-heading">
                  Team
                </div>
                {teamMembers.map(member => {
                  const name = member.profile?.display_name || 'Unknown';
                  return (
                    <button
                      key={member.user_id}
                      type="button"
                      onClick={() => { onUpdate({ assignee_name: name, owner_id: member.user_id }); setShowOwnerPicker(false); }}
                      className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-cream dark:hover:bg-slate-700 font-body flex items-center gap-2 ${
                        task.assignee_name === name ? 'text-electric font-medium' : 'text-navy dark:text-slate-200'
                      }`}
                    >
                      <span className="w-4 h-4 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 text-[8px] font-bold flex items-center justify-center shrink-0">
                        {name.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="truncate">{name}</span>
                      {member.profile?.agency_role && (
                        <span className="text-[8px] text-navy/30 dark:text-slate-600 shrink-0">{member.profile.agency_role}</span>
                      )}
                    </button>
                  );
                })}
              </>
            )}

            {/* Client contacts section */}
            {clientContacts.length > 0 && (
              <>
                <div className="px-3 pt-2 pb-1 text-[9px] font-bold text-navy/30 dark:text-slate-600 uppercase tracking-wider font-heading">
                  Contacts
                </div>
                {clientContacts.map((contact, idx) => (
                  <button
                    key={`${contact.name}-${idx}`}
                    type="button"
                    onClick={() => { onUpdate({ assignee_name: contact.name, owner_id: null }); setShowOwnerPicker(false); }}
                    className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-cream dark:hover:bg-slate-700 font-body flex items-center gap-2 ${
                      task.assignee_name === contact.name ? 'text-electric font-medium' : 'text-navy dark:text-slate-200'
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full bg-electric/20 text-electric text-[8px] font-bold flex items-center justify-center shrink-0">
                      {contact.name.slice(0, 2).toUpperCase()}
                    </span>
                    {contact.name}
                  </button>
                ))}
              </>
            )}

            {clientContacts.length === 0 && teamMembers.length === 0 && (
              <p className="px-3 py-2 text-[10px] text-navy/30 dark:text-slate-600 font-body">
                No team members or contacts.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Delete button (admin only) */}
      {!isClientView && (
        <button
          type="button"
          onClick={onDelete}
          className="p-0.5 rounded text-navy/10 hover:text-red-500 dark:text-slate-700 dark:hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
          title="Delete task"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}

// -- Mini confetti for completion --
function MiniConfetti() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
      {Array.from({ length: 8 }).map((_, i) => (
        <span
          key={i}
          className="absolute w-1 h-1 rounded-full animate-confetti-burst"
          style={{
            left: '12px',
            top: '50%',
            backgroundColor: ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'][i % 6],
            animationDelay: `${i * 40}ms`,
            // @ts-expect-error CSS custom properties for confetti direction
            '--confetti-x': `${(Math.random() - 0.3) * 80}px`,
            '--confetti-y': `${(Math.random() - 0.5) * 40}px`,
          }}
        />
      ))}
    </div>
  );
}
