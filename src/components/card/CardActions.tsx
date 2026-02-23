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
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    const fetchBoards = async () => {
      const { data } = await supabase.from('boards').select('*').order('name');
      setBoards(data || []);
    };
    fetchBoards();
  }, []);

  useEffect(() => {
    if (!targetBoardId) {
      setTargetLists([]);
      return;
    }
    const fetchLists = async () => {
      const { data } = await supabase
        .from('lists')
        .select('*')
        .eq('board_id', targetBoardId)
        .order('position');
      setTargetLists(data || []);
      if (data && data.length > 0) setTargetListId(data[0].id);
    };
    fetchLists();
  }, [targetBoardId]);

  const handleMirror = async () => {
    if (!targetListId) return;
    setLoading(true);

    const { data: maxPos } = await supabase
      .from('card_placements')
      .select('position')
      .eq('list_id', targetListId)
      .order('position', { ascending: false })
      .limit(1);

    const position = maxPos && maxPos.length > 0 ? maxPos[0].position + 1 : 0;

    await supabase.from('card_placements').insert({
      card_id: cardId,
      list_id: targetListId,
      position,
      is_mirror: true,
    });

    setLoading(false);
    setShowMirror(false);
    onRefresh();
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
      // Find the primary (non-mirror) placement for this card
      const { data: placements } = await supabase
        .from('card_placements')
        .select('*')
        .eq('card_id', cardId)
        .eq('is_mirror', false)
        .limit(1);

      const placement = placements && placements.length > 0 ? placements[0] : null;

      if (!placement) {
        alert('Could not find card placement. The card may have been deleted.');
        setLoading(false);
        return;
      }

      // Get the highest position in the target list
      const { data: maxPos } = await supabase
        .from('card_placements')
        .select('position')
        .eq('list_id', targetListId)
        .order('position', { ascending: false })
        .limit(1);

      const position = maxPos && maxPos.length > 0 ? maxPos[0].position + 1 : 0;

      // Move the primary placement to the target list
      const { error } = await supabase
        .from('card_placements')
        .update({ list_id: targetListId, position })
        .eq('id', placement.id);

      if (error) {
        alert('Failed to move card: ' + error.message);
        setLoading(false);
        return;
      }

      // Remove any mirror placements (card is fully moving to new board)
      await supabase
        .from('card_placements')
        .delete()
        .eq('card_id', cardId)
        .eq('is_mirror', true);

    } catch (err) {
      alert('Failed to move card. Please try again.');
    }

    setLoading(false);
    setShowMove(false);
    onRefresh();
  };

  const handleArchive = async () => {
    if (!confirm('Archive this ticket? It will be hidden from the board but can be restored later.')) return;
    setLoading(true);
    await supabase.from('cards').update({ is_archived: true }).eq('id', cardId);
    await supabase.from('card_placements').delete().eq('card_id', cardId);
    setLoading(false);
    onClose();
    onRefresh();
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
