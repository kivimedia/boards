'use client';

import { useState } from 'react';
import DropdownMenu, { DropdownMenuItem } from '@/components/ui/DropdownMenu';

interface ListMenuProps {
  listId: string;
  listName: string;
  boardId: string;
  allLists: { id: string; name: string }[];
  onRefresh: () => void;
}

export default function ListMenu({ listId, listName, boardId, allLists, onRefresh }: ListMenuProps) {
  const [showMoveTarget, setShowMoveTarget] = useState(false);
  const [showSortOptions, setShowSortOptions] = useState(false);

  const handleCopyList = async () => {
    try {
      await fetch(`/api/lists/${listId}/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ board_id: boardId }),
      });
      onRefresh();
    } catch {
      // Error handling
    }
  };

  const handleMoveAllCards = async (targetListId: string) => {
    try {
      await fetch(`/api/lists/${listId}/move-all-cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_list_id: targetListId }),
      });
      setShowMoveTarget(false);
      onRefresh();
    } catch {
      // Error handling
    }
  };

  const handleSort = async (sortBy: string) => {
    try {
      await fetch(`/api/lists/${listId}/sort`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sort_by: sortBy }),
      });
      setShowSortOptions(false);
      onRefresh();
    } catch {
      // Error handling
    }
  };

  const handleArchiveAll = async () => {
    if (!confirm('Archive all cards in this list?')) return;
    try {
      const res = await fetch(`/api/lists/${listId}/move-all-cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archive: true }),
      });
      if (res.ok) onRefresh();
    } catch {
      // Error handling
    }
  };

  const handleDeleteList = async () => {
    if (!confirm(`Delete "${listName}" and all its cards?`)) return;
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    await supabase.from('lists').delete().eq('id', listId);
    onRefresh();
  };

  const otherLists = allLists.filter((l) => l.id !== listId);

  const items: DropdownMenuItem[] = [
    {
      label: 'Copy List',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
      ),
      onClick: handleCopyList,
    },
    { label: '', separator: true },
    {
      label: 'Sort By',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="6" x2="16" y2="6"/><line x1="4" y1="12" x2="12" y2="12"/><line x1="4" y1="18" x2="8" y2="18"/>
        </svg>
      ),
      subContent: (
        <div className="space-y-0.5 pb-1">
          {[
            { key: 'created_at', label: 'Date Created' },
            { key: 'title', label: 'Name (A-Z)' },
            { key: 'priority', label: 'Priority' },
            { key: 'due_date', label: 'Due Date' },
          ].map((opt) => (
            <button
              key={opt.key}
              onClick={(e) => {
                e.stopPropagation();
                handleSort(opt.key);
              }}
              className="w-full text-left px-2 py-1.5 text-sm text-navy dark:text-slate-200 hover:bg-cream-dark dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              {opt.label}
            </button>
          ))}
        </div>
      ),
    },
    { label: '', separator: true },
    {
      label: 'Move All Cards',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/>
        </svg>
      ),
      disabled: otherLists.length === 0,
      subContent: otherLists.length > 0 ? (
        <div className="space-y-0.5 pb-1 max-h-[200px] overflow-y-auto scrollbar-thin">
          {otherLists.map((l) => (
            <button
              key={l.id}
              onClick={(e) => {
                e.stopPropagation();
                handleMoveAllCards(l.id);
              }}
              className="w-full text-left px-2 py-1.5 text-sm text-navy dark:text-slate-200 hover:bg-cream-dark dark:hover:bg-slate-700 rounded-lg transition-colors truncate"
            >
              {l.name}
            </button>
          ))}
        </div>
      ) : undefined,
    },
    { label: '', separator: true },
    {
      label: 'Archive All Cards',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>
        </svg>
      ),
      onClick: handleArchiveAll,
    },
    {
      label: 'Delete List',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
      ),
      variant: 'danger',
      onClick: handleDeleteList,
    },
  ];

  return (
    <DropdownMenu
      trigger={
        <button className="p-1 rounded-lg text-navy/40 dark:text-slate-500 hover:text-navy dark:hover:text-slate-200 hover:bg-cream-dark/80 dark:hover:bg-slate-700 transition-all">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
          </svg>
        </button>
      }
      items={items}
      align="right"
    />
  );
}
