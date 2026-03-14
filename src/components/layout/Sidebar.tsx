'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
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
import ProfilePopover from '@/components/layout/ProfilePopover';
import { useRouter } from 'next/navigation';

interface SidebarProps {
  initialBoards?: Board[];
}

export default function Sidebar({ initialBoards }: SidebarProps = {}) {
  const [boards, setBoards] = useState<Board[]>(initialBoards || []);
  const [collapsed, setCollapsed] = useState(false);
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

  const lastStarToggleRef = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;

    const fetchBoards = async () => {
      try {
        const res = await fetch('/api/boards');
        if (res.ok) {
          const json = await res.json();
          if (json.data && !cancelled) setBoards(json.data as Board[]);
        }
      } catch {
        // Network error - boards will stay at initialBoards or empty
      }
    };

    // Always fetch boards on mount
    fetchBoards();
    if (user) fetchBoards();

    // Listen for realtime board changes — but suppress within 2s of a star toggle
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
            ${pathname?.startsWith('/team')
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
            ${pathname?.startsWith('/agents') || pathname?.startsWith('/podcast')
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
          href="/seo"
          className={`
            flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200
            ${pathname?.startsWith('/seo')
              ? 'bg-white/10 text-white'
              : 'text-white/60 hover:text-white hover:bg-white/5'
            }
          `}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /><path d="M16 13H8" /><path d="M16 17H8" /><path d="M10 9H8" />
          </svg>
          {!collapsed && <span>SEO Pipeline</span>}
        </Link>

        <Link
          href="/pageforge"
          className={`
            flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200
            ${pathname?.startsWith('/pageforge')
              ? 'bg-white/10 text-white'
              : 'text-white/60 hover:text-white hover:bg-white/5'
            }
          `}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 12h.01" /><path d="M3 3v18h18" /><path d="M18 9l-6-6-9 9" /><rect width="4" height="4" x="15" y="15" rx="1" />
          </svg>
          {!collapsed && <span>PageForge</span>}
        </Link>

        <Link
          href="/outreach"
          className={`
            flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200
            ${pathname?.startsWith('/outreach')
              ? 'bg-white/10 text-white'
              : 'text-white/60 hover:text-white hover:bg-white/5'
            }
          `}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" /><rect width="4" height="12" x="2" y="9" /><circle cx="4" cy="4" r="2" />
          </svg>
          {!collapsed && <span>LinkedIn Outreach</span>}
        </Link>

        <Link
          href="/team-pr"
          className={`
            flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200
            ${pathname?.startsWith('/team-pr')
              ? 'bg-white/10 text-white'
              : 'text-white/60 hover:text-white hover:bg-white/5'
            }
          `}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9z" /><path d="M5 13l2 2c2.76-2.76 7.24-2.76 10 0l2-2C14.14 8.14 9.87 8.14 5 13z" /><path d="M9 17l3 3 3-3c-1.66-1.66-4.34-1.66-6 0z" />
          </svg>
          {!collapsed && <span>Team PR</span>}
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
        <ProfilePopover profile={profile} user={user} signOut={signOut} collapsed={collapsed} />
      </div>
    </aside>
    </>
  );
}
