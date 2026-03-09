'use client';

import { useEffect, useState, useCallback, useRef, DragEvent, isValidElement, cloneElement, type ReactNode } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MarkdownToolbarUI } from '@/components/card/MarkdownToolbar';
import type { SeoPipelineRun, SeoAgentCall, SeoPhaseFeedback, SeoReviewAttachment } from '@/lib/types';
import SeoChat from './SeoChat';

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

interface ParsedScheduleItem {
  monthLabel: string;
  weekLabel: string;
  postNumber: number | null;
  dayLabel: string | null;
  siloLabel: string | null;
  topic: string;
}

interface ParsedSiloAssessmentItem {
  siloLabel: string;
  assessment: string;
}

function parsePlan(text: string): ParsedPlan {
  if (!text) return { raw: '' };

  // Strip code fences before parsing
  let cleaned = text
    .replace(/^```[\w]*\n?/gm, '')
    .replace(/^---\s*$/gm, '')
    .trim();

  // Try JSON first
  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed === 'object') return parsed;
  } catch { /* not JSON */ }

  // Try to extract JSON block from within the text
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (typeof parsed === 'object') return parsed;
    } catch { /* not valid JSON */ }
  }

  // Try YAML-style parsing (key: value)
  const plan: ParsedPlan = {};
  const lines = cleaned.split('\n');
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
// Clean draft content — strip HTML comments, SEO directives, and code artifacts
// ---------------------------------------------------------------------------
function cleanDraftContent(text: string): string {
  if (!text) return '';
  return text
    // Remove markdown code fences (```markdown, ```html, ``` etc.)
    .replace(/^```[\w]*\n?/gm, '')
    // Remove HTML comments (<!-- ... -->) including multiline
    .replace(/<!--[\s\S]*?-->/g, '')
    // Remove {/* ... */} JSX-style comments
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    // Remove frontmatter lines (slug:, meta_description:, etc.)
    .replace(/^(?:slug|meta_description|meta_title|canonical_url|featured_image|category|tags|author|date|status):\s*.*$/gm, '')
    // Remove lines that are only whitespace after stripping
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const SUGGESTION_REGEX = /(\[IMAGE:\s*[^\]]+\])/gi;
const SUGGESTION_COLOR = '#dc2626';
const LINK_COLOR = '#78ac37';

function highlightSuggestionTokens(node: ReactNode, keyPrefix = 'suggestion'): ReactNode {
  if (typeof node === 'string') {
    const parts = node.split(SUGGESTION_REGEX);
    if (parts.length === 1) return node;
    return parts.map((part, index) => {
      if (/^\[IMAGE:\s*[^\]]+\]$/i.test(part)) {
        return (
          <span key={`${keyPrefix}-${index}`} style={{ color: SUGGESTION_COLOR, fontWeight: 600 }}>
            {part}
          </span>
        );
      }
      return part;
    });
  }

  if (Array.isArray(node)) {
    return node.map((child, index) => highlightSuggestionTokens(child, `${keyPrefix}-${index}`));
  }

  if (isValidElement(node) && node.props && 'children' in node.props) {
    return cloneElement(node, {
      ...node.props,
      children: highlightSuggestionTokens((node.props as { children?: ReactNode }).children, keyPrefix),
    });
  }

  return node;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
interface Props {
  runId: string;
}

interface SiblingOverviewItem {
  id: string;
  run_id: string | null;
  topic: string;
  silo: string | null;
  keywords: string[];
  target_word_count: number;
  scheduled_date: string;
  calendar_id: string;
  calendar_name: string | null;
  calendar_item_status: string;
  pipeline_status: string | null;
}

interface SiblingOverviewData {
  calendar: { id: string; name: string | null } | null;
  current_item_id: string | null;
  current_scheduled_date: string | null;
  items: SiblingOverviewItem[];
}

function getWeekOfMonthLabel(dateString: string): string {
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'W?';
  const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  const adjustedDate = date.getDate() + firstDayOfMonth.getDay();
  const week = Math.ceil(adjustedDate / 7);
  return `W${week}`;
}

function formatPipelineStatus(status: string | null): string {
  if (!status) return 'Not Launched';
  return status
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function parseMonthlySchedule(text: string): ParsedScheduleItem[] {
  if (!text) return [];

  const cleaned = text
    .replace(/^```[\w]*\n?/gm, '')
    .replace(/```/g, '')
    .trim();

  const lines = cleaned.split('\n');
  const items: ParsedScheduleItem[] = [];
  let currentMonth = '';
  let currentWeek = '';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const monthMatch = line.match(/^(?:#{1,6}\s*)?(?:\*\*)?\s*Month\s+(\d+)\s*:\s*(.+?)(?:\*\*)?\s*$/i);
    if (monthMatch) {
      currentMonth = `Month ${monthMatch[1]}: ${monthMatch[2].trim()}`;
      continue;
    }

    const weekMatch = line.match(/^(?:#{1,6}\s*)?(?:\*\*)?\s*Week\s+(\d+)\s*:?(?:\*\*)?\s*$/i);
    if (weekMatch) {
      currentWeek = `Week ${weekMatch[1]}`;
      continue;
    }

    const postMatch = line.match(/^-+\s*Post\s*(\d+)\s*(?:\(([^)]+)\))?\s*:\s*Silo\s*([^-]+?)\s*-\s*["“]?(.+?)["”]?(?:\s*[✓✔].*)?$/i);
    if (postMatch) {
      items.push({
        monthLabel: currentMonth || 'Month',
        weekLabel: currentWeek || 'Week',
        postNumber: Number.parseInt(postMatch[1], 10),
        dayLabel: postMatch[2]?.trim() || null,
        siloLabel: `Silo ${postMatch[3].trim()}`,
        topic: postMatch[4].trim(),
      });
    }
  }

  return items;
}

function parseSiloAssessments(text: string): ParsedSiloAssessmentItem[] {
  if (!text) return [];
  const results: ParsedSiloAssessmentItem[] = [];
  const matches = text.matchAll(/\*\*(Silo\s*\d+:[^*]+)\*\*\s*-\s*(.+)/gi);
  for (const match of matches) {
    results.push({
      siloLabel: match[1].trim(),
      assessment: match[2].trim(),
    });
  }
  return results;
}

function parseStrategicRecommendation(text: string): { summary: string | null; bullets: string[] } {
  const section = text.match(/##\s*Strategic Recommendation([\s\S]*?)(?:##\s*Next Post Assignment|$)/i);
  if (!section) return { summary: null, bullets: [] };

  const lines = section[1]
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  let summary: string | null = null;
  const bullets: string[] = [];

  for (const line of lines) {
    if (line.startsWith('- ')) {
      bullets.push(line.replace(/^-+\s*/, '').trim());
    } else if (!summary && !line.startsWith('#')) {
      summary = line.replace(/\*\*/g, '').trim();
    }
  }

  return { summary, bullets };
}

function parseNextPostAssignment(text: string): Array<{ key: string; value: string }> {
  const yamlBlock = text.match(/##\s*Next Post Assignment[\s\S]*?```ya?ml([\s\S]*?)```/i);
  if (!yamlBlock) return [];

  const lines = yamlBlock[1].split('\n');
  const parsed = new Map<string, string>();
  let currentKey: string | null = null;
  let currentList: string[] = [];

  const flushList = () => {
    if (currentKey && currentList.length > 0) {
      parsed.set(currentKey, currentList.join(', '));
      currentList = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, '  ');
    if (!line.trim() || line.trim() === 'post_assignment:') continue;

    const keyMatch = line.match(/^\s{2}([a-zA-Z0-9_]+):\s*(.*)$/);
    if (keyMatch) {
      flushList();
      currentKey = keyMatch[1].trim();
      const rawValue = keyMatch[2].trim();

      if (!rawValue) {
        parsed.set(currentKey, '');
        continue;
      }

      const inlineArray = rawValue.match(/^\[(.*)\]$/);
      if (inlineArray) {
        const items = inlineArray[1]
          .split(',')
          .map(part => part.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
        parsed.set(currentKey, items.join(', '));
      } else {
        parsed.set(currentKey, rawValue.replace(/^["']|["']$/g, ''));
      }
      continue;
    }

    const listItemMatch = line.match(/^\s{4}-\s*(.+)$/);
    if (listItemMatch && currentKey) {
      const cleaned = listItemMatch[1].trim().replace(/^["']|["']$/g, '');
      currentList.push(cleaned);
      continue;
    }
  }

  flushList();

  return Array.from(parsed.entries())
    .filter(([, value]) => value !== '')
    .map(([key, value]) => ({
      key: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      value,
    }));
}

function getScheduleItemKey(item: ParsedScheduleItem): string {
  const post = item.postNumber != null ? String(item.postNumber) : 'none';
  return `${item.monthLabel}|${item.weekLabel}|${post}|${item.topic}`;
}

export default function SeoRunDetail({ runId }: Props) {
  const [run, setRun] = useState<SeoPipelineRun | null>(null);
  const [agentCalls, setAgentCalls] = useState<SeoAgentCall[]>([]);
  const [feedbackHistory, setFeedbackHistory] = useState<SeoPhaseFeedback[]>([]);
  const [siblingOverview, setSiblingOverview] = useState<SiblingOverviewData | null>(null);
  const [siblingLoading, setSiblingLoading] = useState(false);
  const [siblingError, setSiblingError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Review panel state
  const [feedbackText, setFeedbackText] = useState('');
  const [uploadedAttachments, setUploadedAttachments] = useState<SeoReviewAttachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [bulkApproving, setBulkApproving] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const feedbackRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Collapsible sections
  const [showAgentCalls, setShowAgentCalls] = useState(false);
  const [showRawPlan, setShowRawPlan] = useState(false);
  const [topicDecisions, setTopicDecisions] = useState<Record<string, 'approved' | 'rejected'>>({});

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
        setFetchError(null);
      } else {
        const errData = await runRes.json().catch(() => ({}));
        const msg = errData?.error || `Error ${runRes.status}`;
        console.error('[SeoRunDetail] Fetch failed:', runRes.status, msg);
        setFetchError(msg);
      }
      if (feedbackRes.ok) {
        const fbData = await feedbackRes.json();
        setFeedbackHistory(fbData.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch run:', err);
      setFetchError(err instanceof Error ? err.message : 'Network error');
    }
    setLoading(false);
  }, [runId]);

  const fetchSiblings = useCallback(async () => {
    setSiblingLoading(true);
    try {
      const siblingsRes = await fetch(`/api/seo/runs/${runId}/siblings`);
      if (!siblingsRes.ok) {
        const errData = await siblingsRes.json().catch(() => ({}));
        const msg = errData?.error || `Error ${siblingsRes.status}`;
        setSiblingError(msg);
        setSiblingOverview(null);
      } else {
        const data = await siblingsRes.json();
        setSiblingOverview(data.data || null);
        setSiblingError(null);
      }
    } catch (err) {
      setSiblingError(err instanceof Error ? err.message : 'Network error');
      setSiblingOverview(null);
    }
    setSiblingLoading(false);
  }, [runId]);

  useEffect(() => {
    fetchRun();
    const interval = setInterval(fetchRun, 10000);
    return () => clearInterval(interval);
  }, [fetchRun]);

  useEffect(() => {
    if (run?.status === 'awaiting_plan_review') {
      fetchSiblings();
    } else {
      setSiblingOverview(null);
      setSiblingError(null);
    }
  }, [run?.id, run?.status, fetchSiblings]);

  useEffect(() => {
    setTopicDecisions({});
  }, [runId, run?.phase_results?.planning]);

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
    const scheduleItems = parseMonthlySchedule(run?.phase_results?.planning ? String(run.phase_results.planning) : '');
    const rejectedScheduleItems = scheduleItems.filter(item => topicDecisions[getScheduleItemKey(item)] === 'rejected');
    const approvedScheduleItems = scheduleItems.filter(item => topicDecisions[getScheduleItemKey(item)] === 'approved');

    if (phase === 'gate1' && decision === 'approve' && rejectedScheduleItems.length > 0) {
      alert('You have rejected topics in the plan table. Use "Revise with Feedback" or change those topics to Approve before continuing.');
      return;
    }

    let composedFeedback = feedbackText.trim();
    if ((phase === 'gate1' || phase === 'plan_review') && scheduleItems.length > 0 && (approvedScheduleItems.length > 0 || rejectedScheduleItems.length > 0)) {
      const lines: string[] = [
        'Topic-level review decisions:',
        `Approved: ${approvedScheduleItems.length}`,
        `Rejected: ${rejectedScheduleItems.length}`,
      ];

      if (rejectedScheduleItems.length > 0) {
        lines.push('');
        lines.push('Rejected topics:');
        for (const item of rejectedScheduleItems) {
          const postLabel = item.postNumber != null ? `Post ${item.postNumber}` : 'Post';
          lines.push(`- ${item.weekLabel}, ${postLabel}: ${item.topic}`);
        }
      }

      const topicDecisionBlock = lines.join('\n');
      composedFeedback = composedFeedback ? `${composedFeedback}\n\n${topicDecisionBlock}` : topicDecisionBlock;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/seo/runs/${runId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phase,
          decision,
          feedback_text: composedFeedback || undefined,
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

  const handleApproveAllPlans = async () => {
    const runIdsToApprove = (siblingOverview?.items || [])
      .filter(item => item.run_id && item.pipeline_status === 'awaiting_plan_review')
      .map(item => item.run_id as string);

    if (runIdsToApprove.length === 0) {
      alert('No sibling plans are currently awaiting review.');
      return;
    }

    if (!confirm(`Approve ${runIdsToApprove.length} plan(s) and continue all of them to writing?`)) {
      return;
    }

    setBulkApproving(true);
    const failedRunIds: string[] = [];

    for (const siblingRunId of runIdsToApprove) {
      try {
        const response = await fetch(`/api/seo/runs/${siblingRunId}/feedback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phase: 'plan_review',
            decision: 'approve',
          }),
        });
        if (!response.ok) failedRunIds.push(siblingRunId);
      } catch {
        failedRunIds.push(siblingRunId);
      }
    }

    if (failedRunIds.length > 0) {
      alert(`Approved ${runIdsToApprove.length - failedRunIds.length}/${runIdsToApprove.length}. Some runs failed.`);
    }

    await Promise.all([fetchRun(), fetchSiblings()]);
    setBulkApproving(false);
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
        <p className="text-navy/40 dark:text-slate-500 font-body">
          {fetchError === 'Unauthorized' ? 'Session expired - please refresh the page' : fetchError || 'Run not found'}
        </p>
        {fetchError === 'Unauthorized' && (
          <button onClick={() => window.location.reload()} className="text-sm bg-electric text-white px-3 py-1 rounded mt-2 font-body">
            Refresh
          </button>
        )}
        <Link href="/seo" className="text-sm text-electric hover:underline mt-2 inline-block font-body ml-3">Back to dashboard</Link>
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
  const hasMonthlyScheduleText = /(?:^|\n)\s*(?:#{1,6}\s*)?(?:\*\*)?\s*(?:month|week)\s+\d+/im.test(planText);
  const monthlyScheduleItems = parseMonthlySchedule(planText);
  const siloAssessmentItems = parseSiloAssessments(planText);
  const strategicRecommendation = parseStrategicRecommendation(planText);
  const nextPostAssignmentRows = parseNextPostAssignment(planText);
  const topicDecisionEntries = Object.entries(topicDecisions);
  const approvedTopicsCount = topicDecisionEntries.filter(([, value]) => value === 'approved').length;
  const rejectedTopicsCount = topicDecisionEntries.filter(([, value]) => value === 'rejected').length;
  const hasTopicRejections = rejectedTopicsCount > 0;

  const setTopicDecision = (item: ParsedScheduleItem, decision: 'approved' | 'rejected') => {
    const key = getScheduleItemKey(item);
    setTopicDecisions(prev => ({ ...prev, [key]: decision }));
  };

  const clearTopicDecision = (item: ParsedScheduleItem) => {
    const key = getScheduleItemKey(item);
    setTopicDecisions(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

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
  const monthlyOverviewItems = siblingOverview?.items || [];
  const calendarName = siblingOverview?.calendar?.name || null;
  const scheduledDate = siblingOverview?.current_scheduled_date || null;
  const hasSiblingOverview = isAwaitingPlanReview && monthlyOverviewItems.length > 0;

  // Custom link renderer: convert relative URLs to the actual site and open in new tab
  const siteUrl = (run.team_config?.site_url || '').replace(/\/$/, '');
  const markdownComponents = {
    a: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
      let resolvedHref = href || '#';
      // Convert relative paths to absolute site URLs
      if (resolvedHref.startsWith('/') && siteUrl) {
        resolvedHref = `${siteUrl}${resolvedHref}`;
      }
      return (
        <a
          {...props}
          href={resolvedHref}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: LINK_COLOR, textDecoration: 'underline' }}
        >
          {children}
        </a>
      );
    },
    p: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
      <p {...props}>{highlightSuggestionTokens(children)}</p>
    ),
    li: ({ children, ...props }: React.LiHTMLAttributes<HTMLLIElement>) => (
      <li {...props}>{highlightSuggestionTokens(children)}</li>
    ),
    td: ({ children, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
      <td {...props}>{highlightSuggestionTokens(children)}</td>
    ),
    th: ({ children, ...props }: React.ThHTMLAttributes<HTMLTableHeaderCellElement>) => (
      <th {...props}>{highlightSuggestionTokens(children)}</th>
    ),
    h1: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h1 {...props}>{highlightSuggestionTokens(children)}</h1>
    ),
    h2: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h2 {...props}>{highlightSuggestionTokens(children)}</h2>
    ),
    h3: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h3 {...props}>{highlightSuggestionTokens(children)}</h3>
    ),
    h4: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h4 {...props}>{highlightSuggestionTokens(children)}</h4>
    ),
  };

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
          {calendarName && (
            <span className="bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full text-xs font-medium">
              {calendarName}
            </span>
          )}
          {scheduledDate && (
            <span className="bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full text-xs font-medium">
              Scheduled: {new Date(`${scheduledDate}T00:00:00`).toLocaleDateString()}
            </span>
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
                        : 'bg-gray-100 dark:bg-slate-700 text-navy/50 dark:text-slate-400'
                }`}>
                  {isComplete ? '✓' : phase.icon}
                </div>
                <span className={`text-[10px] mt-1 text-center font-body leading-tight ${
                  isActive ? 'text-electric font-semibold'
                    : isComplete ? 'text-green-600 dark:text-green-400 font-medium'
                    : 'text-navy/50 dark:text-slate-400'
                }`}>
                  {phase.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {run.status === 'pending' && (
        <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-amber-800 dark:text-amber-300 font-heading mb-1">Run Queued</h2>
          <p className="text-sm text-amber-700 dark:text-amber-400 font-body">
            This run is launched but still waiting to start processing. No plan or draft is available yet.
          </p>
          <p className="text-xs text-amber-700/80 dark:text-amber-400/80 font-body mt-2">
            If this stays pending for more than a few minutes, re-queue the run from admin/support.
          </p>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Monthly Plan Overview (plan review only) */}
      {/* ------------------------------------------------------------------ */}
      {isAwaitingPlanReview && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-cream-dark dark:border-slate-700 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold text-navy dark:text-white font-heading">Monthly Plan Overview</h2>
              <p className="text-xs text-navy/50 dark:text-slate-400 font-body mt-0.5">
                {calendarName ? `Calendar: ${calendarName}` : 'Sibling topics in this planning batch'}
              </p>
            </div>
            {hasSiblingOverview && (
              <button
                onClick={handleApproveAllPlans}
                disabled={submitting || bulkApproving}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-electric rounded-lg hover:bg-electric/90 disabled:opacity-50 font-body"
              >
                {bulkApproving ? 'Approving...' : 'Approve All Plans'}
              </button>
            )}
          </div>

          {siblingLoading ? (
            <div className="px-5 py-6 text-sm text-navy/50 dark:text-slate-400 font-body">Loading monthly overview...</div>
          ) : siblingError ? (
            <div className="px-5 py-6 text-sm text-red-600 dark:text-red-400 font-body">{siblingError}</div>
          ) : !hasSiblingOverview ? (
            <div className="px-5 py-6 text-sm text-navy/50 dark:text-slate-400 font-body">
              No linked calendar batch found for this run.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-cream-dark dark:border-slate-700 bg-cream/30 dark:bg-dark-surface/30">
                    <th className="px-4 py-2 text-left text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wide font-heading">Week</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wide font-heading">Scheduled Date</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wide font-heading">Topic</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wide font-heading">Silo</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wide font-heading">Primary Keywords</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wide font-heading">Word Count</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wide font-heading">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyOverviewItems.map(item => {
                    const isCurrent = item.run_id === run.id || item.id === siblingOverview?.current_item_id;
                    return (
                      <tr
                        key={item.id}
                        className={`border-b border-cream-dark dark:border-slate-700 ${
                          isCurrent ? 'bg-electric/5 dark:bg-electric/10' : ''
                        }`}
                      >
                        <td className="px-4 py-3 text-xs text-navy/50 dark:text-slate-400 font-body">{getWeekOfMonthLabel(item.scheduled_date)}</td>
                        <td className="px-4 py-3 text-xs text-navy/70 dark:text-slate-300 font-body">
                          {new Date(`${item.scheduled_date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td className="px-4 py-3 text-sm text-navy dark:text-white font-medium font-body">
                          {item.topic}
                          {isCurrent && (
                            <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-electric/15 text-electric">Current</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-navy/60 dark:text-slate-300 font-body">{item.silo || '—'}</td>
                        <td className="px-4 py-3 text-xs text-navy/60 dark:text-slate-300 font-body">
                          {item.keywords && item.keywords.length > 0 ? item.keywords.join(', ') : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-navy/60 dark:text-slate-300 font-body">
                          {item.target_word_count ? item.target_word_count.toLocaleString() : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            item.pipeline_status === 'awaiting_plan_review'
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                              : item.pipeline_status === 'writing'
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                                : item.pipeline_status
                                  ? 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-slate-300'
                                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                          }`}>
                            {formatPipelineStatus(item.pipeline_status)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

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
            <div className="overflow-x-auto">
              {/* Summary table */}
              <table className="w-full text-sm border-collapse">
                <tbody>
                  {parsedPlan.title && (
                    <tr className="border-b border-cream-dark dark:border-slate-700">
                      <td className="px-5 py-3 w-40 text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wide font-heading align-top bg-cream/50 dark:bg-dark-surface/50">Title</td>
                      <td className="px-5 py-3 text-sm font-semibold text-navy dark:text-white font-heading">{parsedPlan.title}</td>
                    </tr>
                  )}
                  {parsedPlan.silo && (
                    <tr className="border-b border-cream-dark dark:border-slate-700">
                      <td className="px-5 py-3 w-40 text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wide font-heading align-top bg-cream/50 dark:bg-dark-surface/50">Silo / Category</td>
                      <td className="px-5 py-3 text-sm text-navy dark:text-slate-200 font-body">{parsedPlan.silo}</td>
                    </tr>
                  )}
                  {parsedPlan.angle && (
                    <tr className="border-b border-cream-dark dark:border-slate-700">
                      <td className="px-5 py-3 w-40 text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wide font-heading align-top bg-cream/50 dark:bg-dark-surface/50">Angle / Hook</td>
                      <td className="px-5 py-3 text-sm text-navy dark:text-slate-200 font-body">{parsedPlan.angle}</td>
                    </tr>
                  )}
                  {parsedPlan.target_word_count && (
                    <tr className="border-b border-cream-dark dark:border-slate-700">
                      <td className="px-5 py-3 w-40 text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wide font-heading align-top bg-cream/50 dark:bg-dark-surface/50">Target Words</td>
                      <td className="px-5 py-3 text-sm text-navy dark:text-slate-200 font-body">{parsedPlan.target_word_count.toLocaleString()}</td>
                    </tr>
                  )}
                  {parsedPlan.keywords && (
                    <>
                      {parsedPlan.keywords.primary && parsedPlan.keywords.primary.length > 0 && (
                        <tr className="border-b border-cream-dark dark:border-slate-700">
                          <td className="px-5 py-3 w-40 text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wide font-heading align-top bg-cream/50 dark:bg-dark-surface/50">Primary Keywords</td>
                          <td className="px-5 py-3">
                            <div className="flex flex-wrap gap-1.5">
                              {parsedPlan.keywords.primary.map((kw, i) => (
                                <span key={i} className="px-2.5 py-1 rounded-full text-xs font-medium bg-electric/10 text-electric border border-electric/20">{kw}</span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                      {parsedPlan.keywords.secondary && parsedPlan.keywords.secondary.length > 0 && (
                        <tr className="border-b border-cream-dark dark:border-slate-700">
                          <td className="px-5 py-3 w-40 text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wide font-heading align-top bg-cream/50 dark:bg-dark-surface/50">Secondary Keywords</td>
                          <td className="px-5 py-3">
                            <div className="flex flex-wrap gap-1.5">
                              {parsedPlan.keywords.secondary.map((kw, i) => (
                                <span key={i} className="px-2.5 py-1 rounded-full text-xs font-medium bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800">{kw}</span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                      {parsedPlan.keywords.lsi && parsedPlan.keywords.lsi.length > 0 && (
                        <tr className="border-b border-cream-dark dark:border-slate-700">
                          <td className="px-5 py-3 w-40 text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wide font-heading align-top bg-cream/50 dark:bg-dark-surface/50">LSI Keywords</td>
                          <td className="px-5 py-3">
                            <div className="flex flex-wrap gap-1.5">
                              {parsedPlan.keywords.lsi.map((kw, i) => (
                                <span key={i} className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 border border-gray-200 dark:border-slate-600">{kw}</span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )}
                  {parsedPlan.internal_links && parsedPlan.internal_links.length > 0 && (
                    <tr className="border-b border-cream-dark dark:border-slate-700">
                      <td className="px-5 py-3 w-40 text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wide font-heading align-top bg-cream/50 dark:bg-dark-surface/50">Internal Links</td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {parsedPlan.internal_links.map((link, i) => (
                            <span key={i} className="px-2 py-1 rounded text-xs font-mono bg-cream dark:bg-dark-surface text-navy/60 dark:text-slate-400 border border-cream-dark dark:border-slate-600">{link}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Outline table */}
              {parsedPlan.outline && parsedPlan.outline.length > 0 && (
                <div className="border-t border-cream-dark dark:border-slate-700">
                  <div className="px-5 py-3 bg-cream/50 dark:bg-dark-surface/50">
                    <p className="text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wide font-heading">Article Outline</p>
                  </div>
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-cream-dark dark:border-slate-700 bg-cream/30 dark:bg-dark-surface/30">
                        <th className="px-5 py-2 text-left text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wide font-heading w-12">#</th>
                        <th className="px-5 py-2 text-left text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wide font-heading w-1/3">Section (H2)</th>
                        <th className="px-5 py-2 text-left text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wide font-heading">Subsections (H3)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedPlan.outline.map((section, i) => (
                        <tr key={i} className="border-b border-cream-dark dark:border-slate-700">
                          <td className="px-5 py-3 text-xs text-navy/40 dark:text-slate-500 font-body align-top">{i + 1}</td>
                          <td className="px-5 py-3 text-sm font-semibold text-navy dark:text-white font-heading align-top">{section.h2}</td>
                          <td className="px-5 py-3 text-sm text-navy/70 dark:text-slate-300 font-body align-top">
                            {section.h3s && section.h3s.length > 0
                              ? section.h3s.map((h3, j) => (
                                  <div key={j} className="py-0.5">{h3}</div>
                                ))
                              : <span className="text-navy/30 dark:text-slate-500">—</span>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {(isAwaitingPlanReview || isAwaitingGate1) && hasMonthlyScheduleText && (
                <div className="border-t border-cream-dark dark:border-slate-700">
                  <div className="px-5 py-3 bg-cream/50 dark:bg-dark-surface/50">
                    <p className="text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wide font-heading">
                      Full Month/Week Plan
                    </p>
                  </div>
                  {monthlyScheduleItems.length > 0 ? (
                    <div>
                      {(siloAssessmentItems.length > 0 || strategicRecommendation.summary || strategicRecommendation.bullets.length > 0 || nextPostAssignmentRows.length > 0) && (
                        <div className="px-5 py-4 border-b border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-card space-y-4">
                          {siloAssessmentItems.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wide font-heading mb-2">Current Silo Status Assessment</p>
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm border-collapse">
                                  <tbody>
                                    {siloAssessmentItems.map(item => (
                                      <tr key={item.siloLabel} className="border-b border-cream-dark dark:border-slate-700">
                                        <td className="px-3 py-2 text-xs font-semibold text-navy/60 dark:text-slate-300 font-body w-56 bg-cream/30 dark:bg-dark-surface/30">{item.siloLabel}</td>
                                        <td className="px-3 py-2 text-sm text-navy dark:text-slate-200 font-body">{item.assessment}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {(strategicRecommendation.summary || strategicRecommendation.bullets.length > 0) && (
                            <div>
                              <p className="text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wide font-heading mb-2">Strategic Recommendation</p>
                              {strategicRecommendation.summary && (
                                <p className="text-sm text-navy dark:text-slate-200 font-body mb-2">{strategicRecommendation.summary}</p>
                              )}
                              {strategicRecommendation.bullets.length > 0 && (
                                <ul className="list-disc list-inside space-y-1 text-sm text-navy/80 dark:text-slate-300 font-body">
                                  {strategicRecommendation.bullets.map((bullet, index) => (
                                    <li key={index}>{bullet}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}

                          {nextPostAssignmentRows.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wide font-heading mb-2">Next Post Assignment</p>
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm border-collapse">
                                  <tbody>
                                    {nextPostAssignmentRows.map(row => (
                                      <tr key={row.key} className="border-b border-cream-dark dark:border-slate-700">
                                        <td className="px-3 py-2 text-xs font-semibold text-navy/60 dark:text-slate-300 font-body w-56 bg-cream/30 dark:bg-dark-surface/30">{row.key}</td>
                                        <td className="px-3 py-2 text-sm text-navy dark:text-slate-200 font-body whitespace-pre-wrap">{row.value}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="overflow-x-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="border-b border-cream-dark dark:border-slate-700 bg-cream/30 dark:bg-dark-surface/30">
                            <th className="px-4 py-2 text-left text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wide font-heading">Month</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wide font-heading">Week</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wide font-heading">Post</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wide font-heading">Day</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wide font-heading">Silo</th>
                            <th className="px-4 py-2 text-left text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wide font-heading">Topic</th>
                            {(isAwaitingGate1 || isAwaitingPlanReview) && (
                              <th className="px-4 py-2 text-left text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wide font-heading">Decision</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {monthlyScheduleItems.map((item, index) => {
                            const itemKey = getScheduleItemKey(item);
                            const topicDecision = topicDecisions[itemKey];
                            return (
                              <tr key={`${item.monthLabel}-${item.weekLabel}-${item.postNumber}-${index}`} className="border-b border-cream-dark dark:border-slate-700">
                                <td className="px-4 py-2 text-xs text-navy/70 dark:text-slate-300 font-body">{item.monthLabel}</td>
                                <td className="px-4 py-2 text-xs text-navy/70 dark:text-slate-300 font-body">{item.weekLabel}</td>
                                <td className="px-4 py-2 text-xs text-navy/70 dark:text-slate-300 font-body">{item.postNumber ?? '—'}</td>
                                <td className="px-4 py-2 text-xs text-navy/70 dark:text-slate-300 font-body">{item.dayLabel || '—'}</td>
                                <td className="px-4 py-2 text-xs text-navy/70 dark:text-slate-300 font-body">{item.siloLabel || '—'}</td>
                                <td className="px-4 py-2 text-sm text-navy dark:text-white font-body">{item.topic}</td>
                                {(isAwaitingGate1 || isAwaitingPlanReview) && (
                                  <td className="px-4 py-2">
                                    <div className="flex items-center gap-1">
                                      <button
                                        onClick={() => setTopicDecision(item, 'approved')}
                                        className={`px-2 py-0.5 text-xs rounded font-body ${
                                          topicDecision === 'approved'
                                            ? 'bg-green-600 text-white'
                                            : 'bg-green-100 text-green-700 hover:bg-green-200'
                                        }`}
                                      >
                                        Approve
                                      </button>
                                      <button
                                        onClick={() => setTopicDecision(item, 'rejected')}
                                        className={`px-2 py-0.5 text-xs rounded font-body ${
                                          topicDecision === 'rejected'
                                            ? 'bg-red-600 text-white'
                                            : 'bg-red-100 text-red-700 hover:bg-red-200'
                                        }`}
                                      >
                                        Reject
                                      </button>
                                      {topicDecision && (
                                        <button
                                          onClick={() => clearTopicDecision(item)}
                                          className="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600 hover:bg-gray-200 font-body"
                                        >
                                          Clear
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    </div>
                  ) : (
                    <div className="p-5 prose prose-sm dark:prose-invert max-w-none font-body">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{planText}</ReactMarkdown>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Article Preview (shown above review panel during approval) */}
      {/* ------------------------------------------------------------------ */}
      {(isAwaitingGate2 || (isAwaitingGate1 && !hasMonthlyScheduleText)) && (run.humanized_content || run.final_content) && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 shadow-sm overflow-hidden">
          {/* Preview header with metadata */}
          <div className="px-6 py-4 border-b border-cream-dark dark:border-slate-700 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-base font-bold text-navy dark:text-white font-heading">
                {run.topic || parsedPlan.title || 'Draft Preview'}
              </h2>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs font-medium text-electric bg-electric/10 px-2 py-0.5 rounded-full">
                  {run.humanized_content ? 'Humanized Draft' : 'Raw Draft'}
                </span>
                <span className="text-xs text-navy/40 dark:text-slate-500 font-body">
                  {cleanDraftContent(run.humanized_content || run.final_content || '').split(/\s+/).filter(Boolean).length.toLocaleString()} words
                </span>
              </div>
            </div>
          </div>
          {/* Full article content */}
          <div className="px-6 md:px-10 py-8">
            <article className="prose dark:prose-invert max-w-none font-body prose-headings:font-heading prose-headings:text-navy dark:prose-headings:text-white prose-p:leading-relaxed prose-p:text-navy/80 dark:prose-p:text-slate-300 prose-h1:text-[20px] prose-h2:text-[16px] prose-h3:text-[14px] prose-h4:text-[12px] prose-p:text-[11px] prose-li:text-[11px] prose-td:text-[11px] prose-th:text-[11px]">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {cleanDraftContent(run.humanized_content || run.final_content || '')}
              </ReactMarkdown>
            </article>
          </div>
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
                disabled={submitting || bulkApproving}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 font-body shadow-sm"
              >
                {submitting ? 'Submitting...' : 'Approve & Continue'}
              </button>
              <button
                onClick={() => handleDecision(activeReviewPhase, 'revise')}
                disabled={submitting || bulkApproving || (!feedbackText.trim() && uploadedAttachments.length === 0 && !hasTopicRejections)}
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
                disabled={submitting || bulkApproving}
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
      {/* Content Preview (compact, for non-approval states) */}
      {/* ------------------------------------------------------------------ */}
      {!isAwaitingPlanReview && !isAwaitingGate1 && !isAwaitingGate2 && (run.humanized_content || run.final_content) && (
        <div className="bg-white dark:bg-dark-card rounded-xl p-5 border border-cream-dark dark:border-slate-700">
          <h2 className="text-sm font-semibold text-navy/60 dark:text-slate-300 mb-3 font-heading">Content Preview</h2>
          <div className="prose dark:prose-invert max-w-none font-body bg-cream dark:bg-dark-surface p-4 rounded-lg overflow-auto max-h-96 prose-h1:text-[20px] prose-h2:text-[16px] prose-h3:text-[14px] prose-h4:text-[12px] prose-p:text-[11px] prose-li:text-[11px] prose-td:text-[11px] prose-th:text-[11px]">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {cleanDraftContent(run.humanized_content || run.final_content || '')}
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

      {/* SEO Orchestrator Chat */}
      <SeoChat runId={runId} runTopic={run?.topic || undefined} />
    </div>
  );
}
