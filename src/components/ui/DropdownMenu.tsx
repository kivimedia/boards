'use client';

import { useState, useRef, useEffect, useCallback, ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface DropdownMenuItem {
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'danger';
  separator?: boolean;
  disabled?: boolean;
  /** Render a custom sub-content (e.g. sub-menu or list selector) */
  subContent?: ReactNode;
}

interface DropdownMenuProps {
  trigger: ReactNode;
  items: DropdownMenuItem[];
  align?: 'left' | 'right';
  /** Additional class on the trigger wrapper */
  triggerClassName?: string;
}

export default function DropdownMenu({ trigger, items, align = 'left', triggerClassName }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updatePos = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuWidth = 220;
    let left = align === 'right' ? rect.right - menuWidth : rect.left;
    // Keep within viewport
    if (left + menuWidth > window.innerWidth - 8) left = window.innerWidth - menuWidth - 8;
    if (left < 8) left = 8;
    let top = rect.bottom + 4;
    // If menu would overflow bottom, show above
    if (top + 300 > window.innerHeight) top = rect.top - 4;
    setPos({ top, left });
  }, [align]);

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

  return (
    <>
      <div
        ref={triggerRef}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={triggerClassName}
      >
        {trigger}
      </div>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
            className="w-[220px] py-1.5 bg-white dark:bg-dark-surface rounded-xl shadow-modal border border-cream-dark dark:border-slate-700 animate-in fade-in slide-in-from-top-1 duration-150"
          >
            {items.map((item, i) => {
              if (item.separator) {
                return <div key={i} className="my-1 h-px bg-cream-dark dark:bg-slate-700" />;
              }

              if (item.subContent) {
                return (
                  <div key={i} className="px-1.5">
                    <div className="px-2 py-1.5 text-[11px] font-semibold text-navy/40 dark:text-slate-500 uppercase tracking-wider">
                      {item.label}
                    </div>
                    {item.subContent}
                  </div>
                );
              }

              return (
                <button
                  key={i}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (item.disabled) return;
                    item.onClick?.();
                    setOpen(false);
                  }}
                  disabled={item.disabled}
                  className={`
                    w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left rounded-lg mx-1.5 transition-colors
                    ${item.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                    ${item.variant === 'danger'
                      ? 'text-danger hover:bg-danger/10 dark:hover:bg-danger/20'
                      : 'text-navy dark:text-slate-100 hover:bg-cream-dark dark:hover:bg-slate-700'
                    }
                  `}
                  style={{ width: 'calc(100% - 12px)' }}
                >
                  {item.icon && <span className="shrink-0 w-4 h-4 flex items-center justify-center">{item.icon}</span>}
                  {item.label}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}
