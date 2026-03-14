'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Board, Client } from '@/lib/types';
import { BOARD_TYPE_CONFIG } from '@/lib/constants';
// canAccessBoardByRole is now handled server-side in /api/boards
import { useAuth } from '@/hooks/useAuth';
import { usePresence } from '@/hooks/usePresence';
import Avatar from '@/components/ui/Avatar';
import { useAppStore } from '@/stores/app-store';
import { slugify } from '@/lib/slugify';
import ProfilePopover from '@/components/layout/ProfilePopover';
import { useRouter } from 'next/navigation';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

interface SidebarProps {
  initialBoards?: Board[];
}

export default function Sidebar({ initialBoards }: SidebarProps = {}) {
  const [boards, setBoards] = useState<Board[]>([]);
  const [boardsLoaded, setBoardsLoaded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [showTeamBoards, setShowTeamBoards] = useState(true);
  const [showClientBoards, setShowClientBoards] = useState(false);
  const [showClients, setShowClients] = useState(true);
  const [clients, setClients] = useState<(Pick<Client, 'id' | 'name' | 'is_starred'> & { next_event_time: string | null; next_event_title: string | null })[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const pathname = usePathname();
  const { profile, user, signOut } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  const { presentUsers } = usePresence({ channelName: 'app:global' });
  const onlineOthers = presentUsers.filter(u => u.userId !== user?.id);
  const { mobileSidebarOpen, setMobileSidebarOpen } = useAppStore();

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname, setMobileSidebarOpen]);

  const toggleStar = useCallback(async (e: React.MouseEvent, boardId: string, currentStarred: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    lastStarToggleRef.current = Date.now();
    // Optimistic update
    setBoards(prev => prev.map(b => b.id === boardId ? { ...b, is_starred: !currentStarred } : b));
    // Write to DB via API
    await fetch(`/api/boards/${boardId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_starred: !currentStarred }),
    });
  }, []);

  const toggleClientStar = useCallback(async (e: React.MouseEvent, clientId: string, currentStarred: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    // Optimistic update
    setClients(prev => prev.map(c => c.id === clientId ? { ...c, is_starred: !currentStarred } : c));
    // Write to DB via API
    await fetch(`/api/clients/${clientId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_starred: !currentStarred }),
    });
  }, []);

  const lastStarToggleRef = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;

    const fetchBoards = async () => {
      try {
        const res = await fetch('/api/boards');
        if (res.ok) {
          const json = await res.json();
          if (json.data && !cancelled) { setBoards(json.data as Board[]); setBoardsLoaded(true); }
        }
      } catch {
        // Network error - boards will stay at initialBoards or empty
      }
    };

    const fetchClients = async () => {
      try {
        const res = await fetch('/api/clients');
        if (res.ok) {
          const json = await res.json();
          if (json.data && !cancelled) {
            setClients(json.data.map((c: any) => ({
              id: c.id,
              name: c.name,
              is_starred: c.is_starred || false,
              next_event_time: c.next_event_time || null,
              next_event_title: c.next_event_title || null,
            })));
          }
        }
      } catch {}
    };

    // Always fetch fresh boards + clients on mount
    fetchBoards();
    fetchClients();

    // Listen for realtime board changes - but suppress within 2s of a star toggle
    const channel = supabase
      .channel('boards-sidebar')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'boards' }, () => {
        if (!cancelled && Date.now() - lastStarToggleRef.current > 2000) {
          fetchBoards();
        }
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Board sections: split into team / client
  const teamBoards = useMemo(() =>
    boards.filter(b => !b.is_archived && !b.client_id)
      .sort((a, b) => {
        if (a.is_starred !== b.is_starred) return a.is_starred ? -1 : 1;
        return (a.position ?? 0) - (b.position ?? 0);
      }),
    [boards]
  );

  const clientBoards = useMemo(() =>
    boards.filter(b => !b.is_archived && !!b.client_id)
      .sort((a, b) => {
        if (a.is_starred !== b.is_starred) return a.is_starred ? -1 : 1;
        return (a.position ?? 0) - (b.position ?? 0);
      }),
    [boards]
  );

  // Handle drag end for starred boards reordering
  const onDragEnd = useCallback(async (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination || (source.droppableId === destination.droppableId && source.index === destination.index)) return;

    lastStarToggleRef.current = Date.now(); // suppress realtime refetch

    const droppableId = source.droppableId; // 'team-starred' or 'client-starred'
    const isTeam = droppableId === 'team-starred';
    const sectionBoards = isTeam ? teamBoards : clientBoards;
    const starred = sectionBoards.filter(b => b.is_starred);

    // Reorder starred array
    const reordered = [...starred];
    const [moved] = reordered.splice(source.index, 1);
    reordered.splice(destination.index, 0, moved);

    // Assign new positions: starred get low positions (0, 1, 2...), unstarred keep theirs
    const updates: { id: string; position: number }[] = reordered.map((b, i) => ({
      id: b.id,
      position: i,
    }));

    // Optimistic update
    setBoards(prev => {
      const posMap = new Map(updates.map(u => [u.id, u.position]));
      return prev.map(b => posMap.has(b.id) ? { ...b, position: posMap.get(b.id)! } : b);
    });

    // Persist
    await fetch('/api/boards/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boards: updates }),
    });
  }, [teamBoards, clientBoards]);

  // Render a single board row
  const renderBoardItem = (board: Board, isDragging?: boolean) => {
    const config = BOARD_TYPE_CONFIG[board.type];
    const isActive = pathname === `/board/${slugify(board.name)}`;
    return (
      <>
        <span className="text-base">{config?.icon || '📋'}</span>
        {!collapsed && (
          <span className="truncate font-medium">{board.name}</span>
        )}
        {!collapsed && (
          <button
            onClick={(e) => toggleStar(e, board.id, board.is_starred)}
            className={`ml-auto shrink-0 transition-all ${
              board.is_starred
                ? 'text-yellow-400'
                : 'text-white/0 group-hover/board:text-white/30 hover:!text-yellow-400'
            }`}
            title={board.is_starred ? 'Unstar board' : 'Star board'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill={board.is_starred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
        )}
      </>
    );
  };

  // Render a board section with DnD for starred items
  const renderBoardSection = (
    sectionBoards: Board[],
    droppableId: string,
  ) => {
    const starred = sectionBoards.filter(b => b.is_starred);
    const unstarred = sectionBoards.filter(b => !b.is_starred);

    return (
      <>
        {/* Starred boards - draggable */}
        {starred.length > 0 && (
          <Droppable droppableId={droppableId}>
            {(provided, snapshot) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className={`transition-colors duration-200 rounded-lg ${
                  snapshot.isDraggingOver ? 'bg-white/5' : ''
                }`}
              >
                {starred.map((board, index) => (
                  <Draggable key={board.id} draggableId={board.id} index={index}>
                    {(dragProvided, dragSnapshot) => {
                      const isActive = pathname === `/board/${slugify(board.name)}`;
                      return (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          {...dragProvided.dragHandleProps}
                          style={dragProvided.draggableProps.style}
                          className={`
                            group/board flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-200 cursor-grab
                            ${dragSnapshot.isDragging
                              ? 'bg-electric/20 text-white shadow-lg shadow-electric/10 scale-[1.02] ring-1 ring-electric/30'
                              : isActive
                                ? 'bg-white/10 text-white'
                                : 'text-white/60 hover:text-white hover:bg-white/5'
                            }
                          `}
                          onClick={() => router.push(`/board/${slugify(board.name)}`)}
                        >
                          {renderBoardItem(board, dragSnapshot.isDragging)}
                        </div>
                      );
                    }}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        )}

        {/* Unstarred boards - static */}
        {unstarred.map((board) => {
          const isActive = pathname === `/board/${slugify(board.name)}`;
          return (
            <Link
              key={board.id}
              href={`/board/${slugify(board.name)}`}
              className={`
                group/board flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-200
                ${isActive
                  ? 'bg-white/10 text-white'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
                }
              `}
            >
              {renderBoardItem(board)}
            </Link>
          );
        })}
      </>
    );
  };

  return (
    <>
      {/* Mobile overlay backdrop */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
    <aside
      className={`
        ${collapsed ? 'md:w-16' : 'md:w-64'}
        w-72
        h-screen bg-navy/95 backdrop-blur-xl
        border-r border-white/5
        flex flex-col
        transition-all duration-300 ease-out
        shrink-0
        fixed md:relative z-50 md:z-auto
        ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}
    >
      {/* Header */}
      <div className="p-4 flex items-center justify-between">
        {!collapsed && (
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-electric flex items-center justify-center">
              <span className="text-white font-bold text-sm">KM</span>
            </div>
            <span className="text-white font-heading font-semibold text-lg">
              Kivi Media
            </span>
          </Link>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-white/50 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {collapsed ? (
              <><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></>
            ) : (
              <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>
            )}
          </svg>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin px-2 py-2 space-y-0.5">
        <Link
          href="/"
          className={`
            flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200
            ${pathname === '/'
              ? 'bg-white/10 text-white'
              : 'text-white/60 hover:text-white hover:bg-white/5'
            }
          `}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
          </svg>
          {!collapsed && <span>Boards</span>}
        </Link>

        <Link
          href="/settings"
          className={`
            flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200
            ${pathname?.startsWith('/settings')
              ? 'bg-white/10 text-white'
              : 'text-white/60 hover:text-white hover:bg-white/5'
            }
          `}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          {!collapsed && <span>Settings</span>}
        </Link>

        <Link
          href="/clients"
          className={`
            flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200
            ${pathname?.startsWith('/clients') || pathname?.startsWith('/client/')
              ? 'bg-white/10 text-white'
              : 'text-white/60 hover:text-white hover:bg-white/5'
            }
          `}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          {!collapsed && <span>Clients</span>}
        </Link>

        <Link
          href="/my-tasks"
          className={`
            flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200
            ${pathname?.startsWith('/my-tasks')
              ? 'bg-white/10 text-white'
              : 'text-white/60 hover:text-white hover:bg-white/5'
            }
          `}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          {!collapsed && <span>My Tasks</span>}
        </Link>

        <Link
          href="/team"
          className={`
            flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200
            ${pathname?.startsWith('/team') && !pathname?.startsWith('/team-pr')
              ? 'bg-white/10 text-white'
              : 'text-white/60 hover:text-white hover:bg-white/5'
            }
          `}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          {!collapsed && <span>Team</span>}
        </Link>

        <Link
          href="/agents"
          className={`
            flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200
            ${pathname?.startsWith('/agents') || pathname?.startsWith('/podcast') || pathname?.startsWith('/seo') || pathname?.startsWith('/pageforge') || pathname?.startsWith('/outreach') || pathname?.startsWith('/team-pr')
              ? 'bg-white/10 text-white'
              : 'text-white/60 hover:text-white hover:bg-white/5'
            }
          `}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" /><path d="M9 13v2" />
          </svg>
          {!collapsed && <span>Agents</span>}
        </Link>

        <Link
          href="/performance"
          className={`
            flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200
            ${pathname?.startsWith('/performance')
              ? 'bg-white/10 text-white'
              : 'text-white/60 hover:text-white hover:bg-white/5'
            }
          `}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          {!collapsed && <span>Performance</span>}
        </Link>

        <Link
          href="/tools"
          className={`
            flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200
            ${pathname?.startsWith('/tools')
              ? 'bg-white/10 text-white'
              : 'text-white/60 hover:text-white hover:bg-white/5'
            }
          `}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
          {!collapsed && <span>Tools</span>}
        </Link>

        <DragDropContext onDragEnd={onDragEnd}>
          {/* Team Boards accordion */}
          {!collapsed && boardsLoaded && (
            <button
              onClick={() => setShowTeamBoards(!showTeamBoards)}
              className="flex items-center gap-2 px-3 py-2 mt-4 text-[10px] font-semibold text-white/30 uppercase tracking-wider hover:text-white/50 transition-colors w-full"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points={showTeamBoards ? '18 15 12 9 6 15' : '6 9 12 15 18 9'} />
              </svg>
              <span>Team Boards ({teamBoards.length})</span>
            </button>
          )}

          {boardsLoaded && (collapsed || showTeamBoards) && renderBoardSection(teamBoards, 'team-starred')}

          {/* Client Boards accordion */}
          {!collapsed && boardsLoaded && (
            <button
              onClick={() => setShowClientBoards(!showClientBoards)}
              className="flex items-center gap-2 px-3 py-2 mt-3 text-[10px] font-semibold text-white/30 uppercase tracking-wider hover:text-white/50 transition-colors w-full"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points={showClientBoards ? '18 15 12 9 6 15' : '6 9 12 15 18 9'} />
              </svg>
              <span>Client Boards ({clientBoards.length})</span>
            </button>
          )}

          {boardsLoaded && (collapsed || showClientBoards) && renderBoardSection(clientBoards, 'client-starred')}
        </DragDropContext>

        {/* Clients accordion */}
        {!collapsed && clients.length > 0 && (
          <button
            onClick={() => setShowClients(!showClients)}
            className="flex items-center gap-2 px-3 py-2 mt-3 text-[10px] font-semibold text-white/30 uppercase tracking-wider hover:text-white/50 transition-colors w-full"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points={showClients ? '18 15 12 9 6 15' : '6 9 12 15 18 9'} />
            </svg>
            <span>Clients ({clients.length})</span>
          </button>
        )}

        {!collapsed && showClients && [...clients]
          .sort((a, b) => {
            // Starred first
            if (a.is_starred !== b.is_starred) return a.is_starred ? -1 : 1;
            // Then by next upcoming event (soonest first, null last)
            if (a.next_event_time && b.next_event_time) return a.next_event_time.localeCompare(b.next_event_time);
            if (a.next_event_time) return -1;
            if (b.next_event_time) return 1;
            // Then alphabetical
            return a.name.localeCompare(b.name);
          })
          .map((client) => {
          const isActive = pathname?.startsWith(`/client/${client.id}`);
          return (
            <Link
              key={client.id}
              href={`/client/${client.id}/map`}
              className={`
                group/client flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-200
                ${isActive
                  ? 'bg-white/10 text-white'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
                }
              `}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
              </svg>
              <span className="truncate font-medium">{client.name}</span>
              {client.next_event_time && (
                <div className="relative group/meeting shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-400">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-navy dark:bg-slate-800 text-white text-[11px] rounded-lg whitespace-nowrap opacity-0 group-hover/meeting:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg">
                    <div className="font-semibold">{client.next_event_title}</div>
                    <div className="text-white/60 mt-0.5">
                      {new Date(client.next_event_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at{' '}
                      {new Date(client.next_event_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </div>
                    <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-navy dark:border-t-slate-800" />
                  </div>
                </div>
              )}
              <button
                onClick={(e) => toggleClientStar(e, client.id, client.is_starred)}
                className={`ml-auto shrink-0 transition-all ${
                  client.is_starred
                    ? 'text-yellow-400'
                    : 'text-white/0 group-hover/client:text-white/30 hover:!text-yellow-400'
                }`}
                title={client.is_starred ? 'Unstar client' : 'Star client'}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill={client.is_starred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </button>
            </Link>
          );
        })}

        {/* Archived boards toggle */}
        {!collapsed && boardsLoaded && boards.some(b => b.is_archived) && (
          <>
            <button
              onClick={() => setShowArchived(!showArchived)}
              className="flex items-center gap-2 px-3 py-2 mt-3 text-[10px] font-semibold text-white/30 uppercase tracking-wider hover:text-white/50 transition-colors w-full"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points={showArchived ? '18 15 12 9 6 15' : '6 9 12 15 18 9'} />
              </svg>
              <span>Archived ({boards.filter(b => b.is_archived).length})</span>
            </button>
            {showArchived && boards
              .filter(b => b.is_archived)
              .map((board) => {
                const config = BOARD_TYPE_CONFIG[board.type];
                const isActive = pathname === `/board/${slugify(board.name)}`;
                return (
                  <Link
                    key={board.id}
                    href={`/board/${slugify(board.name)}`}
                    className={`
                      flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-200 opacity-50
                      ${isActive
                        ? 'bg-white/10 text-white'
                        : 'text-white/60 hover:text-white hover:bg-white/5'
                      }
                    `}
                  >
                    <span className="text-base">{config?.icon || '📋'}</span>
                    <span className="truncate font-medium">{board.name}</span>
                  </Link>
                );
              })
            }
          </>
        )}
      </nav>

      {/* Online users */}
      {!collapsed && onlineOthers.length > 0 && (
        <div className="px-3 py-2 border-t border-white/5">
          <span className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">
            Online ({onlineOthers.length})
          </span>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {onlineOthers.slice(0, 8).map((u) => (
              <div key={u.userId} className="relative" title={u.displayName}>
                <Avatar name={u.displayName} src={u.avatarUrl} size="sm" />
                <span className="absolute bottom-0 right-0 w-2 h-2 bg-green-400 rounded-full ring-1 ring-navy/95" />
              </div>
            ))}
            {onlineOthers.length > 8 && (
              <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-medium text-white/50">
                +{onlineOthers.length - 8}
              </div>
            )}
          </div>
        </div>
      )}

      {/* User section */}
      <div className="p-3 border-t border-white/5">
        <ProfilePopover profile={profile} user={user} signOut={signOut} collapsed={collapsed} />
      </div>
    </aside>
    </>
  );
}
