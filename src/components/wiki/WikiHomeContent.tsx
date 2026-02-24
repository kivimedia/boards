'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { WikiPage } from '@/lib/types';
import WikiPageList from './WikiPageList';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

const DEPARTMENTS = [
  { value: '', label: 'All Departments' },
  { value: 'general', label: 'General' },
  { value: 'boutique_decor', label: 'Boutique Decor' },
  { value: 'marquee_letters', label: 'Marquee Letters' },
  { value: 'private_clients', label: 'Private Clients' },
  { value: 'owner_dashboard', label: 'Owner Dashboard' },
  { value: 'va_workspace', label: 'VA Workspace' },
  { value: 'general_tasks', label: 'General Tasks' },
];

export default function WikiHomeContent() {
  const router = useRouter();
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchPages = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('published', 'true');
      if (search) params.set('search', search);
      if (department) params.set('department', department);

      const res = await fetch(`/api/wiki?${params.toString()}`);
      const json = await res.json();
      if (json.data) {
        setPages(json.data as WikiPage[]);
      }
    } finally {
      setLoading(false);
    }
  }, [search, department]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchPages();
    }, 300);
    return () => clearTimeout(debounce);
  }, [fetchPages]);

  const handleNewPage = async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/wiki', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Untitled Page' }),
      });
      const json = await res.json();
      if (json.data) {
        router.push(`/wiki/${json.data.slug}/edit`);
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-cream dark:bg-dark-bg p-6">
      <div className="max-w-4xl mx-auto">
        {/* Toolbar */}
        <div className="flex items-center gap-4 mb-6">
          {/* Search */}
          <div className="flex-1 max-w-md">
            <Input
              placeholder="Search wiki pages..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Department Filter */}
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="
              px-3.5 py-2.5 rounded-xl
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

          {/* New Page Button */}
          <Button onClick={handleNewPage} loading={creating}>
            New Page
          </Button>
        </div>

        {/* Page count */}
        <p className="text-navy/60 dark:text-slate-400 font-body text-sm mb-4">
          {pages.length} page{pages.length !== 1 ? 's' : ''}
        </p>

        {/* Pages List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex items-center gap-3 text-navy/40 dark:text-slate-500">
              <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="font-body dark:text-slate-400">Loading wiki pages...</span>
            </div>
          </div>
        ) : (
          <WikiPageList pages={pages} />
        )}
      </div>
    </div>
  );
}
