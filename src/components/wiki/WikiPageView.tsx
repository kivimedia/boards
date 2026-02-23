'use client';

import Link from 'next/link';
import type { WikiPage } from '@/lib/types';
import Button from '@/components/ui/Button';

interface WikiPageViewProps {
  page: WikiPage;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDepartment(department: string): string {
  return department
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const DEPARTMENT_COLORS: Record<string, string> = {
  dev: 'bg-blue-100 text-blue-800',
  training: 'bg-purple-100 text-purple-800',
  account_manager: 'bg-green-100 text-green-800',
  graphic_designer: 'bg-pink-100 text-pink-800',
  executive_assistant: 'bg-orange-100 text-orange-800',
  video_editor: 'bg-red-100 text-red-800',
  copy: 'bg-yellow-100 text-yellow-800',
  client_strategy_map: 'bg-teal-100 text-teal-800',
  general: 'bg-gray-100 text-gray-700',
};

export default function WikiPageView({ page }: WikiPageViewProps) {
  return (
    <div className="flex-1 overflow-y-auto bg-cream dark:bg-dark-bg p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        {/* Breadcrumb / Back */}
        <div className="flex items-center gap-2 mb-6">
          <Link
            href="/wiki"
            className="text-electric hover:text-electric/80 text-sm font-body transition-colors"
          >
            Wiki
          </Link>
          <span className="text-navy/30 dark:text-slate-600 text-sm">/</span>
          <span className="text-navy/60 dark:text-slate-400 text-sm font-body truncate">{page.title}</span>
        </div>

        {/* Page Header */}
        <div className="bg-white dark:bg-dark-surface rounded-xl border-2 border-cream-dark dark:border-slate-700 p-6 mb-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-navy dark:text-slate-100">{page.title}</h1>

              <div className="flex items-center gap-3 mt-3 flex-wrap">
                {page.department && (
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${
                      DEPARTMENT_COLORS[page.department] || DEPARTMENT_COLORS.general
                    }`}
                  >
                    {formatDepartment(page.department)}
                  </span>
                )}

                {page.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-cream-dark dark:bg-slate-700 text-navy/60 dark:text-slate-300"
                  >
                    {tag}
                  </span>
                ))}

                {!page.is_published && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-yellow-100 text-yellow-800">
                    Draft
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Link href={`/wiki/${page.slug}/edit`}>
                <Button variant="secondary" size="sm">
                  Edit
                </Button>
              </Link>
            </div>
          </div>

          {/* Metadata */}
          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-cream-dark dark:border-slate-700 text-xs text-navy/50 dark:text-slate-400 font-body">
            <span>Last updated: {formatDate(page.updated_at)}</span>
            {page.owner_id && <span>Owner: {page.owner_id}</span>}
          </div>
        </div>

        {/* Content */}
        <div className="bg-white dark:bg-dark-surface rounded-xl border-2 border-cream-dark dark:border-slate-700 p-6">
          {page.content ? (
            <div
              className="prose prose-sm max-w-none text-navy dark:text-slate-200 font-body prose-headings:text-navy dark:prose-headings:text-slate-100 prose-a:text-electric dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: page.content }}
            />
          ) : (
            <p className="text-navy/40 dark:text-slate-500 font-body text-sm italic">
              This page has no content yet.
            </p>
          )}
        </div>

        {/* Version History Link */}
        <div className="mt-4 text-center">
          <Link
            href={`/wiki/${page.slug}/edit`}
            className="text-sm text-electric hover:text-electric/80 font-body transition-colors"
          >
            View version history
          </Link>
        </div>
      </div>
    </div>
  );
}
