'use client';

import { useEffect, useState } from 'react';
import { ActivityLogEntry } from '@/lib/types';
import Avatar from '@/components/ui/Avatar';

interface CardActivityLogProps {
  cardId: string;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months} month${months === 1 ? '' : 's'} ago`;
  }

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatEventDescription(entry: ActivityLogEntry): string {
  const metadata = entry.metadata || {};

  switch (entry.event_type) {
    case 'card_created':
      return 'created this card';
    case 'card_updated':
      if (metadata.field === 'title') return 'updated the card title';
      if (metadata.field === 'description') return 'updated the description';
      if (metadata.field === 'due_date') return 'changed the due date';
      if (metadata.field === 'priority') return `set priority to ${metadata.value}`;
      return 'updated this card';
    case 'card_moved':
      return `moved this card${metadata.to_list ? ` to ${metadata.to_list}` : ''}`;
    case 'card_archived':
      return 'archived this card';
    case 'comment_added':
      return 'added a comment';
    case 'label_added':
      return `added label "${metadata.label_name || 'label'}"`;
    case 'label_removed':
      return `removed label "${metadata.label_name || 'label'}"`;
    case 'assignee_added':
      return `assigned ${metadata.assignee_name || 'a member'}`;
    case 'assignee_removed':
      return `unassigned ${metadata.assignee_name || 'a member'}`;
    case 'checklist_created':
      return `created checklist "${metadata.checklist_title || 'checklist'}"`;
    case 'checklist_deleted':
      return `deleted checklist "${metadata.checklist_title || 'checklist'}"`;
    case 'checklist_item_completed':
      return `completed "${metadata.item_content || 'checklist item'}"`;
    case 'checklist_item_uncompleted':
      return `uncompleted "${metadata.item_content || 'checklist item'}"`;
    case 'attachment_uploaded':
      return `uploaded "${metadata.file_name || 'a file'}"`;
    case 'attachment_deleted':
      return `deleted attachment "${metadata.file_name || 'a file'}"`;
    case 'dependency_added':
      return `added ${metadata.dependency_type || 'dependency'} dependency`;
    case 'dependency_removed':
      return 'removed a dependency';
    case 'custom_field_updated':
      return `updated custom field "${metadata.field_name || 'field'}"`;
    default:
      return entry.event_type.replace(/_/g, ' ');
  }
}

export default function CardActivityLog({ cardId }: CardActivityLogProps) {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActivityLog();
  }, [cardId]);

  const fetchActivityLog = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cards/${cardId}/activity`);
      if (res.ok) {
        const json = await res.json();
        setEntries(json.data || []);
      }
    } catch {
      // Silently fail
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div>
        <h3 className="text-sm font-semibold text-navy/50 dark:text-slate-400 mb-3 font-heading">
          Activity
        </h3>
        <div className="flex items-center justify-center py-8">
          <svg className="animate-spin h-5 w-5 text-electric" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-navy/50 dark:text-slate-400 mb-3 font-heading">
        Activity ({entries.length})
      </h3>

      {entries.length === 0 ? (
        <p className="text-sm text-navy/30 dark:text-slate-500 text-center py-4 font-body">
          No activity yet
        </p>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-3 top-3 bottom-3 w-px bg-cream-dark dark:bg-slate-700" />

          <div className="space-y-4">
            {entries.map((entry) => (
              <div key={entry.id} className="flex gap-3 relative">
                <div className="relative z-10">
                  <Avatar
                    name={entry.profile?.display_name || 'User'}
                    src={entry.profile?.avatar_url}
                    size="sm"
                  />
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <p className="text-sm font-body">
                    <span className="font-medium text-navy dark:text-slate-100 font-heading">
                      {entry.profile?.display_name || 'User'}
                    </span>{' '}
                    <span className="text-navy/60 dark:text-slate-400">
                      {formatEventDescription(entry)}
                    </span>
                  </p>
                  <p className="text-[11px] text-navy/30 dark:text-slate-500 font-body mt-0.5">
                    {formatRelativeTime(entry.created_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
