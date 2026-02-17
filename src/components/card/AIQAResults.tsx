'use client';

import { useState } from 'react';
import {
  AIQAResult,
  QAFinding,
  QAChecklistResult,
  QAScreenshot,
  QAConsoleError,
  QAFindingSeverity,
  QAStatus,
} from '@/lib/types';
import Button from '@/components/ui/Button';

interface AIQAResultsProps {
  qa: AIQAResult;
  onNewQA: () => void;
}

const STATUS_CONFIG: Record<QAStatus, { label: string; bg: string; border: string; text: string }> = {
  pending: { label: 'Pending', bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800' },
  running: { label: 'Running', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800' },
  passed: { label: 'Passed', bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800' },
  failed: { label: 'Failed', bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800' },
  error: { label: 'Error', bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800' },
};

const SEVERITY_CONFIG: Record<QAFindingSeverity, { label: string; bg: string; text: string; dotColor: string }> = {
  critical: { label: 'Critical', bg: 'bg-red-100', text: 'text-red-700', dotColor: 'bg-red-500' },
  major: { label: 'Major', bg: 'bg-orange-100', text: 'text-orange-700', dotColor: 'bg-orange-500' },
  minor: { label: 'Minor', bg: 'bg-yellow-100', text: 'text-yellow-700', dotColor: 'bg-yellow-500' },
  info: { label: 'Info', bg: 'bg-blue-100', text: 'text-blue-700', dotColor: 'bg-blue-500' },
};

type ScreenshotTab = 'all' | 'desktop' | 'tablet' | 'mobile';

function ScoreDisplay({ score }: { score: number }) {
  let color = 'text-green-600';
  let ringColor = 'ring-green-200 bg-green-50';
  if (score < 50) {
    color = 'text-red-600';
    ringColor = 'ring-red-200 bg-red-50';
  } else if (score < 70) {
    color = 'text-yellow-600';
    ringColor = 'ring-yellow-200 bg-yellow-50';
  }

  return (
    <div className={`inline-flex items-center justify-center w-20 h-20 rounded-2xl ring-2 ${ringColor}`}>
      <span className={`text-3xl font-bold font-heading ${color}`}>{score}</span>
    </div>
  );
}

function FindingCard({ finding }: { finding: QAFinding }) {
  const config = SEVERITY_CONFIG[finding.severity];

  return (
    <div className="p-3 rounded-xl bg-cream dark:bg-dark-surface border border-cream-dark dark:border-slate-700">
      <div className="flex items-start gap-2.5">
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${config.bg} ${config.text} shrink-0 mt-0.5`}>
          {config.label}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-semibold text-navy/50 dark:text-slate-400 font-heading">
              {finding.category}
            </span>
          </div>
          <p className="text-sm text-navy/70 dark:text-slate-300 font-body">
            {finding.description}
          </p>
          {finding.location && (
            <p className="text-[11px] text-navy/40 dark:text-slate-500 font-body mt-1">
              Location: {finding.location}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ChecklistResultRow({ result, index }: { result: QAChecklistResult; index: number }) {
  return (
    <div className={`flex items-start gap-3 p-2.5 rounded-lg ${result.passed ? 'bg-green-50/50' : 'bg-red-50/50'}`}>
      <div
        className={`
          w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5
          ${result.passed ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}
        `}
      >
        {result.passed ? (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-navy/30 dark:text-slate-500 font-body">#{index + 1}</span>
          <span className={`text-xs font-semibold ${result.passed ? 'text-green-700' : 'text-red-700'}`}>
            {result.passed ? 'Pass' : 'Fail'}
          </span>
        </div>
        {result.notes && (
          <p className="text-xs text-navy/60 dark:text-slate-400 font-body mt-0.5">{result.notes}</p>
        )}
      </div>
    </div>
  );
}

function ScreenshotGallery({ screenshots }: { screenshots: QAScreenshot[] }) {
  const [activeTab, setActiveTab] = useState<ScreenshotTab>('all');

  if (screenshots.length === 0) {
    return (
      <p className="text-sm text-navy/30 dark:text-slate-500 text-center py-4 font-body">
        No screenshots captured.
      </p>
    );
  }

  const viewportTabs: { key: ScreenshotTab; label: string }[] = [
    { key: 'all', label: 'All' },
    ...(['desktop', 'tablet', 'mobile'] as const)
      .filter((vp) => screenshots.some((s) => s.viewport === vp))
      .map((vp) => ({ key: vp as ScreenshotTab, label: vp.charAt(0).toUpperCase() + vp.slice(1) })),
  ];

  const filteredScreenshots = activeTab === 'all'
    ? screenshots
    : screenshots.filter((s) => s.viewport === activeTab);

  return (
    <div>
      {/* Viewport tabs */}
      {viewportTabs.length > 2 && (
        <div className="flex gap-1 mb-3">
          {viewportTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`
                px-2.5 py-1 rounded-lg text-xs font-medium transition-all
                ${activeTab === tab.key
                  ? 'bg-electric/10 text-electric'
                  : 'text-navy/40 hover:text-navy/60 hover:bg-cream-dark'
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Screenshots grid */}
      <div className={`grid gap-3 ${filteredScreenshots.length === 1 ? 'grid-cols-1' : filteredScreenshots.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {filteredScreenshots.map((screenshot, idx) => (
          <div key={idx} className="rounded-xl border border-cream-dark dark:border-slate-700 overflow-hidden bg-white dark:bg-dark-surface">
            <div className="aspect-video bg-cream-dark dark:bg-slate-800 flex items-center justify-center relative">
              {screenshot.storage_path ? (
                <img
                  src={screenshot.storage_path}
                  alt={`${screenshot.viewport} screenshot`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <svg className="w-8 h-8 text-navy/15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              )}
            </div>
            <div className="px-2.5 py-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-navy/50 dark:text-slate-400 capitalize font-heading">
                  {screenshot.viewport}
                </span>
                <span className="text-[10px] text-navy/30 dark:text-slate-500 font-body">
                  {screenshot.width}x{screenshot.height}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConsoleErrorRow({ error }: { error: QAConsoleError }) {
  return (
    <div className="p-2.5 rounded-lg bg-red-50/50 border border-red-100">
      <div className="flex items-start gap-2">
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700 shrink-0 mt-0.5 uppercase">
          {error.type}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-red-800 font-mono break-all">{error.text}</p>
          {error.url && (
            <p className="text-[10px] text-red-500 font-body mt-0.5 truncate">
              {error.url}{error.line > 0 ? `:${error.line}` : ''}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AIQAResults({ qa, onNewQA }: AIQAResultsProps) {
  const [expandedSection, setExpandedSection] = useState<string | null>('findings');

  const statusConfig = STATUS_CONFIG[qa.overall_status];
  const findings = qa.results?.findings || [];
  const checklistResults = qa.checklist_results || qa.results?.checklist_results || [];
  const overallScore = qa.overall_score ?? qa.results?.overall_score ?? 0;
  const summary = qa.results?.summary || '';

  // Group findings by severity
  const findingsByGroup: Record<QAFindingSeverity, QAFinding[]> = {
    critical: [],
    major: [],
    minor: [],
    info: [],
  };
  for (const finding of findings) {
    findingsByGroup[finding.severity].push(finding);
  }

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const perfMetrics = qa.performance_metrics;
  const consoleErrors = qa.console_errors || [];
  const passedCount = checklistResults.filter((r) => r.passed).length;
  const failedCount = checklistResults.filter((r) => !r.passed).length;

  return (
    <div className="space-y-4">
      {/* Overall score + status banner */}
      <div className={`p-4 rounded-xl border ${statusConfig.bg} ${statusConfig.border}`}>
        <div className="flex items-center gap-4">
          <ScoreDisplay score={overallScore} />
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${statusConfig.bg} ${statusConfig.border} ${statusConfig.text}`}>
                {statusConfig.label}
              </span>
            </div>
            {summary && (
              <p className="text-sm text-navy/60 dark:text-slate-400 font-body mt-1">{summary}</p>
            )}
          </div>
        </div>

        {/* Findings count badges */}
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-black/5">
          {(Object.entries(qa.findings_count || {}) as [QAFindingSeverity, number][]).map(
            ([severity, count]) => {
              if (count === 0) return null;
              const config = SEVERITY_CONFIG[severity];
              return (
                <span
                  key={severity}
                  className={`inline-flex items-center gap-1 text-xs font-medium ${config.text}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${config.dotColor}`} />
                  {count} {config.label}
                </span>
              );
            }
          )}
          {Object.values(qa.findings_count || {}).every((c) => c === 0) && (
            <span className="text-xs text-navy/30 dark:text-slate-500 font-body">No findings</span>
          )}
        </div>
      </div>

      {/* Screenshots */}
      {qa.screenshots && qa.screenshots.length > 0 && (
        <div>
          <button
            onClick={() => toggleSection('screenshots')}
            className="w-full flex items-center justify-between py-2"
          >
            <p className="text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider font-heading">
              Screenshots ({qa.screenshots.length})
            </p>
            <svg
              className={`w-4 h-4 text-navy/30 transition-transform duration-200 ${expandedSection === 'screenshots' ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {expandedSection === 'screenshots' && (
            <ScreenshotGallery screenshots={qa.screenshots} />
          )}
        </div>
      )}

      {/* Findings */}
      <div>
        <button
          onClick={() => toggleSection('findings')}
          className="w-full flex items-center justify-between py-2"
        >
          <p className="text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider font-heading">
            Findings ({findings.length})
          </p>
          <svg
            className={`w-4 h-4 text-navy/30 transition-transform duration-200 ${expandedSection === 'findings' ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {expandedSection === 'findings' && (
          <div className="space-y-3">
            {findings.length === 0 ? (
              <p className="text-sm text-navy/30 dark:text-slate-500 text-center py-4 font-body">
                No findings reported.
              </p>
            ) : (
              (['critical', 'major', 'minor', 'info'] as QAFindingSeverity[]).map((severity) => {
                const grouped = findingsByGroup[severity];
                if (grouped.length === 0) return null;
                return (
                  <div key={severity}>
                    <p className="text-[11px] font-semibold text-navy/40 dark:text-slate-500 uppercase tracking-wider mb-1.5 font-heading flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${SEVERITY_CONFIG[severity].dotColor}`} />
                      {SEVERITY_CONFIG[severity].label} ({grouped.length})
                    </p>
                    <div className="space-y-2">
                      {grouped.map((finding, idx) => (
                        <FindingCard key={idx} finding={finding} />
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Checklist Results */}
      {checklistResults.length > 0 && (
        <div>
          <button
            onClick={() => toggleSection('checklist')}
            className="w-full flex items-center justify-between py-2"
          >
            <p className="text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider font-heading">
              Checklist Results ({passedCount} passed, {failedCount} failed)
            </p>
            <svg
              className={`w-4 h-4 text-navy/30 transition-transform duration-200 ${expandedSection === 'checklist' ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {expandedSection === 'checklist' && (
            <div className="space-y-1.5">
              {checklistResults.map((result, idx) => (
                <ChecklistResultRow key={idx} result={result} index={idx} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Performance Metrics */}
      {perfMetrics && (
        <div>
          <button
            onClick={() => toggleSection('performance')}
            className="w-full flex items-center justify-between py-2"
          >
            <p className="text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider font-heading">
              Performance Metrics
            </p>
            <svg
              className={`w-4 h-4 text-navy/30 transition-transform duration-200 ${expandedSection === 'performance' ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {expandedSection === 'performance' && (
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-cream dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-center">
                <p className="text-[11px] text-navy/40 dark:text-slate-500 font-body uppercase tracking-wider mb-1">Load Time</p>
                <p className="text-lg font-bold text-navy dark:text-slate-100 font-heading">
                  {perfMetrics.load_time_ms != null ? `${(perfMetrics.load_time_ms / 1000).toFixed(2)}s` : '--'}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-cream dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-center">
                <p className="text-[11px] text-navy/40 dark:text-slate-500 font-body uppercase tracking-wider mb-1">First Paint</p>
                <p className="text-lg font-bold text-navy dark:text-slate-100 font-heading">
                  {perfMetrics.first_paint_ms != null ? `${(perfMetrics.first_paint_ms / 1000).toFixed(2)}s` : '--'}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-cream dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-center">
                <p className="text-[11px] text-navy/40 dark:text-slate-500 font-body uppercase tracking-wider mb-1">DOM Ready</p>
                <p className="text-lg font-bold text-navy dark:text-slate-100 font-heading">
                  {perfMetrics.dom_content_loaded_ms != null ? `${(perfMetrics.dom_content_loaded_ms / 1000).toFixed(2)}s` : '--'}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Console Errors */}
      {consoleErrors.length > 0 && (
        <div>
          <button
            onClick={() => toggleSection('console')}
            className="w-full flex items-center justify-between py-2"
          >
            <p className="text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider font-heading">
              Console Errors ({consoleErrors.length})
            </p>
            <svg
              className={`w-4 h-4 text-navy/30 transition-transform duration-200 ${expandedSection === 'console' ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {expandedSection === 'console' && (
            <div className="space-y-1.5">
              {consoleErrors.map((err, idx) => (
                <ConsoleErrorRow key={idx} error={err} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Meta info */}
      <div className="flex items-center gap-4 pt-3 border-t border-cream-dark dark:border-slate-700 text-[11px] text-navy/30 dark:text-slate-500 font-body">
        {qa.model_used && (
          <span className="inline-flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            {qa.model_used}
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          {qa.url}
        </span>
        <span>
          {new Date(qa.created_at).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2">
        <Button variant="secondary" size="sm" onClick={onNewQA}>
          <span className="flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Run New QA
          </span>
        </Button>
      </div>
    </div>
  );
}
