'use client';

import { Label } from '@/lib/types';

interface CardLabelsProps {
  labels: Label[];
  boardLabels: Label[];
  onToggle: (labelId: string) => void;
}

export default function CardLabels({ labels, boardLabels, onToggle }: CardLabelsProps) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-navy/40 dark:text-slate-400 mb-1.5 uppercase tracking-wider font-heading">
        Labels
      </h4>
      <div className="space-y-1">
        {boardLabels.map((label) => {
          const isActive = labels.some((l) => l.id === label.id);
          return (
            <button
              key={label.id}
              onClick={() => onToggle(label.id)}
              className={`
                w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-all
                ${isActive ? 'ring-2 ring-offset-1' : 'opacity-70 hover:opacity-100'}
              `}
              style={{
                backgroundColor: `${label.color}20`,
                ...(isActive ? { ringColor: label.color } : {}),
              }}
            >
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: label.color }}
              />
              <span className="font-medium text-navy dark:text-slate-100 truncate font-body">{label.name}</span>
              {isActive && (
                <svg className="w-3.5 h-3.5 ml-auto shrink-0" fill="currentColor" viewBox="0 0 20 20" style={{ color: label.color }}>
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
