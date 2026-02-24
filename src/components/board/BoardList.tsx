'use client';

import { useState, useMemo } from 'react';
import { Droppable, Draggable } from '@hello-pangea/dnd';
import { createClient } from '@/lib/supabase/client';
import { ListWithCards, BoardFilter } from '@/lib/types';
import BoardCard from './BoardCard';
import SeparatorCard from '@/components/card/SeparatorCard';
import Button from '@/components/ui/Button';
import ListMenu from './ListMenu';

/**
 * Number of cards to render per list initially.
 * Keeps the DOM lean for fast drag-and-drop with large boards.
 * Users can click "Show more" to load additional batches.
 */
const CARDS_PER_PAGE = 30;

interface BoardListProps {
  list: ListWithCards;
  index: number;
  boardId: string;
  boardName: string;
  allLists: { id: string; name: string }[];
  onCardClick: (cardId: string) => void;
  onRefresh: () => void;
  selectedCards?: Set<string>;
  toggleCardSelection?: (cardId: string, shiftKey?: boolean) => void;
  filter?: BoardFilter;
  isLoadingCards?: boolean;
  isDraggingList?: boolean;
}

/** Apply board filter to a single placement. */
function matchesFilter(placement: any, filter: BoardFilter | undefined): boolean {
  if (!filter) return true;
  const card = placement.card;
  if (filter.labels.length > 0) {
    const cardLabelIds = (placement.labels || []).map((l: any) => l.id);
    if (!filter.labels.some((id: string) => cardLabelIds.includes(id))) return false;
  }
  if (filter.members.length > 0) {
    const cardMemberIds = (placement.assignees || []).map((a: any) => a.id);
    if (!filter.members.some((id: string) => cardMemberIds.includes(id))) return false;
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
}

export default function BoardList({ list, index, boardId, boardName, allLists, onCardClick, onRefresh, selectedCards, toggleCardSelection, filter, isLoadingCards, isDraggingList }: BoardListProps) {
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [listName, setListName] = useState(list.name);
  const [loading, setLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(CARDS_PER_PAGE);
  const supabase = createClient();

  // Memoize sorted + filtered cards (single pass - no duplication)
  const filteredCards = useMemo(() => {
    return list.cards
      .slice() // avoid mutating props
      .sort((a, b) => a.position - b.position)
      .filter((placement) => matchesFilter(placement, filter));
  }, [list.cards, filter]);

  const totalCardCount = list.cards.length;
  const filteredCardCount = filteredCards.length;
  const isFiltered = filter && filteredCardCount !== totalCardCount;

  // Only render up to visibleCount cards for performance
  const visibleCards = filteredCards.slice(0, visibleCount);
  const hasMore = filteredCards.length > visibleCount;
  const hiddenCount = filteredCards.length - visibleCount;

  const handleAddCard = async () => {
    if (!newCardTitle.trim()) return;
    setLoading(true);
    try {
      // Use server API — bypasses client-side RLS on card_placements
      const res = await fetch(`/api/lists/${list.id}/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newCardTitle.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error('[AddCard] Server error:', data?.error || res.status);
        return;
      }

      setNewCardTitle('');
      setIsAddingCard(false);
      onRefresh();
    } catch (err) {
      console.error('[AddCard] Unexpected error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateName = async () => {
    if (listName.trim() && listName !== list.name) {
      await supabase
        .from('lists')
        .update({ name: listName.trim() })
        .eq('id', list.id);
      onRefresh();
    }
    setIsEditingName(false);
  };

  return (
    <Draggable draggableId={`list-${list.id}`} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={`w-[85vw] sm:w-72 shrink-0 flex flex-col rounded-xl pb-1 transition-all duration-200 ease-out ${
            snapshot.isDragging
              ? 'bg-white dark:bg-slate-700 shadow-2xl shadow-electric/20 ring-2 ring-electric/40 rotate-[2deg] scale-[1.03] z-50'
              : isDraggingList
                ? 'bg-[#f1f2f4] dark:bg-slate-800/70 border-2 border-dashed border-electric/30 opacity-70'
                : 'bg-[#f1f2f4] dark:bg-slate-800/70'
          }`}
          style={{ maxHeight: 'calc(100vh - 140px)' }}
        >
          {/* List header */}
          <div
            {...provided.dragHandleProps}
            className="flex items-center justify-between px-3 py-2.5 mb-2 cursor-grab active:cursor-grabbing"
          >
            {isEditingName ? (
              <input
                value={listName}
                onChange={(e) => setListName(e.target.value)}
                onBlur={handleUpdateName}
                onKeyDown={(e) => e.key === 'Enter' && handleUpdateName()}
                className="text-sm font-semibold text-navy dark:text-slate-100 bg-transparent border-b-2 border-electric outline-none w-full font-heading"
                autoFocus
              />
            ) : (
              <h3
                onClick={() => setIsEditingName(true)}
                className="text-sm font-semibold text-navy dark:text-slate-100 font-heading cursor-pointer"
              >
                {list.name}
                <span className="ml-2 px-1.5 py-0.5 rounded-full bg-cream-dark/60 dark:bg-slate-700/60 text-navy/50 dark:text-slate-400 font-normal text-[11px] tabular-nums">
                  {isLoadingCards && totalCardCount === 0 ? (
                    <span className="inline-block w-4 h-3 rounded bg-cream-dark/80 dark:bg-slate-600 animate-pulse" />
                  ) : isFiltered ? `${filteredCardCount}/${totalCardCount}` : totalCardCount}
                </span>
              </h3>
            )}
            <ListMenu
              listId={list.id}
              listName={list.name}
              boardId={boardId}
              allLists={allLists}
              onRefresh={onRefresh}
            />
          </div>

          {/* Cards droppable area */}
          <Droppable droppableId={list.id} type="card">
            {(provided, snapshot) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className={`
                  flex-1 overflow-y-auto px-1.5 pb-2 space-y-2 scrollbar-thin
                  transition-colors duration-200 min-h-[40px]
                  ${snapshot.isDraggingOver ? 'bg-electric/5' : ''}
                `}
              >
                {isLoadingCards && visibleCards.length === 0 ? (
                  <>
                    {[0, 1, 2].map((i) => (
                      <div key={`skel-${i}`} className="animate-pulse rounded-xl bg-cream-dark/50 dark:bg-slate-700/40 h-[72px]" />
                    ))}
                  </>
                ) : (
                  visibleCards.map((placement, cardIndex) =>
                    placement.card.is_separator ? (
                      <SeparatorCard
                        key={placement.id}
                        placementId={placement.id}
                        index={cardIndex}
                        title={placement.card.title !== '---' ? placement.card.title : undefined}
                      />
                    ) : (
                      <BoardCard
                        key={placement.id}
                        card={placement.card}
                        placement_id={placement.id}
                        index={cardIndex}
                        labels={placement.labels || []}
                        assignees={placement.assignees || []}
                        is_mirror={placement.is_mirror}
                        onClick={() => onCardClick(placement.card.id)}
                        selected={selectedCards?.has(placement.card.id)}
                        onToggleSelect={toggleCardSelection}
                        comment_count={placement.comment_count || 0}
                        attachment_count={placement.attachment_count || 0}
                        checklist_total={placement.checklist_total || 0}
                        checklist_done={placement.checklist_done || 0}
                        cover_image_url={placement.cover_image_url || null}
                        boardId={boardId}
                        boardName={boardName}
                        onRefresh={onRefresh}
                      />
                    )
                  ))
                }
                {provided.placeholder}

                {/* Show more button for large lists */}
                {hasMore && (
                  <button
                    onClick={() => setVisibleCount((prev) => prev + CARDS_PER_PAGE)}
                    className="w-full py-2 rounded-xl text-xs font-medium text-navy/50 dark:text-slate-400 hover:text-electric dark:hover:text-electric hover:bg-white/50 dark:hover:bg-slate-700/50 transition-colors font-body"
                  >
                    Show {Math.min(hiddenCount, CARDS_PER_PAGE)} more ({hiddenCount} hidden)
                  </button>
                )}
              </div>
            )}
          </Droppable>

          {/* Add card */}
          {isAddingCard ? (
            <div className="px-1.5 pb-2">
              <textarea
                value={newCardTitle}
                onChange={(e) => setNewCardTitle(e.target.value)}
                placeholder="Enter a title..."
                className="w-full p-2.5 rounded-xl bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric resize-none font-body"
                rows={2}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleAddCard();
                  }
                  if (e.key === 'Escape') setIsAddingCard(false);
                }}
              />
              <div className="flex gap-2 mt-2">
                <Button size="sm" onClick={handleAddCard} loading={loading}>
                  Add Card
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setIsAddingCard(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsAddingCard(true)}
              className="mx-1.5 mb-2 px-3 py-2.5 rounded-xl text-sm text-navy/40 dark:text-slate-400 hover:text-navy/60 dark:hover:text-slate-300 hover:bg-cream-dark/50 dark:hover:bg-slate-800/50 transition-all duration-200 text-left font-body w-[calc(100%-0.75rem)] min-h-[44px] flex items-center"
            >
              + Add a card
            </button>
          )}
        </div>
      )}
    </Draggable>
  );
}
