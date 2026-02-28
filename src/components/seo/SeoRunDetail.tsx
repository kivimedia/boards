'use client';

import { useEffect, useState, useCallback, useRef, DragEvent } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MarkdownToolbarUI } from '@/components/card/MarkdownToolbar';
import type { SeoPipelineRun, SeoAgentCall, SeoPhaseFeedback, SeoReviewAttachment } from '@/lib/types';

// ---------------------------------------------------------------------------
// Phase timeline config
// ---------------------------------------------------------------------------
const PHASES = [
  { key: 'planning', label: 'Planning', icon: '📊' },
  { key: 'awaiting_plan_review', label: 'Plan Review', icon: '📋' },
  { key: 'writing', label: 'Writing', icon: '✍️' },
  { key: 'scoring', label: 'QC', icon: '✅' },
  { key: 'humanizing', label: 'Humanizing', icon: '🧑' },
  { key: 'awaiting_approval_1', label: 'Gate 1', icon: '🚦' },
  { key: 'publishing', label: 'Publishing', icon: '📤' },
  { key: 'visual_qa', label: 'Visual QA', icon: '👁️' },
  { key: 'awaiting_approval_2', label: 'Gate 2', icon: '🚦' },
  { key: 'published', label: 'Published', icon: '🎉' },
];

// ---------------------------------------------------------------------------
// Plan parser - attempts YAML-style key:value, falls back to raw text
// ---------------------------------------------------------------------------
interface ParsedPlan {
  title?: string;
  keywords?: { primary?: string[]; secondary?: string[]; lsi?: string[] };
  outline?: Array<{ h2: string; h3s?: string[] }>;
  silo?: string;
  target_word_count?: number;
  angle?: string;
  internal_links?: string[];
  raw?: string;
}

function parsePlan(text: string): ParsedPlan {
  if (!text) return { raw: '' };

  // Try JSON first
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === 'object') return parsed;
  } catch { /* not JSON */ }

  // Try YAML-style parsing (key: value)
  const plan: ParsedPlan = {};
  const lines = text.split('\n');
  let currentKey = '';
  let outlineItems: Array<{ h2: string; h3s: string[] }> = [];
  let currentH2: { h2: string; h3s: string[] } | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // title: "..."
    const titleMatch = trimmed.match(/^(?:title|working_title|post_title)\s*:\s*["']?(.+?)["']?\s*$/i);
    if (titleMatch) { plan.title = titleMatch[1]; continue; }

    // silo: "..."
    const siloMatch = trimmed.match(/^(?:silo|category|topic_cluster)\s*:\s*["']?(.+?)["']?\s*$/i);
    if (siloMatch) { plan.silo = siloMatch[1]; continue; }

    // target_word_count: 1500
    const wcMatch = trimmed.match(/^(?:target_word_count|word_count|words)\s*:\s*(\d+)/i);
    if (wcMatch) { plan.target_word_count = parseInt(wcMatch[1]); continue; }

    // angle: "..."
    const angleMatch = trimmed.match(/^(?:angle|hook|approach)\s*:\s*["']?(.+?)["']?\s*$/i);
    if (angleMatch) { plan.angle = angleMatch[1]; continue; }

    // Detect section headers
    if (/^(?:keywords?|primary_keywords?|target_keywords?)\s*:/i.test(trimmed)) {
      currentKey = 'keywords';
      if (!plan.keywords) plan.keywords = {};
      // Check inline keywords
      const inlineKw = trimmed.match(/:\s*\[(.+)\]/);
      if (inlineKw) {
        plan.keywords.primary = inlineKw[1].split(',').map(k => k.trim().replace(/['"]/g, ''));
        currentKey = '';
      }
      continue;
    }

    if (/^(?:outline|structure|sections)\s*:/i.test(trimmed)) {
      currentKey = 'outline';
      continue;
    }

    if (/^(?:internal_links?|links)\s*:/i.test(trimmed)) {
      currentKey = 'internal_links';
      plan.internal_links = [];
      continue;
    }

    // Collect items under current key
    if (currentKey === 'keywords' && trimmed.startsWith('-')) {
      const kw = trimmed.replace(/^-\s*/, '').replace(/['"]/g, '');
      if (!plan.keywords) plan.keywords = {};
      if (!plan.keywords.primary) plan.keywords.primary = [];
      plan.keywords.primary.push(kw);
      continue;
    }

    if (currentKey === 'keywords') {
      const subMatch = trimmed.match(/^(?:primary|secondary|lsi)\s*:\s*\[(.+)\]/i);
      if (subMatch) {
        const type = trimmed.match(/^(primary|secondary|lsi)/i)?.[1]?.toLowerCase() as 'primary' | 'secondary' | 'lsi';
        if (type && plan.keywords) {
          plan.keywords[type] = subMatch[1].split(',').map(k => k.trim().replace(/['"]/g, ''));
        }
        continue;
      }
    }

    if (currentKey === 'outline') {
      // H2: "..."  or  - h2: "..."
      const h2Match = trimmed.match(/^(?:-\s*)?(?:h2|##)\s*:\s*["']?(.+?)["']?\s*$/i);
      if (h2Match) {
        if (currentH2) outlineItems.push(currentH2);
        currentH2 = { h2: h2Match[1], h3s: [] };
        continue;
      }
      // H3 items
      const h3Match = trimmed.match(/^(?:\s+-\s*)?(?:h3|###)\s*:\s*["']?(.+?)["']?\s*$/i);
      if (h3Match && currentH2) {
        currentH2.h3s.push(h3Match[1]);
        continue;
      }
      // Simple list items under outline
      if (trimmed.startsWith('-') && !trimmed.match(/^-\s*h[23]/i)) {
        const text = trimmed.replace(/^-\s*/, '').replace(/['"]/g, '');
        if (currentH2) {
          currentH2.h3s.push(text);
        } else {
          currentH2 = { h2: text, h3s: [] };
        }
        continue;
      }
    }

    if (currentKey === 'internal_links' && trimmed.startsWith('-')) {
      plan.internal_links?.push(trimmed.replace(/^-\s*/, '').replace(/['"]/g, ''));
      continue;
    }

    // If we hit a new key: section, reset currentKey
    if (/^\w+\s*:/.test(trimmed) && currentKey) {
      if (currentH2) { outlineItems.push(currentH2); currentH2 = null; }
      currentKey = '';
    }
  }

  if (currentH2) outlineItems.push(currentH2);
  if (outlineItems.length > 0) plan.outline = outlineItems;

  // If we parsed nothing meaningful, store as raw
  if (!plan.title && !plan.outline && !plan.keywords) {
    plan.raw = text;
  }

  return plan;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
interface Props {
  runId: string;
}

export default function SeoRunDetail({ runId }: Props) {
  const [run, setRun] = useState<SeoPipelineRun | null>(null);
  const [agentCalls, setAgentCalls] = useState<SeoAgentCall[]>([]);
  const [feedbackHistory, setFeedbackHistory] = useState<SeoPhaseFeedback[]>([]);
  const [loading, setLoading] = useState(true);

  // Review panel state
  const [feedbackText, setFeedbackText] = useState('');
  const [uploadedAttachments, setUploadedAttachments] = useState<SeoReviewAttachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const feedbackRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Collapsible sections
  const [showAgentCalls, setShowAgentCalls] = useState(false);
  const [showRawPlan, setShowRawPlan] = useState(false);

  const fetchRun = useCallback(async () => {
    try {
      const [runRes, feedbackRes] = await Promise.all([
        fetch(`/api/seo/runs/${runId}`),
        fetch(`/api/seo/runs/${runId}/feedback`),
      ]);
      if (runRes.ok) {
        const data = await runRes.json();
        setRun(data.data?.run || null);
        setAgentCalls(data.data?.agent_calls || []);
      }
      if (feedbackRes.ok) {
        const fbData = await feedbackRes.json();
        setFeedbackHistory(fbData.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch run:', err);
    }
    setLoading(false);
  }, [runId]);

  useEffect(() => {
    fetchRun();
    const interval = setInterval(fetchRun, 10000);
    return () => clearInterval(interval);
  }, [fetchRun]);

  // --- File upload handlers ---
  const uploadFile = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      alert('Image must be under 10MB');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
      alert('Only JPEG, PNG, GIF, and WebP images are allowed');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/seo/runs/${runId}/feedback/upload`, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const { data } = await res.json();
        setUploadedAttachments(prev => [...prev, data]);
      } else {
        const err = await res.json();
        alert(err.error || 'Upload failed');
      }
    } catch {
      alert('Upload failed');
    }
    setUploading(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    files.forEach(f => uploadFile(f));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(f => uploadFile(f));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (id: string) => {
    setUploadedAttachments(prev => prev.filter(a => a.id !== id));
  };

  // --- Feedback submission ---
  const handleDecision = async (phase: string, decision: 'approve' | 'revise' | 'scrap') => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/seo/runs/${runId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phase,
          decision,
          feedback_text: feedbackText.trim() || undefined,
          attachment_ids: uploadedAttachments.map(a => a.id),
        }),
      });
      if (res.ok) {
        setFeedbackText('');
        setUploadedAttachments([]);
        fetchRun();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to submit feedback');
      }
    } catch {
      alert('Failed to submit feedback');
    }
    setSubmitting(false);
  };

  // --- Loading / error states ---
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <svg className="animate-spin h-6 w-6 text-electric" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="p-6 text-center">
        <p className="text-navy/40 dark:text-slate-500 font-body">Run not found</p>
        <Link href="/seo" className="text-sm text-electric hover:underline mt-2 inline-block font-body">Back to dashboard</Link>
      </div>
    );
  }

  const currentPhaseIndex = PHASES.findIndex(p => p.key === run.status);
  const isAwaitingPlanReview = run.status === 'awaiting_plan_review';
  const isAwaitingGate1 = run.status === 'awaiting_approval_1';
  const isAwaitingGate2 = run.status === 'awaiting_approval_2';
  const planText = run.phase_results?.planning ? String(run.phase_results.planning) : '';
  const parsedPlan = parsePlan(planText);
  const hasPlan = !!planText;

  // Determine which gate phase is active for the review panel
  const activeReviewPhase = isAwaitingPlanReview
    ? 'plan_review'
    : isAwaitingGate1
      ? 'gate1'
      : isAwaitingGate2
        ? 'gate2'
        : null;

  const activeReviewLabel = isAwaitingPlanReview
    ? 'Content Plan Review'
    : isAwaitingGate1
      ? 'Content Quality Review'
      : isAwaitingGate2
        ? 'Published Post Review'
        : '';

  const activeReviewDescription = isAwaitingPlanReview
    ? 'Review the content plan before writing begins. Approve, give feedback, or request changes.'
    : isAwaitingGate1
      ? 'Review the final content quality, scores, and humanization before publishing.'
      : isAwaitingGate2
        ? 'Review the published WordPress post before finalizing.'
        : '';

  const planReviewFeedback = feedbackHistory.filter(f => f.phase === 'plan_review');

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4 md:space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* Header */}
      {/* ------------------------------------------------------------------ */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Link href="/seo" className="text-navy/40 dark:text-slate-500 hover:text-electric transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </Link>
          <h1 className="text-lg md:text-xl font-bold text-navy dark:text-white font-heading">{run.topic || 'Untitled Run'}</h1>
        </div>
        <div className="flex items-center gap-3 md:gap-4 text-xs md:text-sm text-navy/50 dark:text-slate-400 font-body flex-wrap">
          {run.silo && <span className="bg-electric/10 text-electric px-2 py-0.5 rounded-full text-xs font-medium">{run.silo}</span>}
          {run.team_config?.site_name && (
            <span className="bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-300 px-2 py-0.5 rounded-full text-xs font-medium">{run.team_config.site_name}</span>
          )}
          <span>{new Date(run.created_at).toLocaleString()}</span>
          {run.total_cost_usd > 0 && <span>${run.total_cost_usd.toFixed(4)}</span>}
          {run.plan_review_round > 0 && (
            <span className="bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full text-xs font-medium">
              Round {run.plan_review_round + 1}
            </span>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Phase Timeline */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-white dark:bg-dark-card rounded-xl p-4 border border-cream-dark dark:border-slate-700">
        <h2 className="text-sm font-semibold text-navy/60 dark:text-slate-300 mb-3 font-heading">Pipeline Progress</h2>
        <div className="flex items-center gap-1 overflow-x-auto pb-2 -mb-2">
          {PHASES.map((phase, i) => {
            const isActive = phase.key === run.status;
            const isComplete = i < currentPhaseIndex;
            const isFailed = run.status === 'failed';
            return (
              <div key={phase.key} className="flex-1 min-w-[3rem] flex flex-col items-center">
                <div className={`w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center text-xs md:text-sm transition-all ${
                  isActive
                    ? 'bg-electric text-white ring-2 ring-electric/30 scale-110'
                    : isComplete
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-600'
                      : isFailed
                        ? 'bg-red-100 dark:bg-red-900/30 text-red-500'
                        : 'bg-cream dark:bg-dark-surface text-navy/30 dark:text-slate-600'
                }`}>
                  {isComplete ? '✓' : phase.icon}
                </div>
                <span className={`text-[10px] mt-1 text-center font-body leading-tight ${
                  isActive ? 'text-electric font-semibold' : 'text-navy/30 dark:text-slate-600'
                }`}>
                  {phase.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Content Plan Card */}
      {/* ------------------------------------------------------------------ */}
      {hasPlan && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-cream-dark dark:border-slate-700 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-navy dark:text-white font-heading flex items-center gap-2">
              <span className="text-lg">📋</span> Content Plan
              {run.plan_review_round > 0 && (
                <span className="text-xs font-normal text-navy/40 dark:text-slate-500">(Revision {run.plan_review_round})</span>
              )}
            </h2>
            <button
              onClick={() => setShowRawPlan(!showRawPlan)}
              className="text-xs text-navy/40 dark:text-slate-500 hover:text-electric transition-colors font-body"
            >
              {showRawPlan ? 'Structured View' : 'Raw Output'}
            </button>
          </div>

          {showRawPlan ? (
            <div className="p-5">
              <pre className="whitespace-pre-wrap text-sm text-navy dark:text-slate-200 bg-cream dark:bg-dark-surface p-4 rounded-lg overflow-auto max-h-96 font-body">
                {planText}
              </pre>
            </div>
          ) : parsedPlan.raw && !parsedPlan.title && !parsedPlan.outline ? (
            /* Fallback: render as markdown if we couldn't parse structured data */
            <div className="p-5 prose prose-sm dark:prose-invert max-w-none font-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{planText}</ReactMarkdown>
            </div>
          ) : (
            <div className="p-5 space-y-4">
              {/* Title */}
              {parsedPlan.title && (
                <div>
                  <p className="text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wide font-heading mb-1">Title</p>
                  <p className="text-base font-semibold text-navy dark:text-white font-heading">{parsedPlan.title}</p>
                </div>
              )}

              {/* Keywords */}
              {parsedPlan.keywords && (
                <div>
                  <p className="text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wide font-heading mb-2">Keywords</p>
                  <div className="flex flex-wrap gap-1.5">
                    {parsedPlan.keywords.primary?.map((kw, i) => (
                      <span key={`p-${i}`} className="px-2.5 py-1 rounded-full text-xs font-medium bg-electric/10 text-electric border border-electric/20">
                        {kw}
                      </span>
                    ))}
                    {parsedPlan.keywords.secondary?.map((kw, i) => (
                      <span key={`s-${i}`} className="px-2.5 py-1 rounded-full text-xs font-medium bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800">
                        {kw}
                      </span>
                    ))}
                    {parsedPlan.keywords.lsi?.map((kw, i) => (
                      <span key={`l-${i}`} className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 border border-gray-200 dark:border-slate-600">
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Meta row: silo, word count, angle */}
              <div className="flex flex-wrap gap-4">
                {parsedPlan.silo && (
                  <div>
                    <p className="text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wide font-heading mb-1">Silo</p>
                    <p className="text-sm text-navy dark:text-slate-200 font-body">{parsedPlan.silo}</p>
                  </div>
                )}
                {parsedPlan.target_word_count && (
                  <div>
                    <p className="text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wide font-heading mb-1">Target</p>
                    <p className="text-sm text-navy dark:text-slate-200 font-body">{parsedPlan.target_word_count.toLocaleString()} words</p>
                  </div>
                )}
                {parsedPlan.angle && (
                  <div className="flex-1 min-w-[200px]">
                    <p className="text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wide font-heading mb-1">Angle</p>
                    <p className="text-sm text-navy dark:text-slate-200 font-body">{parsedPlan.angle}</p>
                  </div>
                )}
              </div>

              {/* Outline */}
              {parsedPlan.outline && parsedPlan.outline.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wide font-heading mb-2">Outline</p>
                  <div className="bg-cream dark:bg-dark-surface rounded-lg p-4 space-y-2">
                    {parsedPlan.outline.map((section, i) => (
                      <div key={i}>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-electric bg-electric/10 px-1.5 py-0.5 rounded">H2</span>
                          <span className="text-sm font-semibold text-navy dark:text-white font-heading">{section.h2}</span>
                        </div>
                        {section.h3s && section.h3s.length > 0 && (
                          <div className="ml-8 mt-1 space-y-1">
                            {section.h3s.map((h3, j) => (
                              <div key={j} className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-cyan-600 bg-cyan-50 dark:bg-cyan-900/20 px-1.5 py-0.5 rounded">H3</span>
                                <span className="text-sm text-navy/70 dark:text-slate-300 font-body">{h3}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Internal links */}
              {parsedPlan.internal_links && parsedPlan.internal_links.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wide font-heading mb-2">Internal Links</p>
                  <div className="flex flex-wrap gap-1.5">
                    {parsedPlan.internal_links.map((link, i) => (
                      <span key={i} className="px-2 py-1 rounded text-xs font-mono bg-cream dark:bg-dark-surface text-navy/60 dark:text-slate-400 border border-cream-dark dark:border-slate-600">
                        {link}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Review Panel (plan review, gate1, gate2) */}
      {/* ------------------------------------------------------------------ */}
      {activeReviewPhase && (
        <div className={`rounded-xl border overflow-hidden ${
          isAwaitingPlanReview
            ? 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800'
            : isAwaitingGate1
              ? 'bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800'
              : 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
        }`}>
          <div className="px-5 py-4">
            <h2 className={`text-base font-bold mb-1 font-heading ${
              isAwaitingPlanReview ? 'text-blue-800 dark:text-blue-300' :
              isAwaitingGate1 ? 'text-yellow-800 dark:text-yellow-300' :
              'text-green-800 dark:text-green-300'
            }`}>
              {activeReviewLabel}
            </h2>
            <p className={`text-sm mb-4 font-body ${
              isAwaitingPlanReview ? 'text-blue-700 dark:text-blue-400' :
              isAwaitingGate1 ? 'text-yellow-700 dark:text-yellow-400' :
              'text-green-700 dark:text-green-400'
            }`}>
              {activeReviewDescription}
            </p>

            {/* Feedback textarea with toolbar */}
            <div className="bg-white dark:bg-dark-card rounded-lg border border-cream-dark dark:border-slate-600 overflow-hidden mb-3">
              <MarkdownToolbarUI
                textareaRef={feedbackRef as React.RefObject<HTMLTextAreaElement>}
                value={feedbackText}
                onChange={setFeedbackText}
              />
              <textarea
                ref={feedbackRef}
                value={feedbackText}
                onChange={e => setFeedbackText(e.target.value)}
                placeholder="Add specific feedback - what to fix, keywords to emphasize, angles to add, structure changes..."
                rows={4}
                className="w-full px-4 py-3 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 bg-transparent border-0 focus:ring-0 focus:outline-none resize-y font-body"
              />
            </div>

            {/* Image attachment area */}
            <div
              className={`rounded-lg border-2 border-dashed p-4 mb-4 transition-colors ${
                isDragOver
                  ? 'border-electric bg-electric/5'
                  : 'border-cream-dark dark:border-slate-600 bg-white/50 dark:bg-dark-surface/50'
              }`}
              onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
            >
              {uploadedAttachments.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-navy/60 dark:text-slate-400 font-heading">
                      Reference Images ({uploadedAttachments.length})
                    </p>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="text-xs text-electric hover:text-electric/80 font-medium font-body"
                    >
                      + Add more
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {uploadedAttachments.map(att => (
                      <div key={att.id} className="relative group">
                        <img
                          src={att.url || ''}
                          alt={att.file_name}
                          className="w-20 h-20 rounded-lg object-cover border border-cream-dark dark:border-slate-600"
                        />
                        <button
                          onClick={() => removeAttachment(att.id)}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          x
                        </button>
                        <p className="text-[10px] text-navy/40 dark:text-slate-500 mt-0.5 max-w-[80px] truncate font-body">{att.file_name}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-2">
                  <p className="text-xs text-navy/40 dark:text-slate-500 font-body mb-2">
                    {uploading ? 'Uploading...' : 'Drag & drop reference images here, or'}
                  </p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="text-xs text-electric hover:text-electric/80 font-medium font-body"
                  >
                    Browse files
                  </button>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={() => handleDecision(activeReviewPhase, 'approve')}
                disabled={submitting}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 font-body shadow-sm"
              >
                {submitting ? 'Submitting...' : 'Approve & Continue'}
              </button>
              <button
                onClick={() => handleDecision(activeReviewPhase, 'revise')}
                disabled={submitting || (!feedbackText.trim() && uploadedAttachments.length === 0)}
                className="px-5 py-2.5 text-sm font-semibold text-amber-700 bg-amber-100 rounded-lg hover:bg-amber-200 transition-colors disabled:opacity-50 font-body shadow-sm"
              >
                Revise with Feedback
              </button>
              <button
                onClick={() => {
                  if (confirm('Are you sure you want to scrap this run? This cannot be undone.')) {
                    handleDecision(activeReviewPhase, 'scrap');
                  }
                }}
                disabled={submitting}
                className="px-5 py-2.5 text-sm font-semibold text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50 font-body shadow-sm"
              >
                Scrap
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Feedback History */}
      {/* ------------------------------------------------------------------ */}
      {planReviewFeedback.length > 0 && (
        <div className="bg-white dark:bg-dark-card rounded-xl p-5 border border-cream-dark dark:border-slate-700">
          <h2 className="text-sm font-semibold text-navy/60 dark:text-slate-300 mb-3 font-heading">
            Review History ({planReviewFeedback.length} round{planReviewFeedback.length > 1 ? 's' : ''})
          </h2>
          <div className="space-y-3">
            {planReviewFeedback.map(fb => (
              <div key={fb.id} className="border border-cream-dark dark:border-slate-700 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold text-navy/40 dark:text-slate-500 font-body">Round {fb.round}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    fb.decision === 'approve'
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                      : fb.decision === 'revise'
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                  }`}>
                    {fb.decision}
                  </span>
                  <span className="text-xs text-navy/30 dark:text-slate-600 font-body ml-auto">
                    {new Date(fb.created_at).toLocaleString()}
                  </span>
                </div>
                {fb.feedback_text && (
                  <div className="prose prose-sm dark:prose-invert max-w-none font-body text-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{fb.feedback_text}</ReactMarkdown>
                  </div>
                )}
                {fb.attachments && fb.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {fb.attachments.map(att => (
                      <a key={att.id} href={att.url || '#'} target="_blank" rel="noopener noreferrer">
                        <img
                          src={att.url || ''}
                          alt={att.file_name}
                          className="w-16 h-16 rounded-lg object-cover border border-cream-dark dark:border-slate-600 hover:ring-2 hover:ring-electric transition-all"
                        />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Scores */}
      {/* ------------------------------------------------------------------ */}
      {(run.qc_score != null || run.value_score != null || run.visual_qa_score != null) && (
        <div className="grid grid-cols-3 gap-2 md:gap-4">
          {[
            { label: 'QC Score', value: run.qc_score, color: 'text-green-600' },
            { label: 'Value Score', value: run.value_score, color: 'text-cyan-600' },
            { label: 'Visual QA', value: run.visual_qa_score, color: 'text-purple-600' },
          ].map(score => (
            <div key={score.label} className="bg-white dark:bg-dark-card rounded-xl p-4 border border-cream-dark dark:border-slate-700 text-center">
              <p className="text-xs text-navy/50 dark:text-slate-400 font-body">{score.label}</p>
              <p className={`text-2xl md:text-3xl font-bold mt-1 font-heading ${score.value != null ? score.color : 'text-navy/20'}`}>
                {score.value != null ? score.value : '-'}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Content Preview */}
      {/* ------------------------------------------------------------------ */}
      {(run.humanized_content || run.final_content) && (
        <div className="bg-white dark:bg-dark-card rounded-xl p-5 border border-cream-dark dark:border-slate-700">
          <h2 className="text-sm font-semibold text-navy/60 dark:text-slate-300 mb-3 font-heading">Content Preview</h2>
          <div className="prose prose-sm dark:prose-invert max-w-none font-body bg-cream dark:bg-dark-surface p-4 rounded-lg overflow-auto max-h-96">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {run.humanized_content || run.final_content || ''}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* WordPress Links */}
      {/* ------------------------------------------------------------------ */}
      {run.wp_preview_url && (
        <div className="bg-white dark:bg-dark-card rounded-xl p-4 border border-cream-dark dark:border-slate-700 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-navy dark:text-white font-heading">WordPress Post</p>
            <p className="text-xs text-navy/50 dark:text-slate-400 font-body">Post ID: {run.wp_post_id}</p>
          </div>
          <div className="flex gap-2">
            {run.wp_preview_url && (
              <a href={run.wp_preview_url} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 text-xs font-medium text-electric bg-electric/10 rounded-lg hover:bg-electric/20 transition-colors font-body">
                Preview
              </a>
            )}
            {run.wp_live_url && (
              <a href={run.wp_live_url} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 text-xs font-medium text-green-600 bg-green-50 rounded-lg hover:bg-green-100 transition-colors font-body">
                Live Post
              </a>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Agent Calls Log (collapsible) */}
      {/* ------------------------------------------------------------------ */}
      {agentCalls.length > 0 && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700">
          <button
            onClick={() => setShowAgentCalls(!showAgentCalls)}
            className="w-full px-5 py-3 flex items-center justify-between text-sm font-semibold text-navy/60 dark:text-slate-300 font-heading hover:text-navy dark:hover:text-white transition-colors"
          >
            <span>Agent Calls ({agentCalls.length})</span>
            <svg className={`w-4 h-4 transition-transform ${showAgentCalls ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showAgentCalls && (
            <div className="px-5 pb-4 space-y-2">
              {agentCalls.map(call => (
                <div key={call.id} className="flex items-center justify-between gap-2 p-3 bg-cream dark:bg-dark-surface rounded-lg">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-navy dark:text-white font-heading truncate">{call.agent_name}</p>
                    <p className="text-xs text-navy/40 dark:text-slate-500 font-body truncate">
                      Phase: {call.phase} - Iter {call.iteration} - {call.model_used || 'unknown'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-navy/50 dark:text-slate-400 font-body">
                      {call.input_tokens + call.output_tokens} tok
                    </p>
                    <p className="text-xs text-navy/40 dark:text-slate-500 font-body">
                      ${call.cost_usd.toFixed(4)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
