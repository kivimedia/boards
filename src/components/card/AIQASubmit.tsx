'use client';

import { useState, useEffect, useCallback } from 'react';
import { QAChecklistTemplate, QAChecklistItem } from '@/lib/types';
import Button from '@/components/ui/Button';

interface AIQASubmitProps {
  cardId: string;
  initialUrl?: string;
  onQAComplete: () => void;
  onCancel: () => void;
}

interface Toast {
  type: 'success' | 'error';
  message: string;
}

type SubmitStep = 'form' | 'running';
type ProgressPhase = 'capturing' | 'analyzing' | 'saving' | 'done';

const PROGRESS_STEPS: { phase: ProgressPhase; label: string }[] = [
  { phase: 'capturing', label: 'Capturing screenshots...' },
  { phase: 'analyzing', label: 'Analyzing with AI...' },
  { phase: 'saving', label: 'Saving results...' },
];

export default function AIQASubmit({ cardId, initialUrl = '', onQAComplete, onCancel }: AIQASubmitProps) {
  const [step, setStep] = useState<SubmitStep>('form');
  const [url, setUrl] = useState(initialUrl);
  const [templates, setTemplates] = useState<QAChecklistTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [progressPhase, setProgressPhase] = useState<ProgressPhase>('capturing');
  const [toast, setToast] = useState<Toast | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const res = await fetch('/api/qa-templates');
      if (!res.ok) throw new Error('Failed to load templates');
      const json = await res.json();
      const data: QAChecklistTemplate[] = json.data || [];
      setTemplates(data);
      // Auto-select default template
      const defaultTemplate = data.find((t) => t.is_default);
      if (defaultTemplate) {
        setSelectedTemplateId(defaultTemplate.id);
      }
    } catch {
      showToast('error', 'Failed to load QA templates.');
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  // Group checklist items by category
  const groupedItems: Record<string, QAChecklistItem[]> = {};
  if (selectedTemplate) {
    for (const item of selectedTemplate.items) {
      if (!groupedItems[item.category]) {
        groupedItems[item.category] = [];
      }
      groupedItems[item.category].push(item);
    }
  }

  const isValidUrl = (value: string) => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  };

  const handleSubmit = async () => {
    if (!url.trim()) {
      showToast('error', 'Please enter a URL to analyze.');
      return;
    }

    if (!isValidUrl(url.trim())) {
      showToast('error', 'Please enter a valid URL (e.g., https://example.com).');
      return;
    }

    setSubmitting(true);
    setStep('running');
    setProgressPhase('capturing');

    try {
      // Simulate progress phases via polling / timed updates
      const phaseTimer1 = setTimeout(() => setProgressPhase('analyzing'), 3000);
      const phaseTimer2 = setTimeout(() => setProgressPhase('saving'), 8000);

      const body: Record<string, unknown> = {
        url: url.trim(),
      };
      if (selectedTemplateId) {
        body.checklist_template_id = selectedTemplateId;
      }

      const res = await fetch(`/api/cards/${cardId}/qa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      clearTimeout(phaseTimer1);
      clearTimeout(phaseTimer2);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'QA analysis failed');
      }

      setProgressPhase('done');
      showToast('success', 'QA analysis completed successfully.');

      // Brief pause so user sees the done state
      setTimeout(() => {
        onQAComplete();
      }, 500);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'QA analysis failed.');
      setStep('form');
    } finally {
      setSubmitting(false);
    }
  };

  const currentPhaseIndex = PROGRESS_STEPS.findIndex((s) => s.phase === progressPhase);

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div
          className={`
            fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg font-body text-sm
            animate-in fade-in slide-in-from-top-2 duration-200
            ${toast.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
            }
          `}
        >
          <div className="flex items-center gap-2">
            {toast.type === 'success' ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">Run AI QA Analysis</h3>
        <button
          onClick={onCancel}
          className="p-1.5 rounded-lg text-navy/40 dark:text-slate-500 hover:text-navy/60 dark:hover:text-slate-300 hover:bg-cream-dark dark:hover:bg-slate-800 transition-all"
          disabled={submitting}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Running state */}
      {step === 'running' && (
        <div className="py-6">
          {/* Progress steps */}
          <div className="space-y-3">
            {PROGRESS_STEPS.map((ps, idx) => {
              const isActive = idx === currentPhaseIndex;
              const isComplete = idx < currentPhaseIndex || progressPhase === 'done';
              const isPending = idx > currentPhaseIndex && progressPhase !== 'done';

              return (
                <div key={ps.phase} className="flex items-center gap-3">
                  <div
                    className={`
                      w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all
                      ${isComplete
                        ? 'bg-green-500 text-white'
                        : isActive
                          ? 'bg-electric text-white'
                          : 'bg-cream-dark dark:bg-slate-700 text-navy/30 dark:text-slate-500'
                      }
                    `}
                  >
                    {isComplete ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : isActive ? (
                      <svg className="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    ) : (
                      <span className="text-xs font-semibold">{idx + 1}</span>
                    )}
                  </div>

                  <span
                    className={`text-sm font-body transition-colors ${
                      isComplete
                        ? 'text-green-700 font-medium'
                        : isActive
                          ? 'text-navy font-medium'
                          : isPending
                            ? 'text-navy/30'
                            : 'text-navy/60'
                    }`}
                  >
                    {ps.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Progress bar */}
          <div className="mt-6">
            <div className="h-1.5 bg-cream-dark dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-electric rounded-full transition-all duration-1000 ease-out"
                style={{
                  width: progressPhase === 'done'
                    ? '100%'
                    : progressPhase === 'saving'
                      ? '80%'
                      : progressPhase === 'analyzing'
                        ? '45%'
                        : '15%',
                }}
              />
            </div>
          </div>

          <p className="text-xs text-navy/40 dark:text-slate-500 font-body mt-4 text-center">
            This may take a minute. Please don&apos;t close this window.
          </p>
        </div>
      )}

      {/* Form state */}
      {step === 'form' && (
        <div className="space-y-4">
          <p className="text-sm text-navy/60 dark:text-slate-400 font-body">
            Enter the URL to analyze and optionally select a QA checklist template.
          </p>

          {/* URL Input */}
          <div>
            <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1.5 uppercase tracking-wider font-heading">
              URL to Analyze
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="w-4 h-4 text-navy/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://staging.example.com"
                className="
                  w-full pl-9 pr-3 py-2.5 rounded-xl bg-cream dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100
                  placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30
                  focus:border-electric font-body
                "
              />
            </div>
            {url && !isValidUrl(url) && (
              <p className="text-xs text-red-500 font-body mt-1">Please enter a valid URL.</p>
            )}
          </div>

          {/* Template Selector */}
          <div>
            <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1.5 uppercase tracking-wider font-heading">
              QA Checklist Template
            </label>
            {loadingTemplates ? (
              <div className="flex items-center justify-center py-4">
                <svg className="animate-spin h-5 w-5 text-electric" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            ) : templates.length === 0 ? (
              <div className="p-3 rounded-xl bg-cream dark:bg-dark-bg border border-cream-dark dark:border-slate-700 text-center">
                <p className="text-sm text-navy/40 dark:text-slate-500 font-body">
                  No QA templates available. Analysis will run with default checks.
                </p>
              </div>
            ) : (
              <select
                value={selectedTemplateId}
                onChange={(e) => {
                  setSelectedTemplateId(e.target.value);
                  setShowPreview(false);
                }}
                className="
                  w-full px-3 py-2.5 rounded-xl bg-cream dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100
                  focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body
                  appearance-none cursor-pointer
                "
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%230f172a' stroke-opacity='0.3'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 0.75rem center',
                  backgroundSize: '1rem',
                }}
              >
                <option value="">No template (default checks)</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.is_default ? '(Default)' : ''} - {t.items.length} items
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Template Description */}
          {selectedTemplate && selectedTemplate.description && (
            <p className="text-xs text-navy/50 dark:text-slate-400 font-body -mt-2">
              {selectedTemplate.description}
            </p>
          )}

          {/* Checklist Preview Toggle */}
          {selectedTemplate && selectedTemplate.items.length > 0 && (
            <div>
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-electric hover:text-electric-bright transition-colors"
              >
                <svg
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${showPreview ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                {showPreview ? 'Hide' : 'Preview'} checklist items ({selectedTemplate.items.length})
              </button>

              {showPreview && (
                <div className="mt-2 p-3 rounded-xl bg-cream dark:bg-dark-bg border border-cream-dark dark:border-slate-700 space-y-3 max-h-60 overflow-y-auto">
                  {Object.entries(groupedItems).map(([category, items]) => (
                    <div key={category}>
                      <p className="text-[11px] font-semibold text-navy/40 dark:text-slate-500 uppercase tracking-wider mb-1.5 font-heading">
                        {category}
                      </p>
                      <div className="space-y-1">
                        {items.map((item, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-xs text-navy/60 dark:text-slate-400 font-body">
                            <span className="w-4 h-4 rounded border border-cream-dark bg-white flex items-center justify-center shrink-0 mt-0.5">
                              <svg className="w-2.5 h-2.5 text-navy/15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            </span>
                            <span>{item.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex justify-end gap-2 pt-2 border-t border-cream-dark dark:border-slate-700">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!url.trim() || !isValidUrl(url.trim())}
              loading={submitting}
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Running...
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Run QA Analysis
                </span>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
