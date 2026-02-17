'use client';

import { useState, useRef, useEffect } from 'react';
import { useWebResearch } from '@/hooks/useWebResearch';
import type { WebResearchTaskType } from '@/lib/types';

// ============================================================================
// WEB RESEARCH PANEL
// Slide-out panel for running web research sessions.
// ============================================================================

const TASK_TYPES: { type: WebResearchTaskType; label: string; description: string; icon: string }[] = [
  { type: 'url_import', label: 'Import URL', description: 'Extract content from a URL', icon: 'dl' },
  { type: 'competitor_research', label: 'Competitor Research', description: 'Research competitor websites', icon: 'vs' },
  { type: 'link_health', label: 'Link Health Check', description: 'Validate URLs for broken links', icon: 'ok' },
  { type: 'content_extraction', label: 'Content Extraction', description: 'Extract specific elements', icon: '<>' },
  { type: 'social_proof', label: 'Social Proof', description: 'Gather reviews and testimonials', icon: '5*' },
  { type: 'general', label: 'General Research', description: 'Open-ended web research', icon: '??' },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  boardId?: string;
  cardId?: string;
  initialUrl?: string;
}

export default function WebResearchPanel({ isOpen, onClose, boardId, cardId, initialUrl }: Props) {
  const [taskType, setTaskType] = useState<WebResearchTaskType>('general');
  const [prompt, setPrompt] = useState('');
  const [urls, setUrls] = useState(initialUrl ? [initialUrl] : ['']);
  const [allowlist, setAllowlist] = useState('');
  const outputRef = useRef<HTMLDivElement>(null!);


  const {
    sessionId,
    isRunning,
    text,
    toolCalls,
    screenshots,
    progress,
    error,
    startResearch,
    cancelResearch,
  } = useWebResearch();

  useEffect(() => {
    if (initialUrl) {
      setUrls([initialUrl]);
      setTaskType('url_import');
    }
  }, [initialUrl]);

  useEffect(() => {
    if (outputRef.current && isRunning) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [text, isRunning]);

  const handleStart = () => {
    if (!prompt.trim()) return;

    const filteredUrls = urls.filter((u) => u.trim());
    const domains = allowlist
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);

    startResearch({
      task_type: taskType,
      input_prompt: prompt.trim(),
      input_urls: filteredUrls.length > 0 ? filteredUrls : undefined,
      domain_allowlist: domains.length > 0 ? domains : undefined,
      board_id: boardId,
      card_id: cardId,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 dark:bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-xl bg-white dark:bg-slate-800 shadow-2xl flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy/5 dark:border-slate-700">
          <h2 className="text-lg font-heading font-semibold text-navy dark:text-slate-100">
            Web Research Agent
          </h2>
          <button
            onClick={onClose}
            className="text-navy/40 dark:text-slate-500 hover:text-navy dark:hover:text-slate-200 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {!isRunning && !text ? (
            <ResearchForm
              taskType={taskType}
              setTaskType={setTaskType}
              prompt={prompt}
              setPrompt={setPrompt}
              urls={urls}
              setUrls={setUrls}
              allowlist={allowlist}
              setAllowlist={setAllowlist}
              onStart={handleStart}
            />
          ) : (
            <ResearchProgress
              isRunning={isRunning}
              text={text}
              toolCalls={toolCalls}
              screenshots={screenshots}
              progress={progress}
              error={error}
              outputRef={outputRef}
              onCancel={cancelResearch}
              sessionId={sessionId}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function ResearchForm({
  taskType, setTaskType,
  prompt, setPrompt,
  urls, setUrls,
  allowlist, setAllowlist,
  onStart,
}: {
  taskType: WebResearchTaskType;
  setTaskType: (t: WebResearchTaskType) => void;
  prompt: string;
  setPrompt: (p: string) => void;
  urls: string[];
  setUrls: (u: string[]) => void;
  allowlist: string;
  setAllowlist: (a: string) => void;
  onStart: () => void;
}) {
  return (
    <>
      {/* Task type selector */}
      <div>
        <label className="text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider mb-2 block">
          Research Type
        </label>
        <div className="grid grid-cols-2 gap-2">
          {TASK_TYPES.map((tt) => (
            <button
              key={tt.type}
              onClick={() => setTaskType(tt.type)}
              className={`text-left p-3 rounded-lg border transition-all ${
                taskType === tt.type
                  ? 'border-electric bg-electric/5 dark:bg-electric/10 ring-1 ring-electric/30'
                  : 'border-navy/5 dark:border-slate-700 hover:border-navy/15 dark:hover:border-slate-600'
              }`}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-mono font-bold text-navy/60 dark:text-slate-400">{tt.icon}</span>
                <span className="text-sm font-semibold text-navy dark:text-slate-100">{tt.label}</span>
              </div>
              <p className="text-[10px] text-navy/40 dark:text-slate-500">{tt.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* URL inputs */}
      <div>
        <label className="text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider mb-2 block">
          URLs (optional)
        </label>
        {urls.map((url, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <input
              type="url"
              value={url}
              onChange={(e) => {
                const next = [...urls];
                next[i] = e.target.value;
                setUrls(next);
              }}
              placeholder="https://example.com"
              className="flex-1 px-3 py-2 text-sm rounded-lg border border-navy/10 dark:border-slate-600 bg-cream dark:bg-slate-900 text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-electric/30"
            />
            {urls.length > 1 && (
              <button
                onClick={() => setUrls(urls.filter((_, j) => j !== i))}
                className="text-navy/30 hover:text-red-500 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        ))}
        {urls.length < 5 && (
          <button
            onClick={() => setUrls([...urls, ''])}
            className="text-xs text-electric hover:underline"
          >
            + Add URL
          </button>
        )}
      </div>

      {/* Prompt */}
      <div>
        <label className="text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider mb-2 block">
          Research Instructions
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="What do you want to research?"
          rows={4}
          className="w-full px-3 py-2 text-sm rounded-lg border border-navy/10 dark:border-slate-600 bg-cream dark:bg-slate-900 text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-electric/30 resize-none"
        />
      </div>

      {/* Domain allowlist */}
      <div>
        <label className="text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider mb-2 block">
          Domain Allowlist (optional)
        </label>
        <input
          type="text"
          value={allowlist}
          onChange={(e) => setAllowlist(e.target.value)}
          placeholder="example.com, competitor.io"
          className="w-full px-3 py-2 text-sm rounded-lg border border-navy/10 dark:border-slate-600 bg-cream dark:bg-slate-900 text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-electric/30"
        />
        <p className="text-[10px] text-navy/30 dark:text-slate-500 mt-1">
          Leave empty to allow all domains. Comma-separated.
        </p>
      </div>

      {/* Start button */}
      <button
        onClick={onStart}
        disabled={!prompt.trim()}
        className="w-full py-3 text-sm font-semibold rounded-lg bg-electric text-white hover:bg-electric/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z" />
        </svg>
        Start Research
      </button>
    </>
  );
}

function ResearchProgress({
  isRunning, text, toolCalls, screenshots, progress, error, outputRef, onCancel, sessionId,
}: {
  isRunning: boolean;
  text: string;
  toolCalls: { name: string; input: Record<string, unknown>; result?: string; success?: boolean }[];
  screenshots: { url: string; screenshot_url: string }[];
  progress: { iteration: number; max: number };
  error: string | null;
  outputRef: React.RefObject<HTMLDivElement>;
  onCancel: () => void;
  sessionId: string | null;
}) {
  const [showTools, setShowTools] = useState(true);

  return (
    <>
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        {isRunning && (
          <span className="w-4 h-4 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
        )}
        <div className="flex-1">
          <div className="flex justify-between text-xs text-navy/40 dark:text-slate-500 mb-1">
            <span>{isRunning ? 'Researching...' : 'Complete'}</span>
            <span>Iteration {progress.iteration}/{progress.max}</span>
          </div>
          <div className="h-1.5 bg-cream dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-electric rounded-full transition-all"
              style={{ width: `${Math.min((progress.iteration / progress.max) * 100, 100)}%` }}
            />
          </div>
        </div>
        {isRunning && (
          <button
            onClick={onCancel}
            className="text-xs text-red-500 hover:text-red-600 font-semibold"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Tool calls */}
      {toolCalls.length > 0 && (
        <div>
          <button
            onClick={() => setShowTools(!showTools)}
            className="text-xs text-navy/40 dark:text-slate-500 hover:text-navy dark:hover:text-slate-300 mb-2"
          >
            {showTools ? 'Hide' : 'Show'} tool calls ({toolCalls.length})
          </button>
          {showTools && (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {toolCalls.map((tc, i) => (
                <div
                  key={i}
                  className={`px-3 py-1.5 rounded text-xs flex items-center gap-2 ${
                    tc.success === undefined ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' :
                    tc.success ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' :
                    'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                  }`}
                >
                  <span className="font-mono font-semibold shrink-0">{tc.name}</span>
                  {tc.input?.url ? <span className="text-navy/30 dark:text-slate-600 truncate">{String(tc.input.url)}</span> : null}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Screenshots */}
      {screenshots.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider mb-2">
            Screenshots ({screenshots.length})
          </h4>
          <div className="flex gap-2 overflow-x-auto">
            {screenshots.map((s, i) => (
              <a
                key={i}
                href={s.screenshot_url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 w-32 h-20 bg-cream dark:bg-slate-900 rounded-lg border border-navy/10 dark:border-slate-700 flex items-center justify-center text-[10px] text-navy/30 dark:text-slate-500 hover:border-electric transition-colors overflow-hidden"
              >
                <img src={s.screenshot_url} alt={s.url} className="w-full h-full object-cover" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Output */}
      {text && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider">
              Research Output
            </h4>
            {!isRunning && text && (
              <button
                onClick={() => navigator.clipboard.writeText(text)}
                className="text-xs text-navy/40 dark:text-slate-500 hover:text-electric transition-colors"
              >
                Copy
              </button>
            )}
          </div>
          <div
            ref={outputRef}
            className="p-4 rounded-lg bg-cream dark:bg-slate-900 text-sm text-navy/80 dark:text-slate-300 max-h-96 overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed"
          >
            {text}
            {isRunning && <span className="animate-pulse text-electric">|</span>}
          </div>
        </div>
      )}
    </>
  );
}
