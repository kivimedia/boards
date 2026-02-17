'use client';

import { useState, useEffect, useCallback } from 'react';
import VideoPlayer from './VideoPlayer';
import type { AIVideoGeneration, VideoGenerationStatus } from '@/lib/types';

interface VideoGenerationResultsProps {
  cardId: string;
  refreshKey?: number;
}

interface Toast {
  type: 'success' | 'error';
  message: string;
}

const STATUS_STYLES: Record<VideoGenerationStatus, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', label: 'Pending' },
  processing: { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', label: 'Processing' },
  completed: { bg: 'bg-green-50 border-green-200', text: 'text-green-700', label: 'Completed' },
  failed: { bg: 'bg-red-50 border-red-200', text: 'text-red-700', label: 'Failed' },
};

const PROVIDER_LABELS: Record<string, string> = {
  sora: 'Sora',
  veo: 'Veo',
};

const MODE_LABELS: Record<string, string> = {
  text_to_video: 'Text-to-Video',
  image_to_video: 'Image-to-Video',
  start_end_frame: 'Start/End Frame',
};

export default function VideoGenerationResults({ cardId, refreshKey }: VideoGenerationResultsProps) {
  const [generations, setGenerations] = useState<AIVideoGeneration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchGenerations = useCallback(async () => {
    try {
      const res = await fetch(`/api/cards/${cardId}/video`);
      const json = await res.json();
      if (res.ok && json.data) {
        setGenerations(json.data);
      } else {
        setError(json.error || 'Failed to load video generations.');
      }
    } catch {
      setError('Network error loading video generations.');
    } finally {
      setLoading(false);
    }
  }, [cardId]);

  useEffect(() => {
    fetchGenerations();
  }, [fetchGenerations, refreshKey]);

  const handleDelete = async (generationId: string) => {
    if (!confirm('Are you sure you want to delete this video generation?')) return;

    try {
      const res = await fetch(`/api/cards/${cardId}/video/${generationId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Delete failed');
      }

      setGenerations((prev) => prev.filter((g) => g.id !== generationId));
      showToast('success', 'Video generation deleted.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Delete failed.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="flex items-center gap-3 text-navy/40 dark:text-slate-500 font-body text-sm">
          <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Loading videos...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-center">
        <p className="text-red-800 font-body text-sm">{error}</p>
      </div>
    );
  }

  if (generations.length === 0) {
    return (
      <div className="p-6 rounded-2xl bg-cream dark:bg-dark-bg border border-cream-dark dark:border-slate-700 text-center">
        <svg className="w-10 h-10 text-navy/20 dark:text-slate-700 dark:text-slate-700 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        <p className="text-sm text-navy/40 dark:text-slate-500 font-body">No video generations yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toast */}
      {toast && (
        <div
          className={`
            fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg font-body text-sm
            ${toast.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
            }
          `}
        >
          <span>{toast.message}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {generations.map((gen) => {
          const status = STATUS_STYLES[gen.status];
          const isExpanded = expandedId === gen.id;
          const hasVideo = gen.status === 'completed' && gen.output_urls.length > 0;

          return (
            <div
              key={gen.id}
              className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 overflow-hidden hover:border-navy/10 dark:hover:border-slate-600 transition-colors"
            >
              {/* Thumbnail / Video */}
              <div className="aspect-video bg-navy/5 dark:bg-slate-800 relative">
                {hasVideo ? (
                  isExpanded ? (
                    <VideoPlayer
                      src={gen.output_urls[0]}
                      poster={gen.thumbnail_url ?? undefined}
                      className="w-full h-full"
                    />
                  ) : (
                    <button
                      onClick={() => setExpandedId(gen.id)}
                      className="w-full h-full relative group"
                    >
                      {gen.thumbnail_url ? (
                        <img
                          src={gen.thumbnail_url}
                          alt="Video thumbnail"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-navy/5 dark:bg-slate-800">
                          <svg className="w-12 h-12 text-navy/20 dark:text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                      <div className="absolute inset-0 flex items-center justify-center bg-navy/10 group-hover:bg-navy/20 transition-colors">
                        <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                          <svg className="w-5 h-5 text-navy ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </div>
                    </button>
                  )
                ) : gen.status === 'processing' || gen.status === 'pending' ? (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="text-center">
                      <svg className="animate-spin h-8 w-8 text-electric mx-auto mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <p className="text-xs text-navy/40 dark:text-slate-500 font-body">Generating...</p>
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <svg className="w-10 h-10 text-red-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${status.bg} ${status.text}`}>
                      {status.label}
                    </span>
                    <span className="text-xs text-navy/40 dark:text-slate-500 font-body">
                      {PROVIDER_LABELS[gen.provider]} -- {MODE_LABELS[gen.mode]}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-navy/70 dark:text-slate-300 font-body line-clamp-2">{gen.prompt}</p>

                <div className="flex items-center justify-between text-xs text-navy/40 dark:text-slate-500 font-body">
                  <span>{new Date(gen.created_at).toLocaleDateString()}</span>
                  {gen.generation_time_ms && (
                    <span>{(gen.generation_time_ms / 1000).toFixed(1)}s</span>
                  )}
                </div>

                {gen.error_message && (
                  <p className="text-xs text-red-600 font-body bg-red-50 px-2 py-1 rounded">
                    {gen.error_message}
                  </p>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1">
                  {hasVideo && (
                    <a
                      href={gen.output_urls[0]}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                      className="
                        flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg
                        bg-cream dark:bg-dark-bg border border-cream-dark dark:border-slate-700 text-navy/60 dark:text-slate-400 hover:text-navy dark:hover:text-slate-100 hover:border-navy/20
                        transition-all duration-200
                      "
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download
                    </a>
                  )}
                  <button
                    onClick={() => handleDelete(gen.id)}
                    className="
                      flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg
                      bg-cream dark:bg-dark-bg border border-cream-dark dark:border-slate-700 text-red-500 hover:text-red-700 hover:border-red-200
                      transition-all duration-200
                    "
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
