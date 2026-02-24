'use client';

import { useState, useEffect, useCallback } from 'react';
import type { GitHubCardLink } from '@/lib/types';

interface GitHubLinksProps {
  cardId: string;
  integrationId?: string;
}

function parseLinkType(type: string): string {
  switch (type) {
    case 'pull_request': return 'PR';
    case 'issue': return 'Issue';
    case 'branch': return 'Branch';
    default: return type;
  }
}

function stateColor(state: string | null): string {
  switch (state) {
    case 'open': return 'bg-green-50 text-green-700';
    case 'closed': return 'bg-red-50 text-red-700';
    case 'merged': return 'bg-purple-50 text-purple-700';
    default: return 'bg-gray-50 text-gray-600';
  }
}

function parseGitHubUrl(url: string): { owner: string; repo: string; type: 'issue' | 'pull_request' | 'branch'; id?: number } | null {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    // github.com/owner/repo/pull/123 or github.com/owner/repo/issues/123
    if (parts.length >= 4) {
      const owner = parts[0];
      const repo = parts[1];
      const section = parts[2];
      const num = parseInt(parts[3], 10);
      if (section === 'pull') return { owner, repo, type: 'pull_request', id: num || undefined };
      if (section === 'issues') return { owner, repo, type: 'issue', id: num || undefined };
      if (section === 'tree') return { owner, repo, type: 'branch' };
    }
    if (parts.length >= 2) {
      return { owner: parts[0], repo: parts[1], type: 'branch' };
    }
  } catch {
    // Invalid URL
  }
  return null;
}

export default function GitHubLinks({ cardId, integrationId }: GitHubLinksProps) {
  const [links, setLinks] = useState<GitHubCardLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [githubUrl, setGithubUrl] = useState('');
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchLinks = useCallback(async () => {
    try {
      const res = await fetch(`/api/cards/${cardId}/github`);
      const json = await res.json();
      if (json.data) setLinks(json.data);
    } finally {
      setLoading(false);
    }
  }, [cardId]);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  const handleAdd = async () => {
    if (!githubUrl.trim() || !integrationId) return;

    const parsed = parseGitHubUrl(githubUrl);
    if (!parsed) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/cards/${cardId}/github`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integration_id: integrationId,
          repo_owner: parsed.owner,
          repo_name: parsed.repo,
          link_type: parsed.type,
          github_id: parsed.id,
          github_url: githubUrl.trim(),
          title: title.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (json.data) {
        setLinks((prev) => [json.data, ...prev]);
        setGithubUrl('');
        setTitle('');
        setShowForm(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (linkId: string) => {
    await fetch(`/api/cards/${cardId}/github/${linkId}`, { method: 'DELETE' });
    setLinks((prev) => prev.filter((l) => l.id !== linkId));
  };

  if (loading) {
    return <div className="animate-pulse h-10 rounded-lg bg-cream-dark/40 dark:bg-slate-800/40" />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-navy/60 dark:text-slate-400 font-heading uppercase tracking-wider">
          GitHub Links
        </h4>
        {integrationId && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="text-xs text-electric hover:text-electric/80 font-body font-medium transition-colors"
          >
            {showForm ? 'Cancel' : '+ Add Link'}
          </button>
        )}
      </div>

      {/* Add form */}
      {showForm && (
        <div className="rounded-lg border border-cream-dark dark:border-slate-700 bg-cream/30 dark:bg-navy/30 p-3 space-y-2">
          <input
            type="text"
            value={githubUrl}
            onChange={(e) => setGithubUrl(e.target.value)}
            placeholder="https://github.com/owner/repo/pull/123"
            className="w-full px-3 py-1.5 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30"
          />
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional, auto-filled by webhook)"
            className="w-full px-3 py-1.5 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30"
          />
          {githubUrl && !parseGitHubUrl(githubUrl) && (
            <p className="text-xs text-red-500 font-body">
              Could not parse GitHub URL. Use format: github.com/owner/repo/pull/123
            </p>
          )}
          <button
            onClick={handleAdd}
            disabled={submitting || !parseGitHubUrl(githubUrl)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium font-body bg-electric text-white hover:bg-electric/90 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Adding...' : 'Add Link'}
          </button>
        </div>
      )}

      {/* Links list */}
      {links.length === 0 ? (
        <p className="text-xs text-navy/30 dark:text-slate-600 font-body py-2">No GitHub links attached.</p>
      ) : (
        <div className="space-y-1.5">
          {links.map((link) => (
            <div
              key={link.id}
              className="group flex items-center justify-between rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-navy/5 dark:bg-slate-800 text-navy/60 dark:text-slate-400 font-body">
                  {parseLinkType(link.link_type)}
                </span>
                {link.state && (
                  <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${stateColor(link.state)}`}>
                    {link.state}
                  </span>
                )}
                <a
                  href={link.github_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-electric hover:underline font-body truncate"
                  title={link.github_url}
                >
                  {link.title || `${link.repo_owner}/${link.repo_name}${link.github_id ? `#${link.github_id}` : ''}`}
                </a>
              </div>
              <button
                onClick={() => handleDelete(link.id)}
                className="opacity-0 group-hover:opacity-100 ml-2 text-red-400 hover:text-red-600 transition-all"
                title="Remove link"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
