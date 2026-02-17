'use client';

import { useState, useEffect, useCallback } from 'react';
import type { FigmaCardEmbed } from '@/lib/types';

interface FigmaEmbedsProps {
  cardId: string;
  integrationId?: string;
}

function parseFigmaUrl(url: string): { fileKey: string; nodeId?: string; embedType: 'file' | 'frame' | 'component' | 'prototype' } | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes('figma.com')) return null;

    const parts = parsed.pathname.split('/').filter(Boolean);
    // figma.com/file/FILEKEY/... or figma.com/design/FILEKEY/...
    // figma.com/proto/FILEKEY/...
    let fileKey = '';
    let embedType: 'file' | 'frame' | 'component' | 'prototype' = 'file';

    if (parts[0] === 'file' || parts[0] === 'design') {
      fileKey = parts[1] ?? '';
      embedType = 'file';
    } else if (parts[0] === 'proto') {
      fileKey = parts[1] ?? '';
      embedType = 'prototype';
    }

    if (!fileKey) return null;

    // Check for node-id in query params
    const nodeId = parsed.searchParams.get('node-id') ?? undefined;

    // If there is a node-id, treat as frame
    if (nodeId && embedType === 'file') {
      embedType = 'frame';
    }

    return { fileKey, nodeId, embedType };
  } catch {
    return null;
  }
}

export default function FigmaEmbeds({ cardId, integrationId }: FigmaEmbedsProps) {
  const [embeds, setEmbeds] = useState<FigmaCardEmbed[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [figmaUrl, setFigmaUrl] = useState('');
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchEmbeds = useCallback(async () => {
    try {
      const res = await fetch(`/api/cards/${cardId}/figma`);
      const json = await res.json();
      if (json.data) setEmbeds(json.data);
    } finally {
      setLoading(false);
    }
  }, [cardId]);

  useEffect(() => {
    fetchEmbeds();
  }, [fetchEmbeds]);

  const handleAdd = async () => {
    if (!figmaUrl.trim() || !integrationId) return;

    const parsed = parseFigmaUrl(figmaUrl);
    if (!parsed) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/cards/${cardId}/figma`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integration_id: integrationId,
          figma_file_key: parsed.fileKey,
          figma_node_id: parsed.nodeId,
          figma_url: figmaUrl.trim(),
          embed_type: parsed.embedType,
          title: title.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (json.data) {
        setEmbeds((prev) => [json.data, ...prev]);
        setFigmaUrl('');
        setTitle('');
        setShowForm(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (embedId: string) => {
    await fetch(`/api/cards/${cardId}/figma/${embedId}`, { method: 'DELETE' });
    setEmbeds((prev) => prev.filter((e) => e.id !== embedId));
  };

  const embedTypeLabel = (type: string): string => {
    switch (type) {
      case 'file': return 'File';
      case 'frame': return 'Frame';
      case 'component': return 'Component';
      case 'prototype': return 'Prototype';
      default: return type;
    }
  };

  if (loading) {
    return <div className="animate-pulse h-10 rounded-lg bg-cream-dark/40 dark:bg-slate-800/40" />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-navy/60 dark:text-slate-400 font-heading uppercase tracking-wider">
          Figma Designs
        </h4>
        {integrationId && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="text-xs text-electric hover:text-electric/80 font-body font-medium transition-colors"
          >
            {showForm ? 'Cancel' : '+ Add Design'}
          </button>
        )}
      </div>

      {/* Add form */}
      {showForm && (
        <div className="rounded-lg border border-cream-dark dark:border-slate-700 bg-cream/30 dark:bg-navy/30 p-3 space-y-2">
          <input
            type="text"
            value={figmaUrl}
            onChange={(e) => setFigmaUrl(e.target.value)}
            placeholder="https://www.figma.com/file/abc123/My-Design"
            className="w-full px-3 py-1.5 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30"
          />
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Design title (optional)"
            className="w-full px-3 py-1.5 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30"
          />
          {figmaUrl && !parseFigmaUrl(figmaUrl) && (
            <p className="text-xs text-red-500 font-body">
              Invalid Figma URL. Use format: figma.com/file/FILEKEY/...
            </p>
          )}
          {figmaUrl && parseFigmaUrl(figmaUrl) && (
            <div className="text-xs text-navy/50 dark:text-slate-400 font-body">
              Detected: {embedTypeLabel(parseFigmaUrl(figmaUrl)!.embedType)}
              {parseFigmaUrl(figmaUrl)!.nodeId && ` (node: ${parseFigmaUrl(figmaUrl)!.nodeId})`}
            </div>
          )}
          <button
            onClick={handleAdd}
            disabled={submitting || !parseFigmaUrl(figmaUrl)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium font-body bg-electric text-white hover:bg-electric/90 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Adding...' : 'Add Embed'}
          </button>
        </div>
      )}

      {/* Embeds list */}
      {embeds.length === 0 ? (
        <p className="text-xs text-navy/30 dark:text-slate-600 font-body py-2">No Figma designs attached.</p>
      ) : (
        <div className="space-y-2">
          {embeds.map((embed) => (
            <div
              key={embed.id}
              className="rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface overflow-hidden"
            >
              <div className="flex items-center justify-between px-3 py-2">
                <button
                  onClick={() => setExpandedId(expandedId === embed.id ? null : embed.id)}
                  className="flex items-center gap-2 min-w-0 text-left"
                >
                  <span className="shrink-0 w-6 h-6 rounded bg-purple-50 text-purple-600 flex items-center justify-center text-xs font-bold font-body">
                    F
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-navy dark:text-slate-100 font-heading truncate">
                      {embed.title || `Figma ${embedTypeLabel(embed.embed_type)}`}
                    </p>
                    <p className="text-[10px] text-navy/40 dark:text-slate-500 font-body">
                      {embedTypeLabel(embed.embed_type)} &middot; {embed.figma_file_key.slice(0, 8)}...
                    </p>
                  </div>
                </button>
                <div className="flex items-center gap-2">
                  <a
                    href={embed.figma_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-electric hover:text-electric/80 font-body transition-colors"
                  >
                    Open
                  </a>
                  <button
                    onClick={() => handleDelete(embed.id)}
                    className="text-red-400 hover:text-red-600 transition-colors"
                    title="Remove embed"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Expanded embed preview */}
              {expandedId === embed.id && (
                <div className="border-t border-cream-dark dark:border-slate-700 p-3">
                  {embed.thumbnail_url ? (
                    <img
                      src={embed.thumbnail_url}
                      alt={embed.title || 'Figma preview'}
                      className="w-full rounded-lg"
                    />
                  ) : (
                    <div className="w-full aspect-video rounded-lg bg-cream-dark/30 flex items-center justify-center">
                      <iframe
                        src={`https://www.figma.com/embed?embed_host=agency-board&url=${encodeURIComponent(embed.figma_url)}`}
                        className="w-full h-full rounded-lg border-0"
                        allowFullScreen
                        title={embed.title || 'Figma embed'}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
