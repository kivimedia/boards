'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { DragDropContext, Droppable, DropResult, BeforeCapture } from '@hello-pangea/dnd';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { BoardWithLists, BoardFilter } from '@/lib/types';
import BoardList from './BoardList';
import CardModal from '@/components/card/CardModal';
import BulkSelectToolbar from './BulkSelectToolbar';
import Button from '@/components/ui/Button';
import { useBoardPan } from '@/hooks/useBoardPan';

interface BoardProps {
  board: BoardWithLists;
  onRefresh: () => void;
  filter?: BoardFilter;
  externalSelectedCardId?: string | null;
  onExternalCardClose?: () => void;
  isLoadingCards?: boolean;
}

export default function Board({ board, onRefresh, filter, externalSelectedCardId, onExternalCardClose, isLoadingCards }: BoardProps) {
  const panRef = useBoardPan();
  const queryClient = useQueryClient();
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [isAddingList, setIsAddingList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [selectedCards, setSelectedCards] = useState<Set<string>>(new Set());
  const lastSelectedCardRef = useRef<string | null>(null);
  const supabase = createClient();

  // Build a flat ordered list of all visible card IDs (for shift-click range selection)
  const sortedLists = useMemo(
    () => [...board.lists].sort((a, b) => a.position - b.position),
    [board.lists]
  );

  const allCardIds = useMemo(() => {
    const ids: string[] = [];
    for (const list of sortedLists) {
      const cards = [...list.cards]
        .sort((a, b) => a.position - b.position)
        .filter((placement) => {
          if (!filter) return true;
          const card = placement.card;
          if (filter.labels.length > 0) {
            const cardLabelIds = (placement.labels || []).map((l) => l.id);
            if (!filter.labels.some((id) => cardLabelIds.includes(id))) return false;
          }
          if (filter.members.length > 0) {
            const cardMemberIds = (placement.assignees || []).map((a) => a.id);
            if (!filter.members.some((id) => cardMemberIds.includes(id))) return false;
          }
          if (filter.priority.length > 0) {
            if (!filter.priority.includes(card.priority || 'none')) return false;
          }
          if (filter.dueDate === 'overdue') {
            if (!card.due_date || new Date(card.due_date) >= new Date()) return false;
          } else if (filter.dueDate === 'due_soon') {
            if (!card.due_date) return false;
            const diff = new Date(card.due_date).getTime() - Date.now();
            if (diff < 0 || diff > 24 * 60 * 60 * 1000) return false;
          } else if (filter.dueDate === 'no_date') {
            if (card.due_date) return false;
          }
          return true;
        });
      for (const c of cards) {
        ids.push(c.card.id);
      }
    }
    return ids;
  }, [sortedLists, filter]);

  const toggleCardSelection = useCallback((cardId: string, shiftKey?: boolean) => {
    setSelectedCards((prev) => {
      const next = new Set(prev);

      if (shiftKey && lastSelectedCardRef.current) {
        // Shift-click: select range between last selected and current
        const lastIdx = allCardIds.indexOf(lastSelectedCardRef.current);
        const currIdx = allCardIds.indexOf(cardId);
        if (lastIdx !== -1 && currIdx !== -1) {
          const [start, end] = lastIdx < currIdx ? [lastIdx, currIdx] : [currIdx, lastIdx];
          for (let i = start; i <= end; i++) {
            next.add(allCardIds[i]);
          }
          return next;
        }
      }

      // Normal toggle
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      lastSelectedCardRef.current = cardId;
      return next;
    });
  }, [allCardIds]);

  const clearSelection = useCallback(() => {
    setSelectedCards(new Set());
    lastSelectedCardRef.current = null;
  }, []);

  const selectAll = useCallback(() => {
    setSelectedCards(new Set(allCardIds));
  }, [allCardIds]);

  // Keyboard shortcuts: Escape to clear, Ctrl/Cmd+A to select all
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Escape to clear selection (only if we have selected cards and no modal open)
      if (e.key === 'Escape' && selectedCards.size > 0 && !selectedCardId) {
        e.preventDefault();
        clearSelection();
        return;
      }

      // Ctrl/Cmd+A to select all visible cards (only on board, not in inputs)
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        const target = e.target as HTMLElement;
        const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
        if (!isInput && !selectedCardId) {
          e.preventDefault();
          selectAll();
        }
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [selectedCards.size, selectedCardId, clearSelection, selectAll]);

  const handleBulkAction = async (action: string, params?: Record<string, string>) => {
    const res = await fetch('/api/cards/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        card_ids: Array.from(selectedCards),
        ...params,
      }),
    });

    if (!res.ok) {
      throw new Error('Bulk action failed');
    }

    clearSelection();
    onRefresh();
  };

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      const { source, destination, type } = result;

      if (!destination) return;
      if (
        source.droppableId === destination.droppableId &&
        source.index === destination.index
      )
        return;

      if (type === 'list') {
        // Optimistic update: reorder lists in cache immediately
        const lists = [...board.lists].sort((a, b) => a.position - b.position);
        const [moved] = lists.splice(source.index, 1);
        lists.splice(destination.index, 0, moved);
        const updatedLists = lists.map((l, i) => ({ ...l, position: i }));

        queryClient.setQueryData(['board', board.id], {
          ...board,
          lists: updatedLists,
        });

        // Fire DB writes in background
        const minIdx = Math.min(source.index, destination.index);
        const maxIdx = Math.max(source.index, destination.index);
        const updates = [];
        for (let i = minIdx; i <= maxIdx; i++) {
          updates.push(
            supabase
              .from('lists')
              .update({ position: i })
              .eq('id', updatedLists[i].id)
          );
        }
        Promise.all(updates).catch((err) => {
          console.error('Failed to save list reorder:', err);
          onRefresh();
        });
        return;
      }

      if (type === 'card') {
        const sourceList = board.lists.find((l) => l.id === source.droppableId);
        const destList = board.lists.find((l) => l.id === destination.droppableId);
        if (!sourceList || !destList) return;

        // Build optimistic board state
        const newLists = board.lists.map((l) => ({ ...l, cards: [...l.cards] }));
        const srcList = newLists.find((l) => l.id === source.droppableId)!;
        const dstList = newLists.find((l) => l.id === destination.droppableId)!;

        const srcCards = srcList.cards.sort((a, b) => a.position - b.position);
        const [movedCard] = srcCards.splice(source.index, 1);

        if (source.droppableId === destination.droppableId) {
          srcCards.splice(destination.index, 0, movedCard);
          srcList.cards = srcCards.map((c, i) => ({ ...c, position: i }));
        } else {
          const dstCards = dstList.cards.sort((a, b) => a.position - b.position);
          dstCards.splice(destination.index, 0, { ...movedCard, list_id: destination.droppableId });
          srcList.cards = srcCards.map((c, i) => ({ ...c, position: i }));
          dstList.cards = dstCards.map((c, i) => ({ ...c, position: i }));
        }

        queryClient.setQueryData(['board', board.id], {
          ...board,
          lists: newLists,
        });

        // Persist via server API (bypasses RLS on card_placements)
        if (source.droppableId === destination.droppableId) {
          const sortedSrc = [...sourceList.cards].sort((a, b) => a.position - b.position);
          const [mv] = sortedSrc.splice(source.index, 1);
          sortedSrc.splice(destination.index, 0, mv);

          fetch('/api/cards/reorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              list_id: source.droppableId,
              ordered_placement_ids: sortedSrc.map((c) => c.id),
            }),
          }).catch((err) => {
            console.error('[DragEnd] Failed to persist card order:', err);
            onRefresh();
          });
        } else {
          const sourcePlacements = [...sourceList.cards].sort((a, b) => a.position - b.position);
          const [mv] = sourcePlacements.splice(source.index, 1);

          fetch('/api/cards/reorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              placement_id: mv.id,
              dest_list_id: destination.droppableId,
              dest_index: destination.index,
            }),
          }).catch((err) => {
            console.error('[DragEnd] Failed to persist cross-list move:', err);
            onRefresh();
          });
        }
      }
    },
    [board, supabase, queryClient]
  );

  const handleAddList = async () => {
    if (!newListName.trim()) return;

    // Compute safe next list position (guard against int4 overflow)
    const INT4_SAFE_THRESHOLD = 2147483640;
    const positions = board.lists.map((l) => l.position);
    let maxPosition = positions.length > 0 ? Math.max(...positions) : -1;
    if (maxPosition >= INT4_SAFE_THRESHOLD) {
      // Renumber existing lists sequentially to reclaim position space
      const sorted = [...board.lists].sort((a, b) => a.position - b.position);
      await Promise.all(
        sorted.map((l, i) =>
          supabase.from('lists').update({ position: i }).eq('id', l.id)
        )
      );
      maxPosition = sorted.length - 1;
    }
    await supabase.from('lists').insert({
      board_id: board.id,
      name: newListName.trim(),
      position: maxPosition + 1,
    });

    setNewListName('');
    setIsAddingList(false);
    onRefresh();
  };

  const [draggingListType, setDraggingListType] = useState(false);
  const isDraggingRef = useRef(false);
  const scrollRafRef = useRef<number | null>(null);

  // Auto-scroll the board when dragging near edges
  useEffect(() => {
    if (!isDraggingRef.current) return;

    const EDGE_SIZE = 120; // px from edge to start scrolling
    const MAX_SPEED = 20;  // max px per frame

    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !panRef.current) return;

      const container = panRef.current;
      const rect = container.getBoundingClientRect();
      const x = e.clientX;

      // Cancel any pending scroll
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);

      const distFromLeft = x - rect.left;
      const distFromRight = rect.right - x;

      let scrollDelta = 0;
      if (distFromRight < EDGE_SIZE && distFromRight > 0) {
        // Near right edge - scroll right
        scrollDelta = Math.round(MAX_SPEED * (1 - distFromRight / EDGE_SIZE));
      } else if (distFromLeft < EDGE_SIZE && distFromLeft > 0) {
        // Near left edge - scroll left
        scrollDelta = -Math.round(MAX_SPEED * (1 - distFromLeft / EDGE_SIZE));
      }

      if (scrollDelta !== 0) {
        const tick = () => {
          if (!isDraggingRef.current || !panRef.current) return;
          panRef.current.scrollLeft += scrollDelta;
          scrollRafRef.current = requestAnimationFrame(tick);
        };
        scrollRafRef.current = requestAnimationFrame(tick);
      }
    };

    window.addEventListener('mousemove', onMouseMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    };
  });

  const handleDragStart = useCallback((start: { type: string }) => {
    isDraggingRef.current = true;
    if (start.type === 'list') setDraggingListType(true);
  }, []);

  const wrappedDragEnd = useCallback(
    (result: DropResult) => {
      isDraggingRef.current = false;
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
      setDraggingListType(false);
      handleDragEnd(result);
    },
    [handleDragEnd]
  );

  return (
    <>
      <DragDropContext onDragStart={handleDragStart} onDragEnd={wrappedDragEnd}>
        <Droppable droppableId="board" type="list" direction="horizontal">
          {(provided) => (
            <div
              ref={(el) => {
                provided.innerRef(el);
                panRef.current = el;
              }}
              {...provided.droppableProps}
              className="flex-1 flex gap-3 overflow-x-auto p-3 sm:p-6 pb-20 sm:pb-24 scrollbar-thin items-start"
            >
              {sortedLists.map((list, index) => (
                <BoardList
                  key={list.id}
                  list={list}
                  index={index}
                  boardId={board.id}
                  boardName={board.name}
                  allLists={sortedLists.map((l) => ({ id: l.id, name: l.name }))}
                  onCardClick={setSelectedCardId}
                  onRefresh={onRefresh}
                  selectedCards={selectedCards}
                  toggleCardSelection={toggleCardSelection}
                  filter={filter}
                  isLoadingCards={isLoadingCards}
                  isDraggingList={draggingListType}
                />
              ))}
              {provided.placeholder}

              {/* Add list button */}
              {isAddingList ? (
                <div className="w-[85vw] sm:w-72 shrink-0 bg-cream-dark/50 dark:bg-slate-800/50 rounded-2xl p-3">
                  <input
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    placeholder="Enter list name..."
                    className="w-full p-2.5 rounded-xl bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddList();
                      if (e.key === 'Escape') setIsAddingList(false);
                    }}
                  />
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" onClick={handleAddList}>
                      Add List
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setIsAddingList(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setIsAddingList(true)}
                  className="w-[85vw] sm:w-72 shrink-0 py-3 px-4 rounded-2xl text-sm text-navy/40 dark:text-slate-400 hover:text-navy/60 dark:hover:text-slate-300 bg-cream-dark/30 dark:bg-slate-800/30 hover:bg-cream-dark/50 dark:hover:bg-slate-800/50 transition-all duration-200 text-left font-body border-2 border-dashed border-cream-dark dark:border-slate-700 hover:border-navy/10 dark:hover:border-slate-600"
                >
                  + Add another list
                </button>
              )}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {/* Bulk Select Toolbar */}
      {selectedCards.size > 0 && (
        <BulkSelectToolbar
          selectedCount={selectedCards.size}
          boardId={board.id}
          lists={sortedLists.map((l) => ({ id: l.id, name: l.name }))}
          onAction={handleBulkAction}
          onClear={clearSelection}
          onSelectAll={selectAll}
        />
      )}

      {/* Card Modal with left/right arrow navigation */}
      {(selectedCardId || externalSelectedCardId) && (
        <CardModal
          cardId={(selectedCardId || externalSelectedCardId)!}
          boardId={board.id}
          onClose={() => {
            setSelectedCardId(null);
            onExternalCardClose?.();
          }}
          onRefresh={onRefresh}
          allCardIds={allCardIds}
          onNavigate={(cardId) => {
            setSelectedCardId(cardId);
          }}
        />
      )}
    </>
  );
}
