'use client';

import { useState, useRef, useEffect } from 'react';

export interface AgentTab {
  sessionId: string;
  title: string;
  skillIcon: string | null;
  skillName: string;
  status: 'idle' | 'running' | 'cancelled' | 'error';
}

interface AgentTabBarProps {
  tabs: AgentTab[];
  activeTabId: string;
  onTabSelect: (id: string) => void;
  onTabClose: (id: string) => void;
  onTabRename: (id: string, newTitle: string) => void;
  onNewTab: () => void;
}

export default function AgentTabBar({ tabs, activeTabId, onTabSelect, onTabClose, onTabRename, onNewTab }: AgentTabBarProps) {
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingTabId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingTabId]);

  const startRename = (tab: AgentTab) => {
    setEditingTabId(tab.sessionId);
    setEditValue(tab.title);
  };

  const commitRename = () => {
    if (editingTabId && editValue.trim()) {
      onTabRename(editingTabId, editValue.trim());
    }
    setEditingTabId(null);
    setEditValue('');
  };

  return (
    <div className="flex items-center gap-1 border-b border-navy/10 dark:border-slate-700 mb-4 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
      {/* Launcher tab (always first) */}
      <button
        onClick={onNewTab}
        className={`shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
          activeTabId === 'launcher'
            ? 'border-electric text-electric bg-electric/5'
            : 'border-transparent text-navy/50 dark:text-slate-400 hover:text-navy dark:hover:text-slate-200 hover:border-navy/20'
        }`}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        New Agent
      </button>

      {/* Session tabs */}
      {tabs.map((tab) => (
        <div
          key={tab.sessionId}
          className={`shrink-0 flex items-center gap-1.5 pl-3 pr-1 py-2 border-b-2 transition-colors group cursor-pointer ${
            activeTabId === tab.sessionId
              ? 'border-electric text-electric bg-electric/5'
              : 'border-transparent text-navy/50 dark:text-slate-400 hover:text-navy dark:hover:text-slate-200 hover:border-navy/20'
          }`}
          onClick={() => onTabSelect(tab.sessionId)}
          onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); onTabClose(tab.sessionId); } }}
        >
          {/* Skill icon */}
          {tab.skillIcon && <span className="text-sm">{tab.skillIcon}</span>}

          {/* Status indicator */}
          {tab.status === 'running' && (
            <span className="w-2 h-2 rounded-full bg-electric animate-pulse shrink-0" />
          )}
          {tab.status === 'error' && (
            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
          )}
          {tab.status === 'cancelled' && (
            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
          )}

          {/* Title (editable on double-click) */}
          {editingTabId === tab.sessionId ? (
            <input
              ref={inputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') { setEditingTabId(null); setEditValue(''); }
              }}
              className="text-xs font-semibold bg-transparent border-b border-electric outline-none w-28 text-navy dark:text-slate-100"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              className="text-xs font-semibold max-w-[120px] truncate"
              onDoubleClick={(e) => { e.stopPropagation(); startRename(tab); }}
              title={`${tab.title} (double-click to rename)`}
            >
              {tab.title}
            </span>
          )}

          {/* Close button */}
          <button
            onClick={(e) => { e.stopPropagation(); onTabClose(tab.sessionId); }}
            className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-navy/10 dark:hover:bg-slate-700 transition-all"
            title="Close tab"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
