'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Board } from '@/lib/types';
import { BOARD_TYPE_CONFIG } from '@/lib/constants';
// canAccessBoardByRole is now handled server-side in /api/boards
import { useAuth } from '@/hooks/useAuth';
import { usePresence } from '@/hooks/usePresence';
import Avatar from '@/components/ui/Avatar';
import { useAppStore } from '@/stores/app-store';
import { slugify } from '@/lib/slugify';

interface SidebarProps {
  initialBoards?: Board[];
}

export default function Sidebar({ initialBoards }: SidebarProps = {}) {
  const [boards, setBoards] = useState<Board[]>(initialBoards || []);
  const [collapsed, setCollapsed] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const pathname = usePathname();
  const { profile, user, signOut } = useAuth();
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
    setBoards(prev => prev.map(b => b.id === boardId ? { ...b, is_starred: !currentStarred } : b));
    await supabase.from('boards').update({ is_starred: !currentStarred }).eq('id', boardId);
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;

    const fetchBoards = async () => {
      try {
        // Use API endpoint instead of direct Supabase client - more reliable
        // because cookies are sent automatically (no auth state timing issues)
        const res = await fetch('/api/boards');
        if (res.ok) {
          const json = await res.json();
          if (json.data && !cancelled) setBoards(json.data as Board[]);
        }
      } catch {
        // Network error - boards will stay at initialBoards or empty
      }
    };

    // Always fetch boards on mount (covers both SSR hydration and client navigation)
    fetchBoards();

    // Also re-fetch when user state changes (handles late auth)
    if (user) {
      fetchBoards();
    }

    // Listen for realtime board changes
    const channel = supabase
      .channel('boards-sidebar')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'boards' }, () => {
        if (!cancelled) fetchBoards();
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user]);

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
      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
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
          href="/proposals"
          className={`
            flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200
            ${pathname?.startsWith('/proposals')
              ? 'bg-white/10 text-white'
              : 'text-white/60 hover:text-white hover:bg-white/5'
            }
          `}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
          </svg>
          {!collapsed && <span>Proposals</span>}
        </Link>

        <Link
          href="/venues"
          className={`
            flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200
            ${pathname?.startsWith('/venues')
              ? 'bg-white/10 text-white'
              : 'text-white/60 hover:text-white hover:bg-white/5'
            }
          `}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
          </svg>
          {!collapsed && <span>Venues</span>}
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

        {!collapsed && (
          <div className="pt-4 pb-2 px-3">
            <span className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">
              Boards
            </span>
          </div>
        )}

        {boards
          .filter((board) => !board.is_archived)
          .sort((a, b) => (a.is_starred === b.is_starred ? 0 : a.is_starred ? -1 : 1))
          .map((board) => {
          const config = BOARD_TYPE_CONFIG[board.type];
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
            </Link>
          );
        })}

        {/* Archived boards toggle */}
        {!collapsed && boards.some(b => b.is_archived) && (
          <>
            <button
              onClick={() => setShowArchived(!showArchived)}
              className="flex items-center gap-2 px-3 py-2 mt-2 text-[11px] text-white/30 hover:text-white/50 transition-colors w-full"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
        <div className="flex items-center gap-3">
          {profile && (
            <Avatar name={profile.display_name} src={profile.avatar_url} size="sm" />
          )}
          {!collapsed && profile && (
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white font-medium truncate">
                {profile.display_name}
              </p>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={signOut}
              className="text-white/40 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              title="Sign out"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          )}
        </div>
      </div>
    </aside>
    </>
  );
}
