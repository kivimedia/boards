'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Board, List } from '@/lib/types';
import Button from '@/components/ui/Button';

interface CardActionsProps {
  cardId: string;
  boardId: string;
  onClose: () => void;
  onRefresh: () => void;
}

export default function CardActions({ cardId, boardId, onClose, onRefresh }: CardActionsProps) {
  const [showMirror, setShowMirror] = useState(false);
  const [showMove, setShowMove] = useState(false);
  const [boards, setBoards] = useState<Board[]>([]);
  const [targetBoardId, setTargetBoardId] = useState('');
  const [targetLists, setTargetLists] = useState<List[]>([]);
  const [targetListId, setTargetListId] = useState('');
  const [targetListCardCount, setTargetListCardCount] = useState(0);
  const [targetPositionIndex, setTargetPositionIndex] = useState(-1); // -1 = end
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    // Use server API so RLS doesn't filter out boards
    fetch('/api/boards')
      .then((r) => r.json())
      .then((json) => setBoards(json.data || json || []))
      .catch(() => setBoards([]));
  }, []);

  useEffect(() => {
    if (!targetBoardId) {
      setTargetLists([]);
      return;
    }
    fetch(`/api/boards/${targetBoardId}/lists`)
      .then((r) => r.json())
      .then((json) => {
        const lists = json.data || json || [];
        setTargetLists(lists);
        if (lists.length > 0) setTargetListId(lists[0].id);
      })
      .catch(() => setTargetLists([]));
  }, [targetBoardId]);

  useEffect(() => {
    if (!targetListId) { setTargetListCardCount(0); setTargetPositionIndex(-1); return; }
    fetch(`/api/lists/${targetListId}/cards/count`)
      .then((r) => r.json())
      .then((json) => {
        setTargetListCardCount(json.data?.count ?? json.count ?? 0);
        setTargetPositionIndex(-1); // reset to "bottom" when list changes
      })
      .catch(() => { setTargetListCardCount(0); setTargetPositionIndex(-1); });
  }, [targetListId]);

  const handleMirror = async () => {
    if (!targetListId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/cards/${cardId}/mirror`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ list_id: targetListId, position_index: targetPositionIndex }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data?.error || 'Mirror failed. Please try again.');
      } else {
        setShowMirror(false);
        onRefresh();
      }
    } catch {
      alert('Mirror failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicate = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cards/${cardId}/duplicate`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to duplicate');
    } catch {
      // silently fail
    }
    setLoading(false);
    onRefresh();
  };

  const handleMove = async () => {
    if (!targetListId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/cards/${cardId}/move-to-list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ list_id: targetListId, position_index: targetPositionIndex }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data?.error || 'Move failed. Please try again.');
      } else {
        setShowMove(false);
        onRefresh();
      }
    } catch {
      alert('Move failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleArchive = async () => {
    if (!confirm('Archive this ticket? It will be hidden from the board but can be restored later.')) return;
    setLoading(true);
    try {
      const res = await fetch('/api/cards/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'archive', card_ids: [cardId] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data?.error || 'Archive failed. Please try again.');
      } else {
        onClose();
        onRefresh();
      }
    } catch {
      alert('Archive failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this card? This cannot be undone.')) return;
    await supabase.from('cards').delete().eq('id', cardId);
    onClose();
    onRefresh();
  };

  const BoardListSelector = ({ onSubmit, submitLabel }: { onSubmit: () => void; submitLabel: string }) => (
    <div className="space-y-2 mt-2">
      <select
        value={targetBoardId}
        onChange={(e) => setTargetBoardId(e.target.value)}
        className="w-full px-3 py-2 rounded-lg bg-cream dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-electric/30 font-body"
      >
        <option value="">Select board...</option>
        {boards.map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>
      {targetLists.length > 0 && (
        <select
          value={targetListId}
          onChange={(e) => setTargetListId(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-cream dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-electric/30 font-body"
        >
          {targetLists.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      )}
      {targetListId && (
        <select
          value={targetPositionIndex}
          onChange={(e) => setTargetPositionIndex(Number(e.target.value))}
          className="w-full px-3 py-2 rounded-lg bg-cream dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-electric/30 font-body"
        >
          <option value={0}>Position 1 (top)</option>
          {Array.from({ length: targetListCardCount }, (_, i) => (
            <option key={i + 1} value={i + 1}>Position {i + 2}</option>
          ))}
          <option value={-1}>Bottom (last)</option>
        </select>
      )}
      <Button size="sm" onClick={onSubmit} loading={loading} className="w-full">
        {submitLabel}
      </Button>
    </div>
  );

  return (
    <div>
      <h4 className="text-xs font-semibold text-navy/40 dark:text-slate-500 mb-1.5 uppercase tracking-wider font-heading">
        Actions
      </h4>
      <div className="space-y-1">
        <button
          onClick={() => { setShowMirror(!showMirror); setShowMove(false); }}
          className="w-full text-left px-3 py-2 rounded-lg text-sm text-navy/60 dark:text-slate-400 hover:bg-cream-dark dark:hover:bg-slate-800 hover:text-navy dark:hover:text-slate-100 transition-all font-body"
        >
          Mirror to board
        </button>
        {showMirror && <BoardListSelector onSubmit={handleMirror} submitLabel="Mirror Card" />}

        <button
          onClick={handleDuplicate}
          disabled={loading}
          className="w-full text-left px-3 py-2 rounded-lg text-sm text-navy/60 dark:text-slate-400 hover:bg-cream-dark dark:hover:bg-slate-800 hover:text-navy dark:hover:text-slate-100 transition-all font-body"
        >
          Duplicate
        </button>

        <button
          onClick={() => { setShowMove(!showMove); setShowMirror(false); }}
          className="w-full text-left px-3 py-2 rounded-lg text-sm text-navy/60 dark:text-slate-400 hover:bg-cream-dark dark:hover:bg-slate-800 hover:text-navy dark:hover:text-slate-100 transition-all font-body"
        >
          Move to board
        </button>
        {showMove && <BoardListSelector onSubmit={handleMove} submitLabel="Move Card" />}

        <hr className="border-cream-dark dark:border-slate-700 my-2" />

        <button
          onClick={handleArchive}
          disabled={loading}
          className="w-full text-left px-3 py-2 rounded-lg text-sm text-navy/60 dark:text-slate-400 hover:bg-cream-dark dark:hover:bg-slate-800 hover:text-navy dark:hover:text-slate-100 transition-all font-body"
        >
          Archive this ticket
        </button>

        <button
          onClick={handleDelete}
          className="w-full text-left px-3 py-2 rounded-lg text-sm text-danger/70 hover:bg-danger/10 hover:text-danger transition-all font-body"
        >
          Delete card
        </button>
      </div>
    </div>
  );
}
