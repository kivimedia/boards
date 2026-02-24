'use client';

import { Draggable } from '@hello-pangea/dnd';

interface SeparatorCardProps {
  placementId: string;
  index: number;
  title?: string;
}

/**
 * A thin horizontal divider rendered in place of a full card.
 * Draggable so users can reposition it within or between lists.
 */
export default function SeparatorCard({ placementId, index, title }: SeparatorCardProps) {
  return (
    <Draggable draggableId={placementId} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`
            group relative flex items-center gap-2 py-1 px-2 rounded-lg cursor-grab
            transition-all duration-150
            ${snapshot.isDragging
              ? 'bg-pink-50 dark:bg-pink-900/20 shadow-md ring-1 ring-pink-300/40 scale-[1.02]'
              : 'hover:bg-cream-dark/30 dark:hover:bg-slate-700/30'
            }
          `}
        >
          {/* Drag grip dots */}
          <div className="shrink-0 opacity-0 group-hover:opacity-40 transition-opacity text-navy/40 dark:text-slate-500">
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="8" cy="4" r="2"/><circle cx="16" cy="4" r="2"/>
              <circle cx="8" cy="12" r="2"/><circle cx="16" cy="12" r="2"/>
              <circle cx="8" cy="20" r="2"/><circle cx="16" cy="20" r="2"/>
            </svg>
          </div>

          {/* Horizontal rule */}
          <div className="flex-1 flex items-center gap-2">
            <div className="flex-1 h-px bg-pink-300/60 dark:bg-pink-500/30" />
            {title && (
              <span className="shrink-0 text-[10px] font-medium text-pink-400/80 dark:text-pink-400/60 uppercase tracking-wider select-none">
                {title}
              </span>
            )}
            {title && <div className="flex-1 h-px bg-pink-300/60 dark:bg-pink-500/30" />}
          </div>
        </div>
      )}
    </Draggable>
  );
}
