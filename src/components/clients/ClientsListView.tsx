'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Client } from '@/lib/types';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';

interface CalendarEvent {
  id: string;
  google_event_id: string;
  title: string;
  start_time: string;
  end_time: string;
  is_recurring: boolean;
}

interface BoardItem {
  id: string;
  name: string;
  type: string;
}

interface ListItem {
  id: string;
  board_id: string;
  name: string;
  position: number;
}

interface CardItem {
  id: string;
  title: string;
  priority: string;
  client_id: string | null;
}

interface SelectedCard {
  id: string;
  title: string;
  boardName: string;
  listName: string;
}

export default function ClientsListView() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createdClientId, setCreatedClientId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    contract_type: '',
    notes: '',
    email: '',
    phone: '',
    location: '',
  });

  // Calendar event matching
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [eventFilter, setEventFilter] = useState('');
  const [selectedEventTitle, setSelectedEventTitle] = useState('');
  const [showCalendarSection, setShowCalendarSection] = useState(false);

  // Board card picker
  const [showCardSection, setShowCardSection] = useState(false);
  const [boards, setBoards] = useState<BoardItem[]>([]);
  const [lists, setLists] = useState<ListItem[]>([]);
  const [cards, setCards] = useState<CardItem[]>([]);
  const [loadingBoards, setLoadingBoards] = useState(false);
  const [loadingLists, setLoadingLists] = useState(false);
  const [loadingCards, setLoadingCards] = useState(false);
  const [selectedBoard, setSelectedBoard] = useState<BoardItem | null>(null);
  const [selectedList, setSelectedList] = useState<ListItem | null>(null);
  const [selectedCards, setSelectedCards] = useState<SelectedCard[]>([]);

  const router = useRouter();

  const fetchClients = async () => {
    try {
      const res = await fetch('/api/clients');
      const json = await res.json();
      if (json.data) setClients(json.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  // Fetch calendar events when calendar section is opened
  useEffect(() => {
    if (showCalendarSection && calendarEvents.length === 0 && !loadingEvents) {
      setLoadingEvents(true);
      fetch('/api/google-calendar/events?days=30')
        .then(r => r.json())
        .then(json => setCalendarEvents(json.data || []))
        .catch(() => {})
        .finally(() => setLoadingEvents(false));
    }
  }, [showCalendarSection]);

  // Fetch boards when card section is opened
  useEffect(() => {
    if (showCardSection && boards.length === 0 && !loadingBoards) {
      setLoadingBoards(true);
      fetch('/api/boards')
        .then(r => r.json())
        .then(json => setBoards(json.data || []))
        .catch(() => {})
        .finally(() => setLoadingBoards(false));
    }
  }, [showCardSection]);

  const handleBoardChange = async (boardId: string) => {
    const board = boards.find(b => b.id === boardId) || null;
    setSelectedBoard(board);
    setSelectedList(null);
    setLists([]);
    setCards([]);
    if (!boardId) return;

    setLoadingLists(true);
    try {
      const res = await fetch(`/api/boards/${boardId}/lists`);
      const json = await res.json();
      setLists(json.data || []);
    } catch {} finally {
      setLoadingLists(false);
    }
  };

  const handleListChange = async (listId: string) => {
    const list = lists.find(l => l.id === listId) || null;
    setSelectedList(list);
    setCards([]);
    if (!listId || !selectedBoard) return;

    setLoadingCards(true);
    try {
      const res = await fetch(`/api/boards/${selectedBoard.id}/cards/paginated?list_id=${listId}&limit=100`);
      const json = await res.json();
      const result = json.data;
      setCards(result?.cards || result || []);
    } catch {} finally {
      setLoadingCards(false);
    }
  };

  const toggleCard = (card: CardItem) => {
    const already = selectedCards.find(c => c.id === card.id);
    if (already) {
      setSelectedCards(prev => prev.filter(c => c.id !== card.id));
    } else {
      setSelectedCards(prev => [...prev, {
        id: card.id,
        title: card.title,
        boardName: selectedBoard?.name || '',
        listName: selectedList?.name || '',
      }]);
    }
  };

  const isCardSelected = (cardId: string) => selectedCards.some(c => c.id === cardId);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setCreating(true);
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          company: formData.company.trim() || undefined,
          contract_type: formData.contract_type.trim() || undefined,
          notes: formData.notes.trim() || undefined,
          email: formData.email.trim() || undefined,
          phone: formData.phone.trim() || undefined,
          location: formData.location.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (res.ok && json.data?.id) {
        const newClientId = json.data.id;
        setCreatedClientId(newClientId);
        fetchClients();

        // If a calendar event was selected, create meeting config
        if (selectedEventTitle.trim()) {
          fetch(`/api/clients/${newClientId}/meeting-config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              calendar_event_keyword: selectedEventTitle.trim(),
              update_timing: '1_hour_before',
              send_mode: 'approve',
              is_active: true,
            }),
          }).catch(() => {});
        }

        // Link selected board cards to this client
        for (const card of selectedCards) {
          fetch(`/api/cards/${card.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: newClientId }),
          }).catch(() => {});
        }
      }
    } finally {
      setCreating(false);
    }
  };

  const closeCreateModal = () => {
    setShowCreate(false);
    setCreatedClientId(null);
    setFormData({ name: '', company: '', contract_type: '', notes: '', email: '', phone: '', location: '' });
    setSelectedEventTitle('');
    setEventFilter('');
    setShowCalendarSection(false);
    setShowCardSection(false);
    setSelectedBoard(null);
    setSelectedList(null);
    setLists([]);
    setCards([]);
    setSelectedCards([]);
  };

  // Deduplicate recurring events by title
  const uniqueEvents = calendarEvents.reduce<CalendarEvent[]>((acc, e) => {
    if (!acc.find(x => x.title === e.title)) acc.push(e);
    return acc;
  }, []);

  const filteredEvents = eventFilter.trim()
    ? uniqueEvents.filter(e => e.title.toLowerCase().includes(eventFilter.toLowerCase()))
    : uniqueEvents;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-cream dark:bg-dark-bg">
        <div className="flex items-center gap-3 text-navy/40 dark:text-slate-500">
          <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="font-body">Loading clients...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-cream dark:bg-dark-bg p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <p className="text-navy/60 dark:text-slate-400 font-body text-sm">
            {clients.length} client{clients.length !== 1 ? 's' : ''} total
          </p>
          <Button onClick={() => setShowCreate(true)}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Create Client
          </Button>
        </div>

        {/* Client Grid */}
        {clients.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-cream-dark dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-navy/30">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <p className="text-navy/40 dark:text-slate-500 font-body text-sm mb-4">No clients yet. Create your first client to get started.</p>
            <Button onClick={() => setShowCreate(true)} size="sm">
              Create Client
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {clients.map((client) => (
              <div
                key={client.id}
                className="group text-left bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 hover:border-electric/30 p-5 transition-all duration-200 hover:shadow-lg"
              >
                <button
                  onClick={() => router.push(`/client/${client.id}/map`)}
                  className="w-full text-left"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-electric/10 flex items-center justify-center shrink-0 group-hover:bg-electric/20 transition-colors">
                      <span className="text-electric font-heading font-bold text-sm">
                        {client.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    {client.contract_type && (
                      <span className="text-[10px] font-semibold text-electric bg-electric/10 px-2 py-0.5 rounded-full uppercase tracking-wide">
                        {client.contract_type}
                      </span>
                    )}
                  </div>
                  <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-base mb-1 group-hover:text-electric transition-colors">
                    {client.name}
                  </h3>
                  {client.company && (
                    <p className="text-navy/50 dark:text-slate-400 font-body text-sm mb-2">{client.company}</p>
                  )}
                  <div className="flex items-center gap-3 text-navy/40 dark:text-slate-500 text-xs font-body">
                    {client.contacts && client.contacts.length > 0 && (
                      <span className="flex items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                        </svg>
                        {client.contacts.length} contact{client.contacts.length !== 1 ? 's' : ''}
                      </span>
                    )}
                    {client.client_tag && (
                      <span className="bg-cream-dark dark:bg-slate-800 px-1.5 py-0.5 rounded text-navy/50 dark:text-slate-400">
                        {client.client_tag}
                      </span>
                    )}
                  </div>
                </button>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-cream-dark dark:border-slate-700">
                  <button
                    onClick={() => router.push(`/client/${client.id}/portal`)}
                    className="flex items-center gap-1.5 text-xs font-body text-navy/40 dark:text-slate-500 hover:text-electric transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
                    </svg>
                    Client Board
                  </button>
                  <span className="text-navy/20 dark:text-slate-700">|</span>
                  <button
                    onClick={() => router.push(`/client/${client.id}/map`)}
                    className="flex items-center gap-1.5 text-xs font-body text-navy/40 dark:text-slate-500 hover:text-electric transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" />
                    </svg>
                    Strategy Map
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Client Modal */}
      <Modal isOpen={showCreate} onClose={closeCreateModal} size="xl">
        {!createdClientId ? (
          <form onSubmit={handleCreate} className="p-6">
            <h2 className="text-lg font-heading font-semibold text-navy dark:text-slate-100 mb-4">Create Client</h2>

            {/* Basic Info */}
            <div className="space-y-4">
              <Input
                label="Client Name"
                placeholder="Enter client name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
              <Input
                label="Company"
                placeholder="Company name (optional)"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
              />

              {/* Contact Info Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Email"
                  type="email"
                  placeholder="client@company.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
                <Input
                  label="Phone"
                  type="tel"
                  placeholder="+1 (555) 123-4567"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <Input
                label="Location"
                placeholder="City, Country (optional)"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              />

              <div className="w-full">
                <label className="block text-sm font-semibold text-navy dark:text-slate-100 mb-1.5 font-body">
                  Contract Type
                </label>
                <select
                  value={formData.contract_type}
                  onChange={(e) => setFormData({ ...formData, contract_type: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-dark-surface border-2 border-navy/20 dark:border-slate-700 text-navy dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-all duration-200 font-body text-sm"
                >
                  <option value="">Select type (optional)</option>
                  <option value="retainer">Retainer</option>
                  <option value="project">Project</option>
                  <option value="hourly">Hourly</option>
                  <option value="consultation">Consultation</option>
                </select>
              </div>

              <div className="w-full">
                <label className="block text-sm font-semibold text-navy dark:text-slate-100 mb-1.5 font-body">
                  Notes
                </label>
                <textarea
                  placeholder="Additional notes (optional)"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-dark-surface border-2 border-navy/20 dark:border-slate-700 text-navy dark:text-slate-100 placeholder:text-navy/40 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-all duration-200 font-body text-sm resize-none"
                />
              </div>
            </div>

            {/* Collapsible: Match Calendar Event */}
            <div className="mt-5 border border-cream-dark dark:border-slate-700 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowCalendarSection(!showCalendarSection)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-cream/50 dark:hover:bg-slate-800/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-electric" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" strokeWidth="2" />
                    <line x1="16" y1="2" x2="16" y2="6" strokeWidth="2" strokeLinecap="round" />
                    <line x1="8" y1="2" x2="8" y2="6" strokeWidth="2" strokeLinecap="round" />
                    <line x1="3" y1="10" x2="21" y2="10" strokeWidth="2" />
                  </svg>
                  <span className="text-sm font-semibold text-navy dark:text-slate-200 font-body">
                    Match Calendar Event
                  </span>
                  {selectedEventTitle && (
                    <span className="text-[10px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-medium">
                      Matched
                    </span>
                  )}
                </div>
                <svg
                  className={`w-4 h-4 text-navy/30 dark:text-slate-500 transition-transform ${showCalendarSection ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showCalendarSection && (
                <div className="px-4 pb-4 border-t border-cream-dark dark:border-slate-700">
                  <p className="text-xs text-navy/40 dark:text-slate-500 font-body mt-3 mb-2">
                    Select a recurring meeting to auto-generate prep before calls.
                  </p>

                  {selectedEventTitle ? (
                    <div className="flex items-center gap-2 bg-electric/5 dark:bg-electric/10 border border-electric/20 rounded-xl px-3 py-2">
                      <svg className="w-4 h-4 text-electric shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" strokeWidth="2" />
                        <line x1="16" y1="2" x2="16" y2="6" strokeWidth="2" strokeLinecap="round" />
                        <line x1="8" y1="2" x2="8" y2="6" strokeWidth="2" strokeLinecap="round" />
                        <line x1="3" y1="10" x2="21" y2="10" strokeWidth="2" />
                      </svg>
                      <span className="text-sm font-medium text-navy dark:text-slate-100 font-body flex-1">{selectedEventTitle}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedEventTitle('')}
                        className="text-navy/30 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={eventFilter}
                        onChange={e => setEventFilter(e.target.value)}
                        placeholder="Search your calendar events..."
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body mb-2"
                      />
                      <div className="max-h-40 overflow-y-auto rounded-xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface divide-y divide-cream-dark/50 dark:divide-slate-700/50">
                        {loadingEvents ? (
                          <div className="px-3 py-4 text-xs text-navy/40 dark:text-slate-500 font-body text-center">
                            Loading calendar events...
                          </div>
                        ) : filteredEvents.length === 0 ? (
                          <div className="px-3 py-4 text-xs text-navy/40 dark:text-slate-500 font-body text-center">
                            {calendarEvents.length === 0
                              ? 'No calendar events found. Connect Google Calendar first.'
                              : 'No events match your search.'}
                          </div>
                        ) : (
                          filteredEvents.map((event) => (
                            <button
                              key={event.id}
                              type="button"
                              onClick={() => { setSelectedEventTitle(event.title); setEventFilter(''); }}
                              className="w-full text-left px-3 py-2.5 text-sm font-body transition-colors hover:bg-electric/5 dark:hover:bg-electric/10 cursor-pointer flex items-center gap-3"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-navy dark:text-slate-200 font-medium truncate">{event.title}</p>
                                <p className="text-[11px] text-navy/40 dark:text-slate-500 mt-0.5">
                                  Next: {new Date(event.start_time).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                                  {' at '}
                                  {new Date(event.start_time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                                  {event.is_recurring && (
                                    <span className="ml-1.5 text-electric/70">&#8635; recurring</span>
                                  )}
                                </p>
                              </div>
                              <svg className="w-4 h-4 text-navy/20 dark:text-slate-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <line x1="12" y1="5" x2="12" y2="19" strokeWidth="2" strokeLinecap="round" />
                                <line x1="5" y1="12" x2="19" y2="12" strokeWidth="2" strokeLinecap="round" />
                              </svg>
                            </button>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Collapsible: Link Board Cards */}
            <div className="mt-3 border border-cream-dark dark:border-slate-700 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowCardSection(!showCardSection)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-cream/50 dark:hover:bg-slate-800/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-electric" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
                  </svg>
                  <span className="text-sm font-semibold text-navy dark:text-slate-200 font-body">
                    Link Board Cards
                  </span>
                  {selectedCards.length > 0 && (
                    <span className="text-[10px] bg-electric/10 text-electric px-2 py-0.5 rounded-full font-medium">
                      {selectedCards.length} selected
                    </span>
                  )}
                </div>
                <svg
                  className={`w-4 h-4 text-navy/30 dark:text-slate-500 transition-transform ${showCardSection ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showCardSection && (
                <div className="px-4 pb-4 border-t border-cream-dark dark:border-slate-700">
                  <p className="text-xs text-navy/40 dark:text-slate-500 font-body mt-3 mb-3">
                    Pick cards from your boards to link to this client.
                  </p>

                  {/* Selected cards */}
                  {selectedCards.length > 0 && (
                    <div className="space-y-1.5 mb-3">
                      {selectedCards.map(card => (
                        <div key={card.id} className="flex items-center gap-2 bg-electric/5 dark:bg-electric/10 border border-electric/20 rounded-lg px-3 py-2">
                          <svg className="w-3.5 h-3.5 text-electric shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-navy dark:text-slate-200 font-body truncate">{card.title}</p>
                            <p className="text-[10px] text-navy/40 dark:text-slate-500 font-body truncate">{card.boardName} &rsaquo; {card.listName}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedCards(prev => prev.filter(c => c.id !== card.id))}
                            className="text-navy/30 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Board selector */}
                  <select
                    value={selectedBoard?.id ?? ''}
                    onChange={(e) => handleBoardChange(e.target.value)}
                    disabled={loadingBoards}
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-navy/15 dark:border-slate-700 text-sm font-body text-navy dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-all disabled:opacity-50 mb-2"
                  >
                    <option value="">
                      {loadingBoards ? 'Loading boards...' : 'Select a board'}
                    </option>
                    {boards.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>

                  {/* List selector */}
                  {selectedBoard && (
                    <select
                      value={selectedList?.id ?? ''}
                      onChange={(e) => handleListChange(e.target.value)}
                      disabled={loadingLists}
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-navy/15 dark:border-slate-700 text-sm font-body text-navy dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-all disabled:opacity-50 mb-2"
                    >
                      <option value="">
                        {loadingLists ? 'Loading lists...' : 'Select a list'}
                      </option>
                      {lists.map(l => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </select>
                  )}

                  {/* Card list */}
                  {selectedList && (
                    <div className="max-h-48 overflow-y-auto rounded-lg border border-navy/15 dark:border-slate-700 bg-white dark:bg-dark-surface divide-y divide-cream-dark/50 dark:divide-slate-700/50">
                      {loadingCards ? (
                        <div className="px-3 py-4 text-xs text-navy/40 dark:text-slate-500 font-body text-center">
                          Loading cards...
                        </div>
                      ) : cards.length === 0 ? (
                        <div className="px-3 py-4 text-xs text-navy/40 dark:text-slate-500 font-body text-center">
                          No cards in this list.
                        </div>
                      ) : (
                        cards.map(card => {
                          const selected = isCardSelected(card.id);
                          const alreadyLinked = !!card.client_id && !selected;
                          return (
                            <button
                              key={card.id}
                              type="button"
                              onClick={() => !alreadyLinked && toggleCard(card)}
                              disabled={alreadyLinked}
                              className={`w-full text-left px-3 py-2 text-xs font-body transition-colors flex items-center gap-2 ${
                                selected
                                  ? 'text-electric bg-electric/5 dark:bg-electric/10'
                                  : alreadyLinked
                                  ? 'text-navy/30 dark:text-slate-600 bg-cream/30 dark:bg-slate-800/20 cursor-default'
                                  : 'text-navy dark:text-slate-200 hover:bg-electric/5 dark:hover:bg-electric/10 cursor-pointer'
                              }`}
                            >
                              {selected ? (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-electric">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              ) : alreadyLinked ? (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                                </svg>
                              ) : (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-navy/20 dark:text-slate-600">
                                  <line x1="12" y1="5" x2="12" y2="19" />
                                  <line x1="5" y1="12" x2="19" y2="12" />
                                </svg>
                              )}
                              <span className="truncate">{card.title}</span>
                              {alreadyLinked && (
                                <span className="text-[10px] text-navy/25 dark:text-slate-600 ml-auto shrink-0">linked</span>
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <Button type="button" variant="secondary" onClick={closeCreateModal}>
                Cancel
              </Button>
              <Button type="submit" loading={creating} disabled={!formData.name.trim()}>
                Create Client
              </Button>
            </div>
          </form>
        ) : (
          // Success view
          <div className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <h2 className="text-lg font-heading font-semibold text-navy dark:text-slate-100">Client Created</h2>
            </div>

            <div className="space-y-3 mb-6">
              {selectedEventTitle && (
                <div className="flex items-center gap-2 bg-electric/5 dark:bg-electric/10 border border-electric/20 rounded-xl px-3 py-2">
                  <svg className="w-4 h-4 text-electric shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" strokeWidth="2" />
                    <line x1="16" y1="2" x2="16" y2="6" strokeWidth="2" strokeLinecap="round" />
                    <line x1="8" y1="2" x2="8" y2="6" strokeWidth="2" strokeLinecap="round" />
                    <line x1="3" y1="10" x2="21" y2="10" strokeWidth="2" />
                  </svg>
                  <span className="text-xs font-medium text-navy dark:text-slate-200 font-body">
                    Meeting prep linked: <span className="text-electric">{selectedEventTitle}</span>
                  </span>
                </div>
              )}

              {selectedCards.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase tracking-wider font-body">
                    Linked Cards ({selectedCards.length})
                  </p>
                  {selectedCards.map(card => (
                    <div key={card.id} className="flex items-center gap-2 bg-cream/60 dark:bg-slate-800/40 rounded-lg px-3 py-2">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-green-500 shrink-0">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-navy dark:text-slate-200 font-body truncate">{card.title}</p>
                        <p className="text-[10px] text-navy/40 dark:text-slate-500 font-body truncate">{card.boardName} &rsaquo; {card.listName}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-between items-center gap-3 pt-4 border-t border-cream-dark dark:border-slate-700">
              <button
                type="button"
                onClick={() => router.push(`/client/${createdClientId}/map`)}
                className="text-xs text-electric hover:text-electric/80 font-body font-medium"
              >
                Go to client map &rarr;
              </button>
              <Button type="button" onClick={closeCreateModal}>
                Done
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
