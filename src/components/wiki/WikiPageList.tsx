'use client';

import type { WikiPage } from '@/lib/types';
import Link from 'next/link';

interface WikiPageListProps {
  pages: WikiPage[];
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

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDepartment(department: string): string {
  return department
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function WikiPageList({ pages }: WikiPageListProps) {
  if (pages.length === 0) {
    return (
      <div className="text-center py-16">
        <svg
          className="mx-auto h-12 w-12 text-navy/20 dark:text-slate-600"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
          />
        </svg>
        <p className="mt-3 text-navy/40 dark:text-slate-500 font-body text-sm">No wiki pages found</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {pages.map((page) => (
        <Link
          key={page.id}
          href={`/wiki/${page.slug}`}
          className="block bg-white dark:bg-dark-surface rounded-xl border-2 border-cream-dark dark:border-slate-700 p-4 hover:border-electric/30 hover:shadow-sm dark:shadow-none transition-all duration-200"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-navy dark:text-slate-100 text-sm truncate">
                {page.title}
              </h3>

              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {page.department && (
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${
                      DEPARTMENT_COLORS[page.department] || DEPARTMENT_COLORS.general
                    }`}
                  >
                    {formatDepartment(page.department)}
                  </span>
                )}

                {page.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-cream-dark dark:bg-slate-700 text-navy/60 dark:text-slate-300"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="text-right shrink-0">
              <p className="text-xs text-navy/40 dark:text-slate-500 font-body">
                {formatDate(page.updated_at)}
              </p>
              {!page.is_published && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-yellow-100 text-yellow-800 mt-1">
                  Draft
                </span>
              )}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
