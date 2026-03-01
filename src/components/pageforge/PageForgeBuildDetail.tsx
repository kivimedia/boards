'use client';

import { useState, useEffect, useCallback } from 'react';
import type {
  PageForgeBuild,
  PageForgeBuildPhase,
  PageForgeBuildStatus,
  PageForgeGateDecision,
  PageForgeAgentCall,
  PageForgePreviewToken,
  PageForgeNamingIssue,
  PageForgeDesignerFixRequest,
} from '@/lib/types';
import PageForgeChatPanel from './PageForgeChatPanel';
import PageForgeDesignerSuggestions from './PageForgeDesignerSuggestions';

// ---------------------------------------------------------------------------
// Phase definitions (order matters)
// ---------------------------------------------------------------------------
const PHASE_NAMES: string[] = [
  'Preflight',
  'Figma Analysis',
  'Section Classification',
  'Markup Generation',
  'Markup Validation',
  'Deploy Draft',
  'Image Optimization',
  'VQA Capture',
  'VQA Comparison',
  'VQA Fix Loop',
  'Functional QA',
  'SEO Config',
  'Report Generation',
  'Developer Review Gate',
  'AM Sign-off Gate',
];

const GATE_STATUSES: PageForgeBuildStatus[] = [
  'developer_review_gate',
  'am_signoff_gate',
];

const IN_PROGRESS_STATUSES: PageForgeBuildStatus[] = [
  'pending',
  'preflight',
  'figma_analysis',
  'section_classification',
  'markup_generation',
  'markup_validation',
  'deploy_draft',
  'image_optimization',
  'vqa_capture',
  'vqa_comparison',
  'vqa_fix_loop',
  'functional_qa',
  'seo_config',
  'report_generation',
  'developer_review_gate',
  'am_signoff_gate',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function humanStatus(status: string): string {
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function lighthouseColor(score: number | null): string {
  if (score == null) return 'border-navy/10 text-navy/30 dark:border-slate-700 dark:text-slate-600';
  if (score >= 90) return 'border-green-500 text-green-700 dark:text-green-400';
  if (score >= 50) return 'border-yellow-500 text-yellow-700 dark:text-yellow-400';
  return 'border-red-500 text-red-700 dark:text-red-400';
}

function vqaBarColor(score: number | null): string {
  if (score == null) return 'bg-navy/10 dark:bg-slate-700';
  if (score >= 90) return 'bg-green-500';
  if (score >= 70) return 'bg-yellow-500';
  return 'bg-red-500';
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface PageForgeBuildDetailProps {
  buildId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function PageForgeBuildDetail({ buildId }: PageForgeBuildDetailProps) {
  const [build, setBuild] = useState<PageForgeBuild | null>(null);
  const [phases, setPhases] = useState<PageForgeBuildPhase[]>([]);
  const [agentCalls, setAgentCalls] = useState<PageForgeAgentCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [screenshotTab, setScreenshotTab] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [gateAction, setGateAction] = useState<PageForgeGateDecision | null>(null);
  const [gateFeedback, setGateFeedback] = useState('');
  const [submittingGate, setSubmittingGate] = useState(false);
  const [showAbortConfirm, setShowAbortConfirm] = useState(false);
  const [abortReason, setAbortReason] = useState('');
  const [aborting, setAborting] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [previewTokens, setPreviewTokens] = useState<PageForgePreviewToken[]>([]);
  const [creatingToken, setCreatingToken] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedErrorIdx, setCopiedErrorIdx] = useState<number | null>(null);

  // Naming issues state
  const [selectedNamingIssues, setSelectedNamingIssues] = useState<Set<string>>(new Set());
  const [designerFeedback, setDesignerFeedback] = useState('');
  const [submittingDesignerRequest, setSubmittingDesignerRequest] = useState(false);
  const [showDesignerReportModal, setShowDesignerReportModal] = useState(false);
  const [designerReportMarkdown, setDesignerReportMarkdown] = useState('');
  const [copiedReport, setCopiedReport] = useState(false);
  const [resolvingDesignerRequest, setResolvingDesignerRequest] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // Auto-name state
  const [autoNaming, setAutoNaming] = useState(false);
  const [autoNameResults, setAutoNameResults] = useState<Array<{
    nodeId: string;
    currentName: string;
    suggestedName: string;
    reason: string;
  }> | null>(null);
  const [autoNameError, setAutoNameError] = useState<string | null>(null);

  // ------- Fetch build -------
  const fetchBuild = useCallback(async () => {
    try {
      const res = await fetch(`/api/pageforge/builds/${buildId}`);
      const json = await res.json();
      const buildData = json.build ?? json.data?.build ?? json.data;
      if (buildData) {
        setBuild(buildData);
        if (buildData.phases) setPhases(buildData.phases);
        if (buildData.agent_calls) setAgentCalls(buildData.agent_calls);
      }
    } catch (err) {
      console.error('Failed to fetch build:', err);
      setError('Failed to load build details');
    }
  }, [buildId]);

  useEffect(() => {
    async function init() {
      setLoading(true);
      await fetchBuild();
      setLoading(false);
    }
    init();
  }, [fetchBuild]);

  // Auto-refresh every 5s when in progress
  useEffect(() => {
    if (!build) return;
    const isActive = IN_PROGRESS_STATUSES.includes(build.status);
    if (!isActive) return;
    const interval = setInterval(fetchBuild, 5_000);
    return () => clearInterval(interval);
  }, [build, fetchBuild]);

  // ------- Gate submission -------
  const handleGateSubmit = async () => {
    if (!gateAction) return;
    setSubmittingGate(true);
    try {
      const res = await fetch(`/api/pageforge/builds/${buildId}/gate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: gateAction,
          feedback: gateFeedback || undefined,
        }),
      });
      if (!res.ok) throw new Error('Gate submit failed');
      setGateAction(null);
      setGateFeedback('');
      await fetchBuild();
    } catch (err) {
      console.error('Gate submit error:', err);
      setError('Failed to submit gate decision');
    } finally {
      setSubmittingGate(false);
    }
  };

  // ------- Abort handler -------
  const handleAbort = async () => {
    setAborting(true);
    try {
      const res = await fetch(`/api/pageforge/builds/${buildId}/abort`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: abortReason || 'Manual abort' }),
      });
      if (!res.ok) throw new Error('Abort failed');
      setShowAbortConfirm(false);
      setAbortReason('');
      await fetchBuild();
    } catch (err) {
      console.error('Abort error:', err);
      setError('Failed to abort build');
    } finally {
      setAborting(false);
    }
  };

  // ------- Retry handler (re-queue failed build from the failed phase) -------
  const handleRetry = async () => {
    if (!build) return;
    setRetrying(true);
    setError(null);
    try {
      // Reset the build status and re-create a VPS job to resume from the failed phase
      const res = await fetch(`/api/pageforge/builds/${buildId}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume_from_phase: build.current_phase }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Retry failed');
      }
      await fetchBuild();
    } catch (err) {
      console.error('Retry error:', err);
      setError(err instanceof Error ? err.message : 'Failed to retry build');
    } finally {
      setRetrying(false);
    }
  };

  // ------- Auto-Name handler -------
  const handleAutoName = async () => {
    setAutoNaming(true);
    setAutoNameError(null);
    setAutoNameResults(null);
    try {
      const res = await fetch(`/api/pageforge/builds/${buildId}/auto-name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Auto-name failed');
      const data = json.data || json;
      setAutoNameResults(data.renames || []);
    } catch (err) {
      console.error('Auto-name error:', err);
      setAutoNameError(err instanceof Error ? err.message : 'Failed to generate names');
    } finally {
      setAutoNaming(false);
    }
  };

  // ------- Share Preview handlers -------
  const fetchPreviewTokens = useCallback(async () => {
    try {
      const res = await fetch(`/api/pageforge/builds/${buildId}/preview`);
      const json = await res.json();
      if (json.data?.tokens) {
        setPreviewTokens(json.data.tokens);
      }
    } catch (err) {
      console.error('Failed to fetch preview tokens:', err);
    }
  }, [buildId]);

  const handleCreateToken = async () => {
    setCreatingToken(true);
    try {
      const res = await fetch(`/api/pageforge/builds/${buildId}/preview`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to create token');
      await fetchPreviewTokens();
    } catch (err) {
      console.error('Create token error:', err);
      setError('Failed to create preview link');
    } finally {
      setCreatingToken(false);
    }
  };

  const handleRevokeToken = async (tokenId: string) => {
    try {
      const res = await fetch(`/api/pageforge/builds/${buildId}/preview`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token_id: tokenId }),
      });
      if (!res.ok) throw new Error('Failed to revoke token');
      await fetchPreviewTokens();
    } catch (err) {
      console.error('Revoke token error:', err);
    }
  };

  const handleShareClick = async () => {
    setShowShareModal(true);
    await fetchPreviewTokens();
  };

  const copyPreviewUrl = (token: string) => {
    const url = `${window.location.origin}/pageforge/preview/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  // ------- Designer Fix Request handlers -------
  const namingIssues: PageForgeNamingIssue[] =
    ((build?.artifacts as any)?.preflight?.figma_naming?.issues as PageForgeNamingIssue[]) || [];
  const designerFixRequest: PageForgeDesignerFixRequest | null =
    ((build?.artifacts as any)?.designer_fix_request as PageForgeDesignerFixRequest) || null;

  const toggleNamingIssue = (nodeId: string) => {
    setSelectedNamingIssues((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const toggleAllNamingIssues = () => {
    if (selectedNamingIssues.size === namingIssues.length) {
      setSelectedNamingIssues(new Set());
    } else {
      setSelectedNamingIssues(new Set(namingIssues.map((i) => i.nodeId)));
    }
  };

  const handleSubmitDesignerRequest = async () => {
    if (selectedNamingIssues.size === 0) return;
    setSubmittingDesignerRequest(true);
    try {
      const res = await fetch(`/api/pageforge/builds/${buildId}/designer-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issues: Array.from(selectedNamingIssues),
          feedback: designerFeedback || '',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to create designer fix request');
      setDesignerReportMarkdown(json.data?.markdown_report || '');
      setShowDesignerReportModal(true);
      setSelectedNamingIssues(new Set());
      setDesignerFeedback('');
      await fetchBuild();
    } catch (err) {
      console.error('Designer request error:', err);
      setError('Failed to create designer fix request');
    } finally {
      setSubmittingDesignerRequest(false);
    }
  };

  const handleResolveDesignerRequest = async () => {
    setResolvingDesignerRequest(true);
    try {
      const res = await fetch(`/api/pageforge/builds/${buildId}/designer-request`, {
        method: 'PATCH',
      });
      if (!res.ok) throw new Error('Failed to resolve designer fix request');
      await fetchBuild();
    } catch (err) {
      console.error('Resolve designer request error:', err);
      setError('Failed to resolve designer fix request');
    } finally {
      setResolvingDesignerRequest(false);
    }
  };

  const copyReportToClipboard = () => {
    navigator.clipboard.writeText(designerReportMarkdown);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2000);
  };

  // ------- Loading / Error -------
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !build) {
    return (
      <div className="text-center py-20">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  if (!build) return null;

  const isAtGate = GATE_STATUSES.includes(build.status);
  const isActive = !['published', 'failed', 'cancelled'].includes(build.status);
  const artifacts = (build.artifacts ?? {}) as Record<string, string>;

  // Screenshot URLs from artifacts
  const screenshotKeys: Record<string, { figma: string; wp: string }> = {
    desktop: {
      figma: artifacts.figma_screenshot_desktop ?? '',
      wp: artifacts.wp_screenshot_desktop ?? '',
    },
    tablet: {
      figma: artifacts.figma_screenshot_tablet ?? '',
      wp: artifacts.wp_screenshot_tablet ?? '',
    },
    mobile: {
      figma: artifacts.figma_screenshot_mobile ?? '',
      wp: artifacts.wp_screenshot_mobile ?? '',
    },
  };

  // QA items from phase_results
  const qaResults = (build.phase_results?.functional_qa ?? {}) as Record<string, unknown>;
  const qaItems = (qaResults.checks ?? []) as Array<{ name: string; passed: boolean; message?: string }>;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <a
            href="/pageforge"
            className="text-xs text-electric hover:text-electric-bright transition-colors"
          >
            Back to Dashboard
          </a>
          <h1 className="text-xl font-bold text-navy dark:text-slate-100 font-heading mt-1">
            {build.page_title}
          </h1>
          {build.site_profile?.site_name && (
            <p className="text-sm text-navy/40 dark:text-slate-500">
              {build.site_profile.site_name}
              {build.page_slug ? ` / ${build.page_slug}` : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {build.wp_draft_url && (
            <a
              href={build.wp_draft_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-electric hover:text-electric-bright"
            >
              Draft Preview
            </a>
          )}
          {build.wp_live_url && (
            <a
              href={build.wp_live_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 text-xs font-semibold text-white bg-success rounded-lg"
            >
              Live Page
            </a>
          )}
          <button
            onClick={handleShareClick}
            className="px-3 py-1.5 text-xs font-semibold border border-electric/30 text-electric hover:bg-electric/10 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Share Preview
          </button>
          {build.status === 'failed' && (
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="px-3 py-1.5 text-xs font-semibold border border-electric text-electric hover:bg-electric/10 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {retrying ? 'Retrying...' : 'Retry Build'}
            </button>
          )}
          {isActive && (
            <div className="relative">
              <button
                onClick={() => setShowAbortConfirm(!showAbortConfirm)}
                className="px-3 py-1.5 text-xs font-semibold border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                </svg>
                Abort Build
              </button>
              {showAbortConfirm && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-slate-800 rounded-xl border border-navy/10 dark:border-slate-700 shadow-lg p-4 z-50">
                  <p className="text-sm font-semibold text-navy dark:text-slate-200 mb-2">
                    Abort this build?
                  </p>
                  <p className="text-xs text-navy/40 dark:text-slate-500 mb-3">
                    This will cancel the build and any active VPS jobs. This action cannot be undone.
                  </p>
                  <textarea
                    value={abortReason}
                    onChange={(e) => setAbortReason(e.target.value)}
                    placeholder="Reason for aborting (optional)..."
                    rows={2}
                    className="w-full rounded-lg border border-navy/10 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-navy dark:text-slate-200 px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-red-400/40 resize-none"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleAbort}
                      disabled={aborting}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {aborting ? 'Aborting...' : 'Confirm Abort'}
                    </button>
                    <button
                      onClick={() => {
                        setShowAbortConfirm(false);
                        setAbortReason('');
                      }}
                      className="px-3 py-1.5 text-xs font-semibold text-navy/60 dark:text-slate-400 hover:text-navy dark:hover:text-slate-200 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Share Preview Modal */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowShareModal(false)}>
          <div
            className="bg-white dark:bg-slate-800 rounded-xl border border-navy/10 dark:border-slate-700 shadow-xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-navy/5 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-navy dark:text-slate-200">Share Preview Link</h3>
              <button
                onClick={() => setShowShareModal(false)}
                className="text-navy/30 dark:text-slate-500 hover:text-navy dark:hover:text-slate-200 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              <p className="text-xs text-navy/40 dark:text-slate-500">
                Generate a shareable link so clients can view the build status, scores, and screenshots without logging in. Links expire after 7 days.
              </p>

              {/* Existing tokens */}
              {previewTokens.length > 0 && (
                <div className="space-y-2">
                  {previewTokens.map((pt) => (
                    <div
                      key={pt.id}
                      className="bg-navy/[0.02] dark:bg-slate-700/50 rounded-lg border border-navy/5 dark:border-slate-600 px-3 py-2.5"
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <input
                          type="text"
                          readOnly
                          value={`${typeof window !== 'undefined' ? window.location.origin : ''}/pageforge/preview/${pt.token}`}
                          className="flex-1 text-[11px] font-mono bg-transparent text-navy/60 dark:text-slate-400 outline-none truncate"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-navy/30 dark:text-slate-500">
                          Expires {new Date(pt.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => copyPreviewUrl(pt.token)}
                            className="text-[10px] font-semibold text-electric hover:text-electric-bright transition-colors"
                          >
                            {copiedUrl ? 'Copied!' : 'Copy Link'}
                          </button>
                          <button
                            onClick={() => handleRevokeToken(pt.id)}
                            className="text-[10px] font-semibold text-red-500 hover:text-red-400 transition-colors"
                          >
                            Revoke
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Create new token */}
              <button
                onClick={handleCreateToken}
                disabled={creatingToken}
                className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-electric hover:bg-electric-bright rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {creatingToken ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Generate New Link
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Phase timeline */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 p-4">
            <h2 className="text-sm font-semibold text-navy dark:text-slate-200 mb-4">
              Build Phases
            </h2>
            <div className="space-y-0">
              {PHASE_NAMES.map((name, idx) => {
                const phase = phases.find((p) => p.phase_index === idx);
                const phaseStatus = phase?.status ?? 'pending';
                const isCurrent = build.current_phase === idx;

                return (
                  <div key={name} className="flex items-start gap-3 relative">
                    {/* Vertical connector line */}
                    {idx < PHASE_NAMES.length - 1 && (
                      <div
                        className={`absolute left-3 top-6 w-0.5 h-full ${
                          phaseStatus === 'completed'
                            ? 'bg-success'
                            : 'bg-navy/10 dark:bg-slate-700'
                        }`}
                      />
                    )}

                    {/* Status icon */}
                    <div className="shrink-0 relative z-10">
                      {phaseStatus === 'completed' ? (
                        <div className="w-6 h-6 rounded-full bg-success flex items-center justify-center">
                          <svg
                            className="w-3.5 h-3.5 text-white"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={3}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        </div>
                      ) : phaseStatus === 'running' || isCurrent ? (
                        <div className="w-6 h-6 rounded-full border-2 border-electric flex items-center justify-center">
                          <div className="w-3 h-3 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
                        </div>
                      ) : phaseStatus === 'failed' ? (
                        <div className="w-6 h-6 rounded-full bg-danger flex items-center justify-center">
                          <svg
                            className="w-3.5 h-3.5 text-white"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={3}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded-full border-2 border-navy/10 dark:border-slate-700 flex items-center justify-center">
                          <div className="w-2 h-2 rounded-full bg-navy/10 dark:bg-slate-700" />
                        </div>
                      )}
                    </div>

                    {/* Phase info */}
                    <div className="pb-4 min-w-0">
                      <p
                        className={`text-sm font-medium ${
                          isCurrent
                            ? 'text-electric'
                            : phaseStatus === 'completed'
                              ? 'text-navy dark:text-slate-200'
                              : 'text-navy/40 dark:text-slate-500'
                        }`}
                      >
                        {name}
                      </p>
                      {phase?.duration_ms != null && (
                        <p className="text-[10px] text-navy/30 dark:text-slate-600 mt-0.5">
                          {(phase.duration_ms / 1000).toFixed(1)}s
                        </p>
                      )}
                      {phase?.error_message && (
                        <p className="text-[10px] text-red-500 dark:text-red-400 mt-0.5 truncate">
                          {phase.error_message}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Chat Panel */}
          <div className="mt-6">
            <PageForgeChatPanel buildId={build.id} buildStatus={build.status} />
          </div>
        </div>

        {/* Right column: Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* VQA Scores */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 p-4">
            <h2 className="text-sm font-semibold text-navy dark:text-slate-200 mb-4">
              VQA Scores
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Desktop', score: build.vqa_score_desktop },
                { label: 'Tablet', score: build.vqa_score_tablet },
                { label: 'Mobile', score: build.vqa_score_mobile },
                { label: 'Overall', score: build.vqa_score_overall },
              ].map((item) => (
                <div key={item.label} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-navy/40 dark:text-slate-500">
                      {item.label}
                    </span>
                    <span
                      className={`text-sm font-bold ${
                        item.score == null
                          ? 'text-navy/30 dark:text-slate-600'
                          : item.score >= 90
                            ? 'text-success'
                            : item.score >= 70
                              ? 'text-warning'
                              : 'text-danger'
                      }`}
                    >
                      {item.score != null ? `${item.score}%` : '-'}
                    </span>
                  </div>
                  <div className="h-2 bg-navy/5 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${vqaBarColor(item.score)}`}
                      style={{ width: `${item.score ?? 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            {build.vqa_fix_iteration > 0 && (
              <p className="text-[10px] text-navy/30 dark:text-slate-600 mt-3">
                VQA fix iteration: {build.vqa_fix_iteration}
              </p>
            )}
          </div>

          {/* Screenshot comparison */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-navy dark:text-slate-200">
                Screenshot Comparison
              </h2>
              <div className="flex gap-1">
                {(['desktop', 'tablet', 'mobile'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setScreenshotTab(tab)}
                    className={`px-2.5 py-1 text-[10px] font-semibold rounded capitalize transition-colors ${
                      screenshotTab === tab
                        ? 'bg-electric text-white'
                        : 'bg-navy/5 dark:bg-slate-700 text-navy/40 dark:text-slate-500 hover:text-navy/60 dark:hover:text-slate-300'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase mb-2 block">
                  Figma Design
                </span>
                {screenshotKeys[screenshotTab]?.figma ? (
                  <img
                    src={screenshotKeys[screenshotTab].figma}
                    alt={`Figma ${screenshotTab}`}
                    className="w-full rounded-lg border border-navy/5 dark:border-slate-700 bg-navy/[0.02] dark:bg-slate-900"
                  />
                ) : (
                  <div className="w-full aspect-[4/3] rounded-lg border border-dashed border-navy/10 dark:border-slate-700 flex items-center justify-center">
                    <span className="text-xs text-navy/30 dark:text-slate-600">No screenshot</span>
                  </div>
                )}
              </div>
              <div>
                <span className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase mb-2 block">
                  WordPress Output
                </span>
                {screenshotKeys[screenshotTab]?.wp ? (
                  <img
                    src={screenshotKeys[screenshotTab].wp}
                    alt={`WordPress ${screenshotTab}`}
                    className="w-full rounded-lg border border-navy/5 dark:border-slate-700 bg-navy/[0.02] dark:bg-slate-900"
                  />
                ) : (
                  <div className="w-full aspect-[4/3] rounded-lg border border-dashed border-navy/10 dark:border-slate-700 flex items-center justify-center">
                    <span className="text-xs text-navy/30 dark:text-slate-600">No screenshot</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Lighthouse scores */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 p-4">
            <h2 className="text-sm font-semibold text-navy dark:text-slate-200 mb-4">
              Lighthouse Scores
            </h2>
            <div className="flex items-center gap-6 flex-wrap">
              {[
                { label: 'Performance', score: build.lighthouse_performance, abbr: 'P' },
                { label: 'Accessibility', score: build.lighthouse_accessibility, abbr: 'A' },
                { label: 'Best Practices', score: build.lighthouse_best_practices, abbr: 'BP' },
                { label: 'SEO', score: build.lighthouse_seo, abbr: 'SEO' },
              ].map((item) => (
                <div key={item.abbr} className="flex flex-col items-center gap-1">
                  <div
                    className={`w-14 h-14 rounded-full border-4 flex items-center justify-center ${lighthouseColor(item.score)}`}
                  >
                    <span className="text-sm font-bold">
                      {item.score != null ? item.score : '-'}
                    </span>
                  </div>
                  <span className="text-[10px] text-navy/40 dark:text-slate-500">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* QA Checklist */}
          {(build.qa_checks_total > 0 || qaItems.length > 0) && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-navy dark:text-slate-200">
                  QA Checks
                </h2>
                <span className="text-xs text-navy/40 dark:text-slate-500">
                  {build.qa_checks_passed}/{build.qa_checks_total} passed
                </span>
              </div>
              {qaItems.length > 0 ? (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {qaItems.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className={`shrink-0 mt-0.5 ${item.passed ? 'text-success' : 'text-danger'}`}>
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
                        <p className="text-sm text-navy dark:text-slate-200">{item.name}</p>
                        {item.message && (
                          <p className="text-xs text-navy/40 dark:text-slate-500 mt-0.5">{item.message}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="flex-1 h-2 bg-navy/5 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-success rounded-full transition-all duration-500"
                      style={{
                        width: build.qa_checks_total > 0
                          ? `${(build.qa_checks_passed / build.qa_checks_total) * 100}%`
                          : '0%',
                      }}
                    />
                  </div>
                  <span className="text-xs font-bold text-navy/60 dark:text-slate-400">
                    {build.qa_checks_total > 0
                      ? `${Math.round((build.qa_checks_passed / build.qa_checks_total) * 100)}%`
                      : '0%'}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Cost Breakdown */}
          {Object.keys(build.agent_costs ?? {}).length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-navy dark:text-slate-200">
                  Cost Breakdown
                </h2>
                <span className="text-sm font-bold text-navy dark:text-slate-100">
                  ${build.total_cost_usd.toFixed(2)}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-navy/5 dark:border-slate-700">
                      <th className="px-3 py-2 text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase">
                        Agent
                      </th>
                      <th className="px-3 py-2 text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase text-right">
                        Cost
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy/5 dark:divide-slate-700">
                    {Object.entries(build.agent_costs).map(([agent, cost]) => (
                      <tr key={agent}>
                        <td className="px-3 py-2 text-sm text-navy dark:text-slate-200">
                          {agent.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                        </td>
                        <td className="px-3 py-2 text-sm text-navy/60 dark:text-slate-400 text-right">
                          ${Number(cost).toFixed(3)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Gate Actions */}
          {isAtGate && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border-2 border-warning/40 dark:border-warning/20 p-5">
              <h2 className="text-sm font-semibold text-navy dark:text-slate-200 mb-1">
                Gate Decision Required
              </h2>
              <p className="text-xs text-navy/40 dark:text-slate-500 mb-4">
                {build.status === 'developer_review_gate'
                  ? 'Developer review - check code quality and visual accuracy before proceeding.'
                  : 'Account Manager sign-off - confirm client requirements are met.'}
              </p>

              {/* Build preview for informed decision */}
              <div className="mb-4 space-y-3">
                {/* Draft URL - most important */}
                {build.wp_draft_url && (
                  <a
                    href={build.wp_draft_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-3 rounded-lg bg-electric/10 dark:bg-electric/20 border border-electric/20 hover:bg-electric/20 dark:hover:bg-electric/30 transition-colors group"
                  >
                    <svg className="w-5 h-5 text-electric flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    <div>
                      <span className="text-sm font-semibold text-electric group-hover:text-electric-bright block">
                        Open Draft Preview
                      </span>
                      <span className="text-[10px] text-navy/40 dark:text-slate-500">
                        {build.wp_draft_url}
                      </span>
                    </div>
                  </a>
                )}

                {/* Quick stats row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {build.vqa_score_overall != null && (
                    <div className="px-3 py-2 rounded-lg bg-cream dark:bg-slate-700/50 text-center">
                      <span className="block text-[10px] text-navy/40 dark:text-slate-500 uppercase">VQA</span>
                      <span className={`text-sm font-bold ${
                        build.vqa_score_overall >= 90 ? 'text-success' :
                        build.vqa_score_overall >= 70 ? 'text-warning' : 'text-danger'
                      }`}>{build.vqa_score_overall}%</span>
                    </div>
                  )}
                  {build.vqa_score_desktop != null && (
                    <div className="px-3 py-2 rounded-lg bg-cream dark:bg-slate-700/50 text-center">
                      <span className="block text-[10px] text-navy/40 dark:text-slate-500 uppercase">Desktop</span>
                      <span className={`text-sm font-bold ${
                        build.vqa_score_desktop >= 90 ? 'text-success' :
                        build.vqa_score_desktop >= 70 ? 'text-warning' : 'text-danger'
                      }`}>{build.vqa_score_desktop}%</span>
                    </div>
                  )}
                  {build.vqa_score_tablet != null && (
                    <div className="px-3 py-2 rounded-lg bg-cream dark:bg-slate-700/50 text-center">
                      <span className="block text-[10px] text-navy/40 dark:text-slate-500 uppercase">Tablet</span>
                      <span className={`text-sm font-bold ${
                        build.vqa_score_tablet >= 90 ? 'text-success' :
                        build.vqa_score_tablet >= 70 ? 'text-warning' : 'text-danger'
                      }`}>{build.vqa_score_tablet}%</span>
                    </div>
                  )}
                  {build.vqa_score_mobile != null && (
                    <div className="px-3 py-2 rounded-lg bg-cream dark:bg-slate-700/50 text-center">
                      <span className="block text-[10px] text-navy/40 dark:text-slate-500 uppercase">Mobile</span>
                      <span className={`text-sm font-bold ${
                        build.vqa_score_mobile >= 90 ? 'text-success' :
                        build.vqa_score_mobile >= 70 ? 'text-warning' : 'text-danger'
                      }`}>{build.vqa_score_mobile}%</span>
                    </div>
                  )}
                  {build.total_cost_usd > 0 && (
                    <div className="px-3 py-2 rounded-lg bg-cream dark:bg-slate-700/50 text-center">
                      <span className="block text-[10px] text-navy/40 dark:text-slate-500 uppercase">Cost</span>
                      <span className="text-sm font-bold text-navy dark:text-slate-200">${Number(build.total_cost_usd).toFixed(3)}</span>
                    </div>
                  )}
                </div>

                {/* No draft URL warning */}
                {!build.wp_draft_url && (
                  <div className="px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      No draft URL available yet. The build may not have reached the deploy phase.
                    </p>
                  </div>
                )}
              </div>

              {/* Feedback textarea */}
              <textarea
                value={gateFeedback}
                onChange={(e) => setGateFeedback(e.target.value)}
                placeholder="Optional feedback or revision notes..."
                rows={3}
                className="w-full rounded-lg border border-navy/10 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-navy dark:text-slate-200 px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-electric/40 resize-none"
              />

              {/* Action buttons */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setGateAction('approve');
                    handleGateSubmit();
                  }}
                  disabled={submittingGate}
                  className="px-4 py-2 text-sm font-semibold text-white bg-success hover:bg-green-600 rounded-lg transition-colors disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  onClick={() => {
                    setGateAction('revise');
                    handleGateSubmit();
                  }}
                  disabled={submittingGate}
                  className="px-4 py-2 text-sm font-semibold text-white bg-warning hover:bg-yellow-600 rounded-lg transition-colors disabled:opacity-50"
                >
                  Revise
                </button>
                <button
                  onClick={() => {
                    setGateAction('cancel');
                    handleGateSubmit();
                  }}
                  disabled={submittingGate}
                  className="px-4 py-2 text-sm font-semibold text-white bg-danger hover:bg-red-600 rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancel Build
                </button>
              </div>
            </div>
          )}

          {/* Error Log */}
          {build.error_log && build.error_log.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-red-200 dark:border-red-800/40 p-4">
              <h2 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-3">
                Error Log
              </h2>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {build.error_log.map((entry, idx) => (
                  <div
                    key={idx}
                    className="bg-red-50 dark:bg-red-900/10 rounded-lg px-3 py-2 border border-red-100 dark:border-red-900/20"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                        {humanStatus(entry.phase)}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(entry.error);
                            setCopiedErrorIdx(idx);
                            setTimeout(() => setCopiedErrorIdx(null), 1500);
                          }}
                          className="text-red-400 hover:text-red-600 dark:text-red-500 dark:hover:text-red-300 transition-colors"
                          title="Copy error"
                        >
                          {copiedErrorIdx === idx ? (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          ) : (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                          )}
                        </button>
                        <span className="text-[10px] text-red-400 dark:text-red-500">
                          {new Date(entry.timestamp).toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-red-700 dark:text-red-300 font-mono break-all">
                      {entry.error}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preflight Warnings */}
          {(build.artifacts as any)?.preflight?.figma_warnings?.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-yellow-200 dark:border-yellow-800/40 p-4">
              <h2 className="text-sm font-semibold text-yellow-700 dark:text-yellow-400 mb-3">
                Figma Pre-Flight Warnings
              </h2>
              <div className="space-y-2">
                {((build.artifacts as any).preflight.figma_warnings as string[]).map((warning: string, idx: number) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="text-yellow-500 shrink-0 mt-0.5">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                    </span>
                    <p className="text-xs text-yellow-700 dark:text-yellow-300">{warning}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Figma Naming Issues */}
          {namingIssues.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-amber-200 dark:border-amber-800/40 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                  Figma Naming Issues
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                  {namingIssues.length}
                </span>
              </div>
              <div className="overflow-x-auto max-h-72 overflow-y-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-navy/5 dark:border-slate-700">
                      <th className="px-2 py-2 text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase w-8">
                        <input
                          type="checkbox"
                          checked={selectedNamingIssues.size === namingIssues.length && namingIssues.length > 0}
                          onChange={toggleAllNamingIssues}
                          className="rounded border-navy/20 dark:border-slate-600 text-electric focus:ring-electric/40"
                        />
                      </th>
                      <th className="px-2 py-2 text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase">
                        Layer Name
                      </th>
                      <th className="px-2 py-2 text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase">
                        Type
                      </th>
                      <th className="px-2 py-2 text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase">
                        Issue
                      </th>
                      <th className="px-2 py-2 text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase">
                        Suggested Fix
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy/5 dark:divide-slate-700">
                    {namingIssues.map((issue) => (
                      <tr key={issue.nodeId} className="hover:bg-navy/[0.02] dark:hover:bg-slate-700/30">
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            checked={selectedNamingIssues.has(issue.nodeId)}
                            onChange={() => toggleNamingIssue(issue.nodeId)}
                            className="rounded border-navy/20 dark:border-slate-600 text-electric focus:ring-electric/40"
                          />
                        </td>
                        <td className="px-2 py-2 text-xs text-navy dark:text-slate-200 font-mono">
                          {issue.nodeName}
                        </td>
                        <td className="px-2 py-2 text-[10px] text-navy/40 dark:text-slate-500 capitalize">
                          {issue.nodeType.toLowerCase().replace(/_/g, ' ')}
                        </td>
                        <td className="px-2 py-2 text-xs text-amber-700 dark:text-amber-400">
                          {issue.issue}
                        </td>
                        <td className="px-2 py-2 text-xs text-navy/60 dark:text-slate-400">
                          {issue.suggested}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Auto-Name with AI */}
              <div className="mt-4 border-t border-navy/5 dark:border-slate-700 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-xs font-semibold text-navy dark:text-slate-200">
                      AI Auto-Namer
                    </h3>
                    <p className="text-[10px] text-navy/40 dark:text-slate-500 mt-0.5">
                      Uses AI vision to suggest proper semantic names for generic layers
                    </p>
                  </div>
                  <button
                    onClick={handleAutoName}
                    disabled={autoNaming}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-electric hover:bg-electric/90 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    {autoNaming ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                        Auto-Name with AI
                      </>
                    )}
                  </button>
                </div>

                {autoNameError && (
                  <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/40">
                    <p className="text-xs text-red-600 dark:text-red-400">{autoNameError}</p>
                  </div>
                )}

                {autoNameResults && autoNameResults.length > 0 && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase">
                        AI Suggestions ({autoNameResults.length} renames)
                      </span>
                      <button
                        onClick={() => {
                          const text = autoNameResults.map(r => `${r.currentName} -> ${r.suggestedName}`).join('\n');
                          navigator.clipboard.writeText(text);
                        }}
                        className="text-[10px] text-electric hover:text-electric-bright font-semibold"
                      >
                        Copy All
                      </button>
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {autoNameResults.map((r) => (
                        <div
                          key={r.nodeId}
                          className="flex items-center gap-2 px-2 py-1.5 rounded bg-electric/5 dark:bg-electric/10 group"
                          title={r.reason}
                        >
                          <span className="text-xs text-navy/40 dark:text-slate-500 font-mono line-through flex-shrink-0 max-w-[120px] truncate">
                            {r.currentName}
                          </span>
                          <svg className="w-3 h-3 text-electric flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                          </svg>
                          <span className="text-xs text-navy dark:text-slate-200 font-mono font-semibold flex-shrink-0 max-w-[160px] truncate">
                            {r.suggestedName}
                          </span>
                          <span className="text-[9px] text-navy/30 dark:text-slate-600 truncate ml-auto hidden group-hover:block">
                            {r.reason}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-navy/30 dark:text-slate-600 mt-2">
                      Use the PageForge Namer Figma plugin to apply these renames automatically.
                    </p>
                  </div>
                )}

                {autoNameResults && autoNameResults.length === 0 && (
                  <div className="mb-3 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/40">
                    <p className="text-xs text-green-600 dark:text-green-400">All layers already have good names!</p>
                  </div>
                )}
              </div>

              <div className="mt-4 space-y-3 border-t border-navy/5 dark:border-slate-700 pt-4">
                <textarea
                  value={designerFeedback}
                  onChange={(e) => setDesignerFeedback(e.target.value)}
                  placeholder="Optional feedback for the designer..."
                  rows={2}
                  className="w-full rounded-lg border border-navy/10 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-navy dark:text-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400/40 resize-none"
                />
                <button
                  onClick={handleSubmitDesignerRequest}
                  disabled={selectedNamingIssues.size === 0 || submittingDesignerRequest}
                  className="px-4 py-2 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {submittingDesignerRequest ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      Generate Designer Fix Request
                      {selectedNamingIssues.size > 0 && (
                        <span className="px-1.5 py-0.5 text-[10px] bg-white/20 rounded">
                          {selectedNamingIssues.size}
                        </span>
                      )}
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Designer Suggestions */}
          {(namingIssues.length > 0 || ((build.artifacts as any)?.preflight?.figma_warnings?.length > 0)) && (
            <PageForgeDesignerSuggestions
              buildId={build.id}
              buildTitle={build.page_title}
              namingIssues={namingIssues}
              figmaWarnings={((build.artifacts as any)?.preflight?.figma_warnings as string[]) || []}
              figmaFileKey={build.figma_file_key || undefined}
            />
          )}

          {/* Designer Fix Request Status */}
          {designerFixRequest && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-semibold text-navy dark:text-slate-200">
                    Designer Fix Request
                  </h2>
                  <span
                    className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                      designerFixRequest.status === 'resolved'
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                    }`}
                  >
                    {designerFixRequest.status === 'resolved' ? 'Resolved' : 'Fix Requested'}
                  </span>
                </div>
                <span className="text-[10px] text-navy/30 dark:text-slate-600">
                  {new Date(designerFixRequest.requested_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <p className="text-xs text-navy/40 dark:text-slate-500 mt-2">
                {designerFixRequest.issues.length} issue{designerFixRequest.issues.length !== 1 ? 's' : ''} reported
                {designerFixRequest.feedback ? ` - "${designerFixRequest.feedback}"` : ''}
              </p>
              {designerFixRequest.status === 'pending' && (
                <button
                  onClick={handleResolveDesignerRequest}
                  disabled={resolvingDesignerRequest}
                  className="mt-3 px-3 py-1.5 text-xs font-semibold text-green-700 dark:text-green-400 border border-green-300 dark:border-green-700 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors disabled:opacity-50"
                >
                  {resolvingDesignerRequest ? 'Resolving...' : 'Mark as Resolved'}
                </button>
              )}
              {designerFixRequest.resolved_at && (
                <p className="text-[10px] text-navy/30 dark:text-slate-600 mt-2">
                  Resolved {new Date(designerFixRequest.resolved_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              )}
            </div>
          )}

          {/* Designer Report Modal */}
          {showDesignerReportModal && (
            <div
              className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
              onClick={() => setShowDesignerReportModal(false)}
            >
              <div
                className="bg-white dark:bg-slate-800 rounded-xl border border-navy/10 dark:border-slate-700 shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-5 py-4 border-b border-navy/5 dark:border-slate-700 shrink-0">
                  <h3 className="text-sm font-semibold text-navy dark:text-slate-200">
                    Designer Fix Request Report
                  </h3>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={copyReportToClipboard}
                      className="px-3 py-1.5 text-xs font-semibold text-electric hover:text-electric-bright border border-electric/30 hover:bg-electric/10 rounded-lg transition-colors"
                    >
                      {copiedReport ? 'Copied!' : 'Copy to Clipboard'}
                    </button>
                    <button
                      onClick={() => setShowDesignerReportModal(false)}
                      className="text-navy/30 dark:text-slate-500 hover:text-navy dark:hover:text-slate-200 transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="px-5 py-4 overflow-y-auto flex-1">
                  <pre className="whitespace-pre-wrap text-xs text-navy/80 dark:text-slate-300 font-mono leading-relaxed">
                    {designerReportMarkdown}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* Agent Calls (if loaded) */}
          {agentCalls.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 p-4">
              <h2 className="text-sm font-semibold text-navy dark:text-slate-200 mb-3">
                Agent Calls ({agentCalls.length})
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-navy/5 dark:border-slate-700">
                      {['Agent', 'Phase', 'Model', 'Tokens', 'Cost', 'Duration', 'Status'].map(
                        (h) => (
                          <th
                            key={h}
                            className="px-3 py-2 text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase"
                          >
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy/5 dark:divide-slate-700">
                    {agentCalls.slice(0, 50).map((call) => (
                      <tr key={call.id}>
                        <td className="px-3 py-2 text-xs text-navy dark:text-slate-200">
                          {call.agent_name}
                        </td>
                        <td className="px-3 py-2 text-xs text-navy/60 dark:text-slate-400">
                          {humanStatus(call.phase)}
                        </td>
                        <td className="px-3 py-2 text-[10px] text-navy/40 dark:text-slate-500 font-mono">
                          {call.model_used ?? '-'}
                        </td>
                        <td className="px-3 py-2 text-xs text-navy/60 dark:text-slate-400">
                          {(call.input_tokens + call.output_tokens).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-xs text-navy/60 dark:text-slate-400">
                          ${call.cost_usd.toFixed(4)}
                        </td>
                        <td className="px-3 py-2 text-xs text-navy/60 dark:text-slate-400">
                          {(call.duration_ms / 1000).toFixed(1)}s
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`text-[10px] font-bold uppercase ${
                              call.status === 'success'
                                ? 'text-success'
                                : call.status === 'failed'
                                  ? 'text-danger'
                                  : 'text-warning'
                            }`}
                          >
                            {call.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
