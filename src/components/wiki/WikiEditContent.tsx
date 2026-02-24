'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { WikiPage, BoardType } from '@/lib/types';
import WikiEditor from './WikiEditor';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Avatar from '@/components/ui/Avatar';
import { usePresence } from '@/hooks/usePresence';
import { useAuth } from '@/hooks/useAuth';

interface WikiEditContentProps {
  page: WikiPage;
}

const DEPARTMENTS: { value: string; label: string }[] = [
  { value: '', label: 'No Department' },
  { value: 'general', label: 'General' },
  { value: 'boutique_decor', label: 'Boutique Decor' },
  { value: 'marquee_letters', label: 'Marquee Letters' },
  { value: 'private_clients', label: 'Private Clients' },
  { value: 'owner_dashboard', label: 'Owner Dashboard' },
  { value: 'va_workspace', label: 'VA Workspace' },
  { value: 'general_tasks', label: 'General Tasks' },
];

export default function WikiEditContent({ page }: WikiEditContentProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { presentUsers } = usePresence({ channelName: `wiki:${page.id}` });
  const otherEditors = presentUsers.filter((u) => u.userId !== user?.id);
  const [title, setTitle] = useState(page.title);
  const [content, setContent] = useState(page.content);
  const [department, setDepartment] = useState(page.department || '');
  const [tagsInput, setTagsInput] = useState(page.tags.join(', '));
  const [isPublished, setIsPublished] = useState(page.is_published);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await fetch(`/api/wiki/${page.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          content,
          department: department || null,
          is_published: isPublished,
          tags,
          changeSummary: 'Updated via wiki editor',
        }),
      });

      const json = await res.json();
      if (json.error) {
        setError(json.error);
        return;
      }

      router.push(`/wiki/${page.slug}`);
      router.refresh();
    } catch {
      setError('Failed to save page');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-cream dark:bg-dark-bg p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header Bar */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => router.push(`/wiki/${page.slug}`)}
            className="text-sm text-electric hover:text-electric/80 font-body transition-colors"
          >
            Cancel
          </button>

          <div className="flex items-center gap-3">
            {/* Show other editors */}
            {otherEditors.length > 0 && (
              <div className="flex items-center gap-1.5 mr-2">
                <span className="text-xs text-amber-600 dark:text-amber-400 font-medium font-body">Also editing:</span>
                <div className="flex -space-x-1.5">
                  {otherEditors.slice(0, 3).map((u) => (
                    <Avatar key={u.userId} name={u.displayName} src={u.avatarUrl} size="sm" online={true} />
                  ))}
                </div>
              </div>
            )}
            {/* Publish Toggle */}
            <label className="flex items-center gap-2 text-sm font-body text-navy/70 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="w-4 h-4 rounded border-navy/30 dark:border-slate-600 text-electric focus:ring-electric/30"
              />
              Published
            </label>

            <Button onClick={handleSave} loading={saving}>
              Save
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-4 px-4 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm font-body">
            {error}
          </div>
        )}

        {/* Title */}
        <div className="mb-4">
          <Input
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Page title"
          />
        </div>

        {/* Department Selector */}
        <div className="mb-4">
          <label className="block text-sm font-semibold text-navy dark:text-slate-100 mb-1.5 font-body">
            Department
          </label>
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="
              w-full px-3.5 py-2.5 rounded-xl
              bg-white dark:bg-dark-surface border-2 border-navy/20 dark:border-slate-700
              text-navy dark:text-slate-100 text-sm font-body
              focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric
              transition-all duration-200
            "
          >
            {DEPARTMENTS.map((dept) => (
              <option key={dept.value} value={dept.value}>
                {dept.label}
              </option>
            ))}
          </select>
        </div>

        {/* Tags Input */}
        <div className="mb-4">
          <Input
            label="Tags (comma-separated)"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="e.g. onboarding, process, sop"
          />
        </div>

        {/* Content Editor */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-navy dark:text-slate-100 mb-1.5 font-body">
            Content
          </label>
          <WikiEditor content={content} onChange={setContent} />
        </div>
      </div>
    </div>
  );
}
