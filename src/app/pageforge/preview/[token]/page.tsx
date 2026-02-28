'use client';

import { useState, useEffect } from 'react';

// ---------------------------------------------------------------------------
// Types for the sanitized preview response
// ---------------------------------------------------------------------------
interface PreviewBuild {
  id: string;
  page_title: string;
  page_slug: string | null;
  site_name: string | null;
  status: string;
  vqa_scores: {
    desktop: number | null;
    tablet: number | null;
    mobile: number | null;
    overall: number | null;
  };
  lighthouse_scores: {
    performance: number | null;
    accessibility: number | null;
    best_practices: number | null;
    seo: number | null;
  };
  qa_checks: {
    passed: number;
    failed: number;
    total: number;
    items: Array<{ name: string; passed: boolean; message: string | null }>;
  };
  wp_preview_url: string | null;
  wp_live_url: string | null;
  screenshots: Record<string, { figma?: string; wp?: string }>;
  phase_timeline: Array<{
    name: string;
    index: number;
    status: string;
    duration_ms: number | null;
  }>;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function humanStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function lighthouseColor(score: number | null): string {
  if (score == null) return 'border-gray-600 text-gray-500';
  if (score >= 90) return 'border-green-500 text-green-400';
  if (score >= 50) return 'border-yellow-500 text-yellow-400';
  return 'border-red-500 text-red-400';
}

function vqaBarColor(score: number | null): string {
  if (score == null) return 'bg-gray-700';
  if (score >= 90) return 'bg-green-500';
  if (score >= 70) return 'bg-yellow-500';
  return 'bg-red-500';
}

function statusBadgeColor(status: string): string {
  if (status === 'published') return 'bg-green-600 text-white';
  if (status === 'failed' || status === 'cancelled') return 'bg-red-600 text-white';
  if (status.includes('gate')) return 'bg-yellow-600 text-white';
  return 'bg-blue-600 text-white';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function PageForgePreviewPage({ params }: { params: { token: string } }) {
  const [build, setBuild] = useState<PreviewBuild | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [screenshotTab, setScreenshotTab] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');

  useEffect(() => {
    async function fetchPreview() {
      try {
        const res = await fetch(`/api/pageforge/preview/${params.token}`);
        if (!res.ok) {
          const json = await res.json();
          setError(json.error || 'Failed to load preview');
          return;
        }
        const json = await res.json();
        setBuild(json.build);
      } catch {
        setError('Failed to load preview');
      } finally {
        setLoading(false);
      }
    }
    fetchPreview();
  }, [params.token]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-gray-400">Loading preview...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-gray-200 mb-2">Preview Unavailable</h1>
          <p className="text-sm text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!build) return null;

  const hasScreenshots = Object.keys(build.screenshots).length > 0;
  const currentScreenshot = build.screenshots[screenshotTab];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-xl font-bold text-white">{build.page_title}</h1>
              {build.site_name && (
                <p className="text-sm text-gray-500 mt-0.5">
                  {build.site_name}
                  {build.page_slug ? ` / ${build.page_slug}` : ''}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${statusBadgeColor(build.status)}`}>
                {humanStatus(build.status)}
              </span>
              {build.wp_preview_url && (
                <a
                  href={build.wp_preview_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 text-xs font-semibold text-blue-400 border border-blue-500/30 hover:bg-blue-500/10 rounded-lg transition-colors"
                >
                  Preview Draft
                </a>
              )}
              {build.wp_live_url && (
                <a
                  href={build.wp_live_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
                >
                  Live Page
                </a>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left column: Phase timeline */}
          <div className="lg:col-span-1">
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
              <h2 className="text-sm font-semibold text-gray-300 mb-4">Build Progress</h2>
              <div className="space-y-0">
                {build.phase_timeline.map((phase, idx) => (
                  <div key={phase.name} className="flex items-start gap-3 relative">
                    {/* Vertical connector */}
                    {idx < build.phase_timeline.length - 1 && (
                      <div
                        className={`absolute left-3 top-6 w-0.5 h-full ${
                          phase.status === 'completed' ? 'bg-green-500' : 'bg-gray-800'
                        }`}
                      />
                    )}
                    {/* Status icon */}
                    <div className="shrink-0 relative z-10">
                      {phase.status === 'completed' ? (
                        <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                          <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      ) : phase.status === 'running' ? (
                        <div className="w-6 h-6 rounded-full border-2 border-blue-400 flex items-center justify-center">
                          <div className="w-3 h-3 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                        </div>
                      ) : phase.status === 'failed' ? (
                        <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
                          <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded-full border-2 border-gray-700 flex items-center justify-center">
                          <div className="w-2 h-2 rounded-full bg-gray-700" />
                        </div>
                      )}
                    </div>
                    {/* Phase info */}
                    <div className="pb-4 min-w-0">
                      <p className={`text-sm font-medium ${
                        phase.status === 'completed' ? 'text-gray-200'
                          : phase.status === 'running' ? 'text-blue-400'
                          : 'text-gray-600'
                      }`}>
                        {phase.name}
                      </p>
                      {phase.duration_ms != null && (
                        <p className="text-[10px] text-gray-600 mt-0.5">
                          {(phase.duration_ms / 1000).toFixed(1)}s
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right column: Scores and details */}
          <div className="lg:col-span-2 space-y-6">
            {/* VQA Scores */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
              <h2 className="text-sm font-semibold text-gray-300 mb-4">Visual Quality Scores</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Desktop', score: build.vqa_scores.desktop },
                  { label: 'Tablet', score: build.vqa_scores.tablet },
                  { label: 'Mobile', score: build.vqa_scores.mobile },
                  { label: 'Overall', score: build.vqa_scores.overall },
                ].map((item) => (
                  <div key={item.label} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">{item.label}</span>
                      <span className={`text-sm font-bold ${
                        item.score == null ? 'text-gray-600'
                          : item.score >= 90 ? 'text-green-400'
                          : item.score >= 70 ? 'text-yellow-400'
                          : 'text-red-400'
                      }`}>
                        {item.score != null ? `${item.score}%` : '-'}
                      </span>
                    </div>
                    <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${vqaBarColor(item.score)}`}
                        style={{ width: `${item.score ?? 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Lighthouse Scores */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
              <h2 className="text-sm font-semibold text-gray-300 mb-4">Lighthouse Scores</h2>
              <div className="flex items-center gap-6 flex-wrap">
                {[
                  { label: 'Performance', score: build.lighthouse_scores.performance },
                  { label: 'Accessibility', score: build.lighthouse_scores.accessibility },
                  { label: 'Best Practices', score: build.lighthouse_scores.best_practices },
                  { label: 'SEO', score: build.lighthouse_scores.seo },
                ].map((item) => (
                  <div key={item.label} className="flex flex-col items-center gap-1">
                    <div className={`w-14 h-14 rounded-full border-4 flex items-center justify-center ${lighthouseColor(item.score)}`}>
                      <span className="text-sm font-bold">
                        {item.score != null ? item.score : '-'}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-500">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* QA Summary */}
            {build.qa_checks.total > 0 && (
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-gray-300">QA Checks</h2>
                  <span className="text-xs text-gray-500">
                    {build.qa_checks.passed}/{build.qa_checks.total} passed
                  </span>
                </div>
                {build.qa_checks.items.length > 0 ? (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {build.qa_checks.items.map((item, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <span className={`shrink-0 mt-0.5 ${item.passed ? 'text-green-400' : 'text-red-400'}`}>
                          {item.passed ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          )}
                        </span>
                        <div>
                          <p className="text-sm text-gray-200">{item.name}</p>
                          {item.message && (
                            <p className="text-xs text-gray-500 mt-0.5">{item.message}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-4">
                    <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full transition-all duration-500"
                        style={{
                          width: build.qa_checks.total > 0
                            ? `${(build.qa_checks.passed / build.qa_checks.total) * 100}%`
                            : '0%',
                        }}
                      />
                    </div>
                    <span className="text-xs font-bold text-gray-400">
                      {build.qa_checks.total > 0
                        ? `${Math.round((build.qa_checks.passed / build.qa_checks.total) * 100)}%`
                        : '0%'}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Screenshot Comparison */}
            {hasScreenshots && (
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-gray-300">Screenshot Comparison</h2>
                  <div className="flex gap-1">
                    {(['desktop', 'tablet', 'mobile'] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setScreenshotTab(tab)}
                        className={`px-2.5 py-1 text-[10px] font-semibold rounded capitalize transition-colors ${
                          screenshotTab === tab
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-800 text-gray-500 hover:text-gray-300'
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] font-semibold text-gray-500 uppercase mb-2 block">
                      Figma Design
                    </span>
                    {currentScreenshot?.figma ? (
                      <img
                        src={currentScreenshot.figma}
                        alt={`Figma ${screenshotTab}`}
                        className="w-full rounded-lg border border-gray-800 bg-gray-950"
                      />
                    ) : (
                      <div className="w-full aspect-[4/3] rounded-lg border border-dashed border-gray-700 flex items-center justify-center">
                        <span className="text-xs text-gray-600">No screenshot</span>
                      </div>
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold text-gray-500 uppercase mb-2 block">
                      WordPress Output
                    </span>
                    {currentScreenshot?.wp ? (
                      <img
                        src={currentScreenshot.wp}
                        alt={`WordPress ${screenshotTab}`}
                        className="w-full rounded-lg border border-gray-800 bg-gray-950"
                      />
                    ) : (
                      <div className="w-full aspect-[4/3] rounded-lg border border-dashed border-gray-700 flex items-center justify-center">
                        <span className="text-xs text-gray-600">No screenshot</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Build metadata */}
        <div className="text-center text-xs text-gray-600 pt-4">
          Build created {new Date(build.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-6 mt-8">
        <p className="text-center text-xs text-gray-600">
          Powered by KM Boards PageForge
        </p>
      </footer>
    </div>
  );
}
