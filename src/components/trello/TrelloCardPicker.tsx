'use client';

import { useState, useEffect, useCallback } from 'react';

interface TrelloBoard {
  id: string;
  name: string;
}

interface TrelloList {
  id: string;
  name: string;
  idBoard: string;
}

interface TrelloCard {
  id: string;
  name: string;
  idList: string;
}

interface LinkedCard {
  id: string;
  trello_board_name: string;
  trello_list_name: string;
  trello_card_id: string;
  trello_card_name: string;
  created_at: string;
}

interface TrelloCardPickerProps {
  clientId?: string; // if provided, shows linked cards and persists to DB
  onSelect?: (card: {
    trello_board_id: string;
    trello_board_name: string;
    trello_list_id: string;
    trello_list_name: string;
    trello_card_id: string;
    trello_card_name: string;
  }) => void;
  compact?: boolean;
}

export default function TrelloCardPicker({ clientId, onSelect, compact }: TrelloCardPickerProps) {
  const [boards, setBoards] = useState<TrelloBoard[]>([]);
  const [lists, setLists] = useState<TrelloList[]>([]);
  const [cards, setCards] = useState<TrelloCard[]>([]);
  const [linked, setLinked] = useState<LinkedCard[]>([]);

  const [selectedBoard, setSelectedBoard] = useState<TrelloBoard | null>(null);
  const [selectedList, setSelectedList] = useState<TrelloList | null>(null);

  const [loadingBoards, setLoadingBoards] = useState(false);
  const [loadingLists, setLoadingLists] = useState(false);
  const [loadingCards, setLoadingCards] = useState(false);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch boards on mount ──────────────────────────────────────────
  useEffect(() => {
    setLoadingBoards(true);
    setError(null);
    fetch('/api/trello/browse')
      .then((r) => r.json())
      .then((json) => {
        if (json.error) {
          setError(json.error);
        } else {
          setBoards(json.data ?? []);
        }
      })
      .catch(() => setError('Failed to load boards'))
      .finally(() => setLoadingBoards(false));
  }, []);

  // ── Fetch linked cards if clientId provided ────────────────────────
  const fetchLinked = useCallback(async () => {
    if (!clientId) return;
    const res = await fetch(`/api/clients/${clientId}/trello-cards`);
    const json = await res.json();
    if (json.data) setLinked(json.data);
  }, [clientId]);

  useEffect(() => {
    fetchLinked();
  }, [fetchLinked]);

  // ── Board selected → fetch lists ──────────────────────────────────
  const handleBoardChange = async (boardId: string) => {
    const board = boards.find((b) => b.id === boardId);
    setSelectedBoard(board ?? null);
    setSelectedList(null);
    setLists([]);
    setCards([]);

    if (!boardId) return;

    setLoadingLists(true);
    try {
      const res = await fetch(`/api/trello/browse?board_id=${boardId}`);
      const json = await res.json();
      setLists(json.data ?? []);
    } finally {
      setLoadingLists(false);
    }
  };

  // ── List selected → fetch cards ───────────────────────────────────
  const handleListChange = async (listId: string) => {
    const list = lists.find((l) => l.id === listId);
    setSelectedList(list ?? null);
    setCards([]);

    if (!listId) return;

    setLoadingCards(true);
    try {
      const res = await fetch(`/api/trello/browse?list_id=${listId}`);
      const json = await res.json();
      setCards(json.data ?? []);
    } finally {
      setLoadingCards(false);
    }
  };

  // ── Link card ─────────────────────────────────────────────────────
  const handleLinkCard = async (card: TrelloCard) => {
    if (!selectedBoard || !selectedList) return;

    const payload = {
      trello_board_id: selectedBoard.id,
      trello_board_name: selectedBoard.name,
      trello_list_id: selectedList.id,
      trello_list_name: selectedList.name,
      trello_card_id: card.id,
      trello_card_name: card.name,
    };

    // Notify parent (for creation flow where clientId doesn't exist yet)
    onSelect?.(payload);

    // If clientId exists, persist to DB
    if (clientId) {
      setLinking(true);
      try {
        const res = await fetch(`/api/clients/${clientId}/trello-cards`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (json.error) {
          setError(json.error);
        } else {
          await fetchLinked();
          // Reset selection after linking
          setSelectedList(null);
          setCards([]);
        }
      } finally {
        setLinking(false);
      }
    }
  };

  // ── Unlink card ───────────────────────────────────────────────────
  const handleUnlink = async (mappingId: string) => {
    if (!clientId) return;
    await fetch(`/api/clients/${clientId}/trello-cards/${mappingId}`, { method: 'DELETE' });
    setLinked((prev) => prev.filter((c) => c.id !== mappingId));
  };

  // Check if a card is already linked
  const isCardLinked = (cardId: string) => linked.some((l) => l.trello_card_id === cardId);

  if (error) {
    return (
      <div className={`${compact ? '' : 'p-4'} text-xs text-navy/40 dark:text-slate-500 font-body`}>
        <p className="text-amber-600 dark:text-amber-400">{error}</p>
      </div>
    );
  }

  return (
    <div className={compact ? '' : 'space-y-4'}>
      {/* Linked cards */}
      {linked.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase tracking-wider font-body">
            Tracked Tickets ({linked.length})
          </p>
          {linked.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-2 bg-cream/60 dark:bg-slate-800/40 rounded-lg px-3 py-2 group"
            >
              <TrelloIcon />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-navy dark:text-slate-200 font-body truncate">
                  {c.trello_card_name}
                </p>
                <p className="text-[10px] text-navy/40 dark:text-slate-500 font-body truncate">
                  {c.trello_board_name} &rsaquo; {c.trello_list_name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleUnlink(c.id)}
                className="opacity-0 group-hover:opacity-100 p-1 rounded text-navy/20 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400 transition-all"
                title="Stop tracking"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Cascading picker */}
      <div className="space-y-2.5">
        {linked.length === 0 && !compact && (
          <p className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase tracking-wider font-body">
            Track a Ticket
          </p>
        )}

        {/* Board selector */}
        <select
          value={selectedBoard?.id ?? ''}
          onChange={(e) => handleBoardChange(e.target.value)}
          disabled={loadingBoards}
          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-navy/15 dark:border-slate-700 text-sm font-body text-navy dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-all disabled:opacity-50"
        >
          <option value="">
            {loadingBoards ? 'Loading boards...' : 'Select a board'}
          </option>
          {boards.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>

        {/* List selector */}
        {selectedBoard && (
          <select
            value={selectedList?.id ?? ''}
            onChange={(e) => handleListChange(e.target.value)}
            disabled={loadingLists}
            className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-navy/15 dark:border-slate-700 text-sm font-body text-navy dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-all disabled:opacity-50"
          >
            <option value="">
              {loadingLists ? 'Loading lists...' : 'Select a list'}
            </option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        )}

        {/* Card list */}
        {selectedList && (
          <div className="max-h-48 overflow-auto rounded-lg border border-navy/15 dark:border-slate-700 bg-white dark:bg-dark-surface divide-y divide-cream-dark/50 dark:divide-slate-700/50">
            {loadingCards ? (
              <div className="px-3 py-4 text-xs text-navy/40 dark:text-slate-500 font-body text-center">
                Loading cards...
              </div>
            ) : cards.length === 0 ? (
              <div className="px-3 py-4 text-xs text-navy/40 dark:text-slate-500 font-body text-center">
                No cards in this list.
              </div>
            ) : (
              cards.map((card) => {
                const alreadyLinked = isCardLinked(card.id);
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => !alreadyLinked && handleLinkCard(card)}
                    disabled={alreadyLinked || linking}
                    className={`w-full text-left px-3 py-2 text-xs font-body transition-colors flex items-center gap-2 ${
                      alreadyLinked
                        ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/10 cursor-default'
                        : 'text-navy dark:text-slate-200 hover:bg-electric/5 dark:hover:bg-electric/10 cursor-pointer'
                    }`}
                  >
                    {alreadyLinked ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-navy/20 dark:text-slate-600">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    )}
                    <span className="truncate">{card.name}</span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TrelloIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0 text-[#0079BF]">
      <rect x="2" y="2" width="20" height="20" rx="3" fill="currentColor" />
      <rect x="5" y="5" width="5" height="12" rx="1" fill="white" />
      <rect x="13" y="5" width="5" height="8" rx="1" fill="white" />
    </svg>
  );
}
