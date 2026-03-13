'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { User } from '@supabase/supabase-js';
import { Profile } from '@/lib/types';
import Avatar from '@/components/ui/Avatar';

interface ProfilePopoverProps {
  profile: Profile | null;
  user: User | null;
  signOut: () => void;
  collapsed: boolean;
}

export default function ProfilePopover({ profile, user, signOut, collapsed }: ProfilePopoverProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ bottom: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const updatePos = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({
      bottom: window.innerHeight - rect.top + 8,
      left: rect.left,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePos();

    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    const handleScroll = () => updatePos();

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [open, updatePos]);

  const close = () => setOpen(false);

  const displayName = profile?.display_name || user?.email || 'User';
  const avatarUrl = profile?.avatar_url || null;
  const email = user?.email || '';
  const roleName = profile?.user_role || profile?.role || 'member';
  // Only show email separately if it differs from displayName
  const showEmail = email && email !== displayName;

  return (
    <>
      <div
        ref={triggerRef}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <div className="flex items-center gap-3 cursor-pointer rounded-lg p-1.5 -m-1.5 hover:bg-white/10 transition-colors">
          <Avatar name={displayName} src={avatarUrl} size="md" />
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white font-medium truncate">
                {displayName}
              </p>
            </div>
          )}
          {!collapsed && (
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/40 shrink-0">
              <path d="M7 15l5-5 5 5"/>
            </svg>
          )}
        </div>
      </div>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: 'fixed', bottom: pos.bottom, left: pos.left, zIndex: 9999 }}
            className="w-[260px] bg-white dark:bg-dark-surface rounded-xl shadow-modal border border-cream-dark dark:border-slate-700 animate-in fade-in slide-in-from-bottom-2 duration-150"
          >
            {/* Header - Avatar + Info */}
            <div className="p-4 border-b border-cream-dark dark:border-slate-700">
              <div className="flex items-center gap-3">
                <Avatar name={displayName} src={avatarUrl} size="xl" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-navy dark:text-slate-100 truncate">
                    {displayName}
                  </p>
                  {showEmail && (
                    <p className="text-xs text-navy/50 dark:text-slate-400 truncate mt-0.5">
                      {email}
                    </p>
                  )}
                  <span className="inline-block mt-1.5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full bg-electric/10 text-electric dark:bg-electric/20">
                    {roleName}
                  </span>
                </div>
              </div>
            </div>

            {/* Menu Items */}
            <div className="py-1.5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  router.push('/settings/account');
                  close();
                }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-navy dark:text-slate-100 hover:bg-cream-dark dark:hover:bg-slate-700 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-navy/50 dark:text-slate-400">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
                My Profile
              </button>

              <div className="my-1 mx-3 h-px bg-cream-dark dark:bg-slate-700" />

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  signOut();
                  close();
                }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-danger hover:bg-danger/10 dark:hover:bg-danger/20 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                Log Out
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
