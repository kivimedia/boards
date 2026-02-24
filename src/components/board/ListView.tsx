'use client';

import { useState, useMemo } from 'react';
import type { ListWithCards, CardPriority } from '@/lib/types';
import { useListColumns } from '@/hooks/useListColumns';
import ListColumnCustomizer, { COLUMN_LABELS } from './ListColumnCustomizer';

interface ListViewProps {
  lists: ListWithCards[];
  boardId: string;
}

type SortField = 'title' | 'status' | 'priority' | 'due_date' | 'start_date' | 'created_at' | 'updated_at' | 'assignees' | 'labels' | 'approval_status' | 'comments' | 'attachments' | 'checklist' | 'is_mirror';
type SortDirection = 'asc' | 'desc';

const PRIORITY_ORDER: Record<CardPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};

function priorityBadge(priority: CardPriority): { text: string; classes: string } {
  switch (priority) {
    case 'urgent':
      return { text: 'Urgent', classes: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800' };
    case 'high':
      return { text: 'High', classes: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800' };
    case 'medium':
      return { text: 'Medium', classes: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800' };
    case 'low':
      return { text: 'Low', classes: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800' };
    default:
      return { text: 'None', classes: 'bg-gray-50 text-gray-500 border-gray-200 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700' };
  }
}

interface FlatCard {
  id: string;
  title: string;
  listName: string;
  priority: CardPriority;
  due_date: string | null;
  start_date: string | null;
  created_at: string;
  updated_at: string;
  approval_status: string | null;
  is_mirror: boolean;
  assignees: { display_name: string; avatar_url: string | null }[];
  labels: { name: string; color: string }[];
  comment_count: number;
  attachment_count: number;
  checklist_total: number;
  checklist_done: number;
}

// Sortable column keys
const SORTABLE_COLUMNS = new Set<string>([
  'title', 'status', 'priority', 'due_date', 'start_date', 'created_at', 'updated_at',
]);

export default function ListView({ lists, boardId }: ListViewProps) {
  const [sortField, setSortField] = useState<SortField>('status');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');
  const { visibleColumns, allColumns, isVisible, toggleColumn, moveColumn, reorderColumn, resetToDefault, isDefault } = useListColumns(boardId);

  const flatCards: FlatCard[] = useMemo(() => {
    const cards: FlatCard[] = [];
    for (const list of lists) {
      for (const placement of list.cards) {
        cards.push({
          id: placement.card.id,
          title: placement.card.title,
          listName: list.name,
          priority: placement.card.priority,
          due_date: placement.card.due_date,
          start_date: placement.card.start_date,
          created_at: placement.card.created_at,
          updated_at: placement.card.updated_at,
          approval_status: placement.card.approval_status,
          is_mirror: placement.is_mirror,
          assignees: placement.assignees.map((a) => ({
            display_name: a.display_name,
            avatar_url: a.avatar_url,
          })),
          labels: placement.labels.map((l) => ({
            name: l.name,
            color: l.color,
          })),
          comment_count: placement.comment_count || 0,
          attachment_count: placement.attachment_count || 0,
          checklist_total: placement.checklist_total || 0,
          checklist_done: placement.checklist_done || 0,
        });
      }
    }
    return cards;
  }, [lists]);

  const sortedCards = useMemo(() => {
    const sorted = [...flatCards];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'title':
          cmp = a.title.localeCompare(b.title);
          break;
        case 'status':
          cmp = a.listName.localeCompare(b.listName);
          break;
        case 'priority':
          cmp = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
          break;
        case 'due_date': {
          const aDate = a.due_date ? new Date(a.due_date).getTime() : Infinity;
          const bDate = b.due_date ? new Date(b.due_date).getTime() : Infinity;
          cmp = aDate - bDate;
          break;
        }
        case 'start_date': {
          const aDate = a.start_date ? new Date(a.start_date).getTime() : Infinity;
          const bDate = b.start_date ? new Date(b.start_date).getTime() : Infinity;
          cmp = aDate - bDate;
          break;
        }
        case 'created_at':
          cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case 'updated_at':
          cmp = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
          break;
        default:
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [flatCards, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return (
        <svg className="w-3 h-3 text-navy/20 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }
    return sortDir === 'asc' ? (
      <svg className="w-3 h-3 text-electric" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-3 h-3 text-electric" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  const renderHeaderCell = (col: string) => {
    const label = COLUMN_LABELS[col] || col;
    const isSortable = SORTABLE_COLUMNS.has(col);
    const sortKey = col as SortField;

    if (isSortable) {
      return (
        <th key={col} className="text-left px-4 py-3">
          <button
            onClick={() => handleSort(sortKey)}
            className="flex items-center gap-1 text-xs font-semibold text-navy/60 dark:text-slate-400 uppercase tracking-wider font-heading hover:text-navy dark:hover:text-white transition-colors"
          >
            {label}
            <SortIcon field={sortKey} />
          </button>
        </th>
      );
    }

    return (
      <th key={col} className="text-left px-4 py-3">
        <span className="text-xs font-semibold text-navy/60 dark:text-slate-400 uppercase tracking-wider font-heading">
          {label}
        </span>
      </th>
    );
  };

  const renderCell = (col: string, card: FlatCard) => {
    switch (col) {
      case 'title':
        return (
          <td key={col} className="px-4 py-3 max-w-[400px]">
            <span className="font-medium text-navy dark:text-slate-100 font-body line-clamp-2">{card.title}</span>
          </td>
        );
      case 'status':
        return (
          <td key={col} className="px-4 py-3">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-cream-dark/50 dark:bg-slate-700/50 text-navy/70 dark:text-slate-300 text-xs font-medium font-body">
              {card.listName}
            </span>
          </td>
        );
      case 'priority': {
        const badge = priorityBadge(card.priority);
        return (
          <td key={col} className="px-4 py-3">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium font-body ${badge.classes}`}>
              {badge.text}
            </span>
          </td>
        );
      }
      case 'due_date':
      case 'start_date': {
        const dateVal = col === 'due_date' ? card.due_date : card.start_date;
        const isOverdue = col === 'due_date' && dateVal && new Date(dateVal) < new Date();
        return (
          <td key={col} className="px-4 py-3">
            {dateVal ? (
              <span className={`text-xs font-body ${isOverdue ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-navy/60 dark:text-slate-400'}`}>
                {new Date(dateVal).toLocaleDateString()}
                {isOverdue && ' (overdue)'}
              </span>
            ) : (
              <span className="text-xs text-navy/30 dark:text-slate-500 font-body">-</span>
            )}
          </td>
        );
      }
      case 'created_at':
      case 'updated_at': {
        const ts = col === 'created_at' ? card.created_at : card.updated_at;
        return (
          <td key={col} className="px-4 py-3">
            <span className="text-xs text-navy/60 dark:text-slate-400 font-body">
              {new Date(ts).toLocaleDateString()}
            </span>
          </td>
        );
      }
      case 'assignees':
        return (
          <td key={col} className="px-4 py-3">
            {card.assignees.length > 0 ? (
              <div className="flex -space-x-1.5">
                {card.assignees.slice(0, 3).map((a, i) => (
                  <div
                    key={i}
                    title={a.display_name}
                    className="w-6 h-6 rounded-full bg-electric/20 text-electric text-xs font-bold flex items-center justify-center border-2 border-white dark:border-dark-surface font-body"
                  >
                    {a.display_name.charAt(0).toUpperCase()}
                  </div>
                ))}
                {card.assignees.length > 3 && (
                  <div className="w-6 h-6 rounded-full bg-cream-dark dark:bg-slate-700 text-navy/50 dark:text-slate-400 text-xs font-medium flex items-center justify-center border-2 border-white dark:border-dark-surface font-body">
                    +{card.assignees.length - 3}
                  </div>
                )}
              </div>
            ) : (
              <span className="text-xs text-navy/30 dark:text-slate-500 font-body">-</span>
            )}
          </td>
        );
      case 'labels':
        return (
          <td key={col} className="px-4 py-3">
            {card.labels.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {card.labels.slice(0, 3).map((l, i) => (
                  <span
                    key={i}
                    className="inline-flex px-1.5 py-0.5 rounded text-xs font-medium font-body"
                    style={{
                      backgroundColor: `${l.color}20`,
                      color: l.color,
                    }}
                  >
                    {l.name}
                  </span>
                ))}
                {card.labels.length > 3 && (
                  <span className="text-xs text-navy/30 dark:text-slate-500 font-body">
                    +{card.labels.length - 3}
                  </span>
                )}
              </div>
            ) : (
              <span className="text-xs text-navy/30 dark:text-slate-500 font-body">-</span>
            )}
          </td>
        );
      case 'approval_status':
        return (
          <td key={col} className="px-4 py-3">
            {card.approval_status ? (
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium font-body ${
                card.approval_status === 'approved'
                  ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : card.approval_status === 'rejected'
                  ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  : card.approval_status === 'pending'
                  ? 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                  : 'bg-gray-50 text-gray-500 dark:bg-slate-800 dark:text-slate-500'
              }`}>
                {card.approval_status.charAt(0).toUpperCase() + card.approval_status.slice(1)}
              </span>
            ) : (
              <span className="text-xs text-navy/30 dark:text-slate-500 font-body">-</span>
            )}
          </td>
        );
      case 'comments':
        return (
          <td key={col} className="px-4 py-3">
            {card.comment_count > 0 ? (
              <span className="inline-flex items-center gap-1 text-xs text-navy/60 dark:text-slate-400 font-body">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                {card.comment_count}
              </span>
            ) : (
              <span className="text-xs text-navy/30 dark:text-slate-500 font-body">-</span>
            )}
          </td>
        );
      case 'attachments':
        return (
          <td key={col} className="px-4 py-3">
            {card.attachment_count > 0 ? (
              <span className="inline-flex items-center gap-1 text-xs text-navy/60 dark:text-slate-400 font-body">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
                {card.attachment_count}
              </span>
            ) : (
              <span className="text-xs text-navy/30 dark:text-slate-500 font-body">-</span>
            )}
          </td>
        );
      case 'checklist':
        return (
          <td key={col} className="px-4 py-3">
            {card.checklist_total > 0 ? (
              <span className={`inline-flex items-center gap-1 text-xs font-body ${
                card.checklist_done === card.checklist_total
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-navy/60 dark:text-slate-400'
              }`}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                {card.checklist_done}/{card.checklist_total}
              </span>
            ) : (
              <span className="text-xs text-navy/30 dark:text-slate-500 font-body">-</span>
            )}
          </td>
        );
      case 'is_mirror':
        return (
          <td key={col} className="px-4 py-3">
            {card.is_mirror ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 text-xs font-medium font-body">
                Mirror
              </span>
            ) : (
              <span className="text-xs text-navy/30 dark:text-slate-500 font-body">-</span>
            )}
          </td>
        );
      default:
        return <td key={col} className="px-4 py-3" />;
    }
  };

  if (flatCards.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <p className="text-sm text-navy/40 dark:text-slate-400 font-body">No cards found.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-3 sm:p-6 pb-20 sm:pb-24">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-navy/40 dark:text-slate-500 font-body tabular-nums">
          {flatCards.length} card{flatCards.length !== 1 ? 's' : ''}
        </span>
        <ListColumnCustomizer
          allColumns={allColumns}
          isVisible={isVisible}
          toggleColumn={toggleColumn}
          moveColumn={moveColumn}
          reorderColumn={reorderColumn}
          resetToDefault={resetToDefault}
          isDefault={isDefault}
        />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface shadow-sm dark:shadow-none overscroll-x-contain">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-cream/50 dark:bg-navy/50 border-b border-cream-dark dark:border-slate-700">
              {visibleColumns.map((col) => renderHeaderCell(col))}
            </tr>
          </thead>
          <tbody>
            {sortedCards.map((card) => (
              <tr
                key={card.id}
                className="border-b border-cream-dark/50 dark:border-slate-700/50 hover:bg-cream/30 dark:hover:bg-slate-800/30 transition-colors cursor-pointer"
              >
                {visibleColumns.map((col) => renderCell(col, card))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
