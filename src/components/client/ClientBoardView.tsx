'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { createClient } from '@/lib/supabase/client';
import ClientCardModal from './ClientCardModal';
import ClientSettings from './ClientSettings';
import ClientTicketSubmit from './ClientTicketSubmit';
import { Card, CardPlacement, List } from '@/lib/types';

interface ClientBoardViewProps {
  clientId: string;
}

interface BoardData {
  board: any;
  lists: List[];
  cards: Card[];
  placements: CardPlacement[];
  client: any;
}

export default function ClientBoardView({ clientId }: ClientBoardViewProps) {
  const [data, setData] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [showTicketForm, setShowTicketForm] = useState(false);
  const searchParams = useSearchParams();
  const showSettings = searchParams.get('tab') === 'settings';
  const supabase = createClient();

  const fetchData = useCallback(async () => {
    const res = await fetch('/api/client-board/data');
    if (res.ok) {
      const json = await res.json();
      setData(json.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDragEnd = useCallback(
    async (result: DropResult) => {
      if (!result.destination || !data) return;

      const { source, destination, draggableId } = result;
      if (source.droppableId === destination.droppableId && source.index === destination.index) return;

      // Optimistic update
      setData((prev) => {
        if (!prev) return prev;
        const newPlacements = [...prev.placements];
        const placementIdx = newPlacements.findIndex((p) => p.id === draggableId);
        if (placementIdx === -1) return prev;

        const placement = { ...newPlacements[placementIdx] };
        placement.list_id = destination.droppableId;
        placement.position = destination.index;
        newPlacements[placementIdx] = placement;

        // Reorder positions in destination list
        const destPlacements = newPlacements
          .filter((p) => p.list_id === destination.droppableId && p.id !== draggableId)
          .sort((a, b) => a.position - b.position);

        destPlacements.splice(destination.index, 0, placement);
        destPlacements.forEach((p, i) => {
          const idx = newPlacements.findIndex((np) => np.id === p.id);
          if (idx !== -1) newPlacements[idx] = { ...newPlacements[idx], position: i };
        });

        return { ...prev, placements: newPlacements };
      });

      // Persist to server
      await supabase
        .from('card_placements')
        .update({ list_id: destination.droppableId, position: destination.index })
        .eq('id', draggableId);
    },
    [data, supabase]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-electric" />
      </div>
    );
  }

  if (showSettings) {
    return <ClientSettings clientId={clientId} />;
  }

  if (!data?.board) {
    return (
      <div className="flex items-center justify-center h-full text-muted">
        <p>Your board is being set up. Please check back soon.</p>
      </div>
    );
  }

  const getListPlacements = (listId: string) =>
    data.placements
      .filter((p) => p.list_id === listId)
      .sort((a, b) => a.position - b.position);

  const getCard = (cardId: string) => data.cards.find((c) => c.id === cardId);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border bg-surface">
        <div>
          <h1 className="text-lg font-heading font-semibold text-white">
            {data.board.name}
          </h1>
          {data.client?.company && (
            <p className="text-sm text-muted">{data.client.company}</p>
          )}
        </div>
        <button
          onClick={() => setShowTicketForm(true)}
          className="px-4 py-2 bg-electric hover:bg-electric-bright text-white rounded-lg text-sm font-medium transition-colors"
        >
          Submit Ticket
        </button>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto p-4">
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex gap-4 h-full">
            {data.lists.map((list) => {
              const placements = getListPlacements(list.id);
              return (
                <div
                  key={list.id}
                  className="w-72 shrink-0 bg-surface-raised rounded-xl flex flex-col max-h-full"
                >
                  {/* List header */}
                  <div className="px-3 py-2.5 flex items-center justify-between">
                    <h3 className="text-sm font-medium text-white/80">
                      {list.name}
                    </h3>
                    <span className="text-xs text-muted bg-white/5 px-1.5 py-0.5 rounded">
                      {placements.length}
                    </span>
                  </div>

                  {/* Cards */}
                  <Droppable droppableId={list.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`flex-1 overflow-y-auto px-2 pb-2 space-y-2 min-h-[60px] ${
                          snapshot.isDraggingOver ? 'bg-electric/5 rounded-lg' : ''
                        }`}
                      >
                        {placements.map((placement, index) => {
                          const card = getCard(placement.card_id);
                          if (!card) return null;
                          return (
                            <Draggable
                              key={placement.id}
                              draggableId={placement.id}
                              index={index}
                            >
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  onClick={() => setSelectedCardId(card.id)}
                                  className={`cursor-pointer ${
                                    snapshot.isDragging ? 'opacity-80 rotate-2' : ''
                                  }`}
                                >
                                  <SimpleClientCard card={card} />
                                </div>
                              )}
                            </Draggable>
                          );
                        })}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </DragDropContext>
      </div>

      {/* Card Modal */}
      {selectedCardId && (
        <ClientCardModal
          cardId={selectedCardId}
          onClose={() => setSelectedCardId(null)}
          onRefresh={fetchData}
        />
      )}

      {/* Ticket Submit Modal */}
      {showTicketForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-heading font-semibold text-white">Submit a Ticket</h2>
              <button
                onClick={() => setShowTicketForm(false)}
                className="text-muted hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <ClientTicketSubmit
              clientId={clientId}
              onSubmit={() => {
                setShowTicketForm(false);
                fetchData();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-blue-500',
};

const STATUS_LABEL: Record<string, string> = {
  in_progress: 'In Progress',
  ready_for_review: 'Ready for Review',
  approved: 'Approved',
  delivered: 'Delivered',
  revision_requested: 'Revision Requested',
};

function SimpleClientCard({ card }: { card: Card }) {
  return (
    <div className="bg-surface rounded-lg border border-white/5 hover:border-electric/30 p-3 transition-colors">
      <div className="flex items-start gap-2">
        {card.priority && card.priority !== 'none' && (
          <span
            className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${PRIORITY_DOT[card.priority] || 'bg-white/20'}`}
          />
        )}
        <h4 className="text-sm font-medium text-white leading-snug flex-1">{card.title}</h4>
      </div>
      {(card.client_status || card.due_date) && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          {card.client_status && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-electric/15 text-electric font-medium">
              {STATUS_LABEL[card.client_status] || card.client_status}
            </span>
          )}
          {card.due_date && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-muted">
              {new Date(card.due_date).toLocaleDateString()}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
