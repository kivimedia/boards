'use client';

import { useState, useCallback } from 'react';
import Image from 'next/image';
import { Draggable } from '@hello-pangea/dnd';
import { Card, Label, Profile } from '@/lib/types';
import Avatar from '@/components/ui/Avatar';
import CardCheckbox from './CardCheckbox';
import CardQuickEdit from './CardQuickEdit';

interface BoardCardProps {
  card: Card;
  placement_id: string;
  index: number;
  labels: Label[];
  assignees: Profile[];
  is_mirror: boolean;
  onClick: () => void;
  selected?: boolean;
  onToggleSelect?: (cardId: string, shiftKey?: boolean) => void;
  comment_count?: number;
  attachment_count?: number;
  checklist_total?: number;
  checklist_done?: number;
  cover_image_url?: string | null;
  boardId?: string;
  onRefresh?: () => void;
}

/**
 * Cover image component with Next.js Image optimization.
 * Falls back to <img> for external URLs that aren't in next.config.js allowlist.
 * Uses crisp rendering to prevent blur on small/low-res images.
 */
function CoverImage({ src }: { src: string }) {
  const [errored, setErrored] = useState(false);
  const isOptimizable = src.includes('supabase.co') || src.startsWith('/');

  if (errored) return null;

  if (isOptimizable) {
    return (
      <div className="relative w-full h-32 bg-cream dark:bg-slate-800">
        <Image
          src={src}
          alt=""
          fill
          sizes="(max-width: 640px) 85vw, 288px"
          className="object-cover"
          quality={85}
          onError={() => setErrored(true)}
        />
      </div>
    );
  }

  // External URLs (Trello, etc.) - use <img> with rendering hints
  return (
    <div className="relative w-full h-32 bg-cream dark:bg-slate-800 overflow-hidden">
      <img
        src={src}
        alt=""
        className="w-full h-full object-cover"
        style={{ imageRendering: 'auto' }}
        loading="lazy"
        decoding="async"
        onError={() => setErrored(true)}
      />
    </div>
  );
}

export default function BoardCard({
  card,
  placement_id,
  index,
  labels,
  assignees,
  is_mirror,
  onClick,
  selected,
  onToggleSelect,
  comment_count = 0,
  attachment_count = 0,
  checklist_total = 0,
  checklist_done = 0,
  cover_image_url,
  boardId,
  onRefresh,
}: BoardCardProps) {
  const [showQuickEdit, setShowQuickEdit] = useState(false);
  const [copying, setCopying] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const handleQuickCopy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (copying) return;
    setCopying(true);
    try {
      const res = await fetch(`/api/cards/${card.id}/duplicate`, { method: 'POST' });
      if (res.ok) onRefresh?.();
    } catch {
      // silently fail
    }
    setCopying(false);
  }, [card.id, copying, onRefresh]);

  const handleCopyLink = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}/card/${card.id}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = url;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 1500);
  }, [card.id]);

  const isOverdue = card.due_date && new Date(card.due_date) < new Date();
  const isDueSoon =
    card.due_date &&
    !isOverdue &&
    new Date(card.due_date).getTime() - Date.now() < 24 * 60 * 60 * 1000;

  const hasCover = !!cover_image_url;
  const hasDescription = !!card.description?.trim();
  const hasMetaBadges = hasDescription || comment_count > 0 || attachment_count > 0 || checklist_total > 0;
  const showPriority = card.priority && card.priority !== 'none';

  return (
    <Draggable draggableId={placement_id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={`
            relative group bg-white dark:bg-dark-surface rounded-xl
            transition-all duration-200 ease-out
            border border-transparent overflow-hidden
            ${snapshot.isDragging
              ? 'shadow-card-hover rotate-[2deg] scale-[1.02] dark:shadow-none dark:border-slate-600'
              : 'shadow-card dark:shadow-none dark:border-slate-700 hover:shadow-card-hover hover:translate-y-[-2px] hover:border-electric/20'
            }
          `}
        >
          {/* Drag handle - thin top bar, visible on hover */}
          <div
            {...provided.dragHandleProps}
            className="h-1 group-hover:h-3 transition-all duration-150 bg-transparent group-hover:bg-cream-dark/40 dark:group-hover:bg-slate-700/60 cursor-grab active:cursor-grabbing flex items-center justify-center"
          >
            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
              <div className="w-0.5 h-0.5 rounded-full bg-navy/20 dark:bg-slate-500" />
              <div className="w-0.5 h-0.5 rounded-full bg-navy/20 dark:bg-slate-500" />
              <div className="w-0.5 h-0.5 rounded-full bg-navy/20 dark:bg-slate-500" />
              <div className="w-0.5 h-0.5 rounded-full bg-navy/20 dark:bg-slate-500" />
              <div className="w-0.5 h-0.5 rounded-full bg-navy/20 dark:bg-slate-500" />
              <div className="w-0.5 h-0.5 rounded-full bg-navy/20 dark:bg-slate-500" />
            </div>
          </div>

          {/* Selection checkbox */}
          {onToggleSelect && (
            <div
              className={`absolute top-2 left-2 z-10 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity ${hasCover ? 'bg-white/80 dark:bg-dark-surface/80 rounded-md p-0.5' : ''}`}
              style={selected ? { opacity: 1, pointerEvents: 'auto' } : undefined}
            >
              <CardCheckbox
                checked={!!selected}
                onChange={(_checked, e) => onToggleSelect(card.id, e?.shiftKey)}
              />
            </div>
          )}

          {/* Quick action buttons on hover */}
          {boardId && onRefresh && (
            <div className={`absolute ${hasCover ? 'top-[140px]' : 'top-2'} right-2 z-10 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto flex gap-1 transition-all`}>
              {/* Copy link button */}
              <button
                onClick={handleCopyLink}
                className={`p-1.5 rounded-lg transition-all ${linkCopied ? 'bg-green-100 dark:bg-green-900/40 text-green-600' : 'bg-cream-dark/90 dark:bg-slate-700/90 hover:bg-cream-dark dark:hover:bg-slate-600 text-navy/60 dark:text-slate-300'}`}
                title={linkCopied ? 'Copied!' : 'Copy card link'}
              >
                {linkCopied ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                  </svg>
                )}
              </button>
              {/* Quick copy button */}
              <button
                onClick={handleQuickCopy}
                className="p-1.5 rounded-lg bg-cream-dark/90 dark:bg-slate-700/90 hover:bg-cream-dark dark:hover:bg-slate-600 text-navy/60 dark:text-slate-300 transition-all"
                title="Duplicate card"
              >
                {copying ? (
                  <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" /><path d="M4 12a8 8 0 018-8" strokeOpacity="0.75" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                )}
              </button>
              {/* Quick edit pencil button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowQuickEdit(true);
                }}
                className="p-1.5 rounded-lg bg-cream-dark/90 dark:bg-slate-700/90 hover:bg-cream-dark dark:hover:bg-slate-600 text-navy/60 dark:text-slate-300 transition-all"
                title="Quick edit"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                </svg>
              </button>
            </div>
          )}

          {/* Quick edit popover */}
          {showQuickEdit && boardId && onRefresh && (
            <CardQuickEdit
              cardId={card.id}
              boardId={boardId}
              currentLabels={labels}
              currentPriority={card.priority || 'none'}
              currentDueDate={card.due_date}
              onRefresh={onRefresh}
              onClose={() => setShowQuickEdit(false)}
            />
          )}

          {/* Clickable card body - NO dragHandleProps, pure click target */}
          <button
            type="button"
            onClick={onClick}
            className="w-full text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-electric/40 focus-visible:ring-inset"
          >
            {/* Cover Image */}
            {hasCover && (
              <CoverImage src={cover_image_url!} />
            )}

            {/* Card content */}
            <div className="p-3">
              {/* Labels */}
              {labels.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {labels.map((label) => (
                    <span
                      key={label.id}
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.2)]"
                      style={{ backgroundColor: label.color }}
                    >
                      {label.name}
                    </span>
                  ))}
                </div>
              )}

              {/* Priority Badge */}
              {showPriority && (
                <div className="mb-1.5">
                  <span className={`
                    inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold
                    ${card.priority === 'urgent' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : ''}
                    ${card.priority === 'high' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' : ''}
                    ${card.priority === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' : ''}
                    ${card.priority === 'low' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : ''}
                  `}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="shrink-0">
                      {card.priority === 'urgent' ? (
                        <path d="M12 2L1 21h22L12 2zm0 4l7.53 13H4.47L12 6zm-1 4v4h2v-4h-2zm0 6v2h2v-2h-2z"/>
                      ) : card.priority === 'high' ? (
                        <path d="M7 14l5-5 5 5H7z"/>
                      ) : card.priority === 'medium' ? (
                        <path d="M4 11h16v2H4z"/>
                      ) : (
                        <path d="M7 10l5 5 5-5H7z"/>
                      )}
                    </svg>
                    {card.priority.charAt(0).toUpperCase() + card.priority.slice(1)}
                  </span>
                </div>
              )}

              {/* Approval Status Badge */}
              {card.approval_status && (
                <div className="mb-1.5">
                  <span className={`
                    inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold
                    ${card.approval_status === 'pending' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : ''}
                    ${card.approval_status === 'approved' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : ''}
                    ${card.approval_status === 'rejected' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : ''}
                    ${card.approval_status === 'revision_requested' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' : ''}
                  `}>
                    {card.approval_status === 'pending' && '\u23f3'}
                    {card.approval_status === 'approved' && '\u2713'}
                    {card.approval_status === 'rejected' && '\u2715'}
                    {card.approval_status === 'revision_requested' && '\u21bb'}
                    {' '}{card.approval_status === 'revision_requested' ? 'Revision' : card.approval_status.charAt(0).toUpperCase() + card.approval_status.slice(1)}
                  </span>
                </div>
              )}

              {/* Title */}
              <p className="text-sm text-navy dark:text-slate-100 font-medium leading-snug line-clamp-3">
                {is_mirror && (
                  <span className="inline-block mr-1.5 text-electric" title="Mirrored card">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline -mt-0.5">
                      <polyline points="7 17 2 12 7 7"/><polyline points="17 7 22 12 17 17"/><line x1="2" y1="12" x2="22" y2="12"/>
                    </svg>
                  </span>
                )}
                {card.title}
              </p>

              {/* Metadata badges: description, comments, attachments, checklists */}
              {hasMetaBadges && (
                <div className="flex items-center gap-3 mt-2 text-navy/50 dark:text-slate-400">
                  {hasDescription && (
                    <span className="flex items-center text-[11px]" title="This card has a description">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/>
                      </svg>
                    </span>
                  )}
                  {comment_count > 0 && (
                    <span className="flex items-center gap-1 text-[11px]" title={`${comment_count} comment${comment_count !== 1 ? 's' : ''}`}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                      </svg>
                      {comment_count}
                    </span>
                  )}
                  {attachment_count > 0 && (
                    <span className="flex items-center gap-1 text-[11px]" title={`${attachment_count} attachment${attachment_count !== 1 ? 's' : ''}`}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                      </svg>
                      {attachment_count}
                    </span>
                  )}
                  {checklist_total > 0 && (
                    <span
                      className={`flex items-center gap-1 text-[11px] ${
                        checklist_done === checklist_total ? 'text-green-600 dark:text-green-400' : ''
                      }`}
                      title={`${checklist_done}/${checklist_total} checklist items done`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><polyline points="9 11 12 14 22 4"/>
                      </svg>
                      {checklist_done}/{checklist_total}
                    </span>
                  )}
                </div>
              )}

              {/* Footer: due date, owner, assignees */}
              {(card.due_date || assignees.length > 0 || card.owner_id) && (
                <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-cream-dark/50 dark:border-slate-700">
                  {card.due_date && (
                    <span
                      className={`
                        text-[11px] font-medium px-2 py-0.5 rounded-md
                        ${isOverdue ? 'bg-danger/10 text-danger' : ''}
                        ${isDueSoon ? 'bg-warning/10 text-warning' : ''}
                        ${!isOverdue && !isDueSoon ? 'bg-cream dark:bg-slate-800 text-navy/60 dark:text-slate-300' : ''}
                      `}
                    >
                      {new Date(card.due_date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  )}
                  <div className="flex items-center -space-x-1.5 ml-auto">
                    {card.owner_id && (() => {
                      const ownerProfile = assignees.find(a => a.id === card.owner_id);
                      return ownerProfile ? (
                        <div className="relative" title={`Owner: ${ownerProfile.display_name}`}>
                          <Avatar name={ownerProfile.display_name} src={ownerProfile.avatar_url} size="sm" />
                          <span className="absolute -top-0.5 -right-0.5 text-amber-500 text-[8px] leading-none">&#9733;</span>
                        </div>
                      ) : null;
                    })()}
                    {assignees.filter(a => a.id !== card.owner_id).slice(0, card.owner_id ? 2 : 3).map((a) => (
                      <Avatar key={a.id} name={a.display_name} src={a.avatar_url} size="sm" />
                    ))}
                    {assignees.length > 3 && (
                      <div className="w-6 h-6 rounded-full bg-cream-dark dark:bg-slate-700 text-navy/40 dark:text-slate-400 text-[10px] font-medium flex items-center justify-center ring-2 ring-white dark:ring-dark-surface">
                        +{assignees.length - 3}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </button>
        </div>
      )}
    </Draggable>
  );
}
