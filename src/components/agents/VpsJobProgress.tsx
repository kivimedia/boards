'use client';

import type { VpsAgentJobState } from '@/hooks/useVpsAgentJob';

interface VpsJobProgressProps {
  state: VpsAgentJobState;
}

export default function VpsJobProgress({ state }: VpsJobProgressProps) {
  const {
    job,
    isRunning,
    isPaused,
    isComplete,
    isFailed,
    output,
    toolCalls,
    confirmationNeeded,
    confirmationMessage,
    chainSteps,
    iteration,
    maxIterations,
    confirm,
  } = state;

  if (!job) return null;

  const statusColor = isComplete
    ? 'text-green-600 dark:text-green-400'
    : isFailed
    ? 'text-red-600 dark:text-red-400'
    : isPaused
    ? 'text-yellow-600 dark:text-yellow-400'
    : 'text-electric';

  const statusLabel = isComplete
    ? 'Completed'
    : isFailed
    ? 'Failed'
    : isPaused
    ? 'Paused - Awaiting Confirmation'
    : isRunning
    ? 'Running...'
    : job.status;

  const progressPercent = maxIterations > 0 ? Math.round((iteration / maxIterations) * 100) : 0;

  return (
    <div className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-cream-dark dark:border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-electric animate-pulse' : isComplete ? 'bg-green-500' : isFailed ? 'bg-red-500' : isPaused ? 'bg-yellow-500' : 'bg-gray-400'}`} />
          <span className={`text-sm font-semibold ${statusColor} font-heading`}>{statusLabel}</span>
        </div>
        <span className="text-xs text-navy/40 dark:text-slate-500 font-body">
          VPS Background Job
        </span>
      </div>

      {/* Progress Bar */}
      {isRunning && (
        <div className="px-4 py-2">
          <div className="flex items-center justify-between text-xs text-navy/50 dark:text-slate-400 mb-1 font-body">
            <span>Iteration {iteration}/{maxIterations}</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="w-full bg-cream dark:bg-dark-surface rounded-full h-1.5">
            <div
              className="bg-electric h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Chain Steps */}
      {chainSteps.length > 1 && (
        <div className="px-3 md:px-4 py-2 border-b border-cream-dark dark:border-slate-700">
          <p className="text-xs font-semibold text-navy/60 dark:text-slate-300 mb-2 font-heading">Chain Progress</p>
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {chainSteps.map((step, i) => (
              <div key={i} className="flex items-center gap-1">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    step.status === 'completed'
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                      : step.status === 'running'
                      ? 'bg-electric/20 text-electric'
                      : step.status === 'failed'
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                      : 'bg-cream dark:bg-dark-surface text-navy/40 dark:text-slate-500'
                  }`}
                  title={step.skill_name}
                >
                  {i + 1}
                </div>
                {i < chainSteps.length - 1 && (
                  <div className={`w-3 h-0.5 ${step.status === 'completed' ? 'bg-green-300 dark:bg-green-700' : 'bg-cream-dark dark:bg-slate-700'}`} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {confirmationNeeded && isPaused && (
        <div className="px-4 py-3 bg-yellow-50 dark:bg-yellow-900/10 border-b border-yellow-200 dark:border-yellow-800">
          <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-300 mb-2 font-heading">
            Action Requires Confirmation
          </p>
          <p className="text-sm text-yellow-700 dark:text-yellow-400 mb-3 font-body">
            {confirmationMessage}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => confirm('approve')}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors font-body"
            >
              Approve
            </button>
            <button
              onClick={() => confirm('reject')}
              className="px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-100 rounded-lg hover:bg-red-200 transition-colors font-body"
            >
              Reject
            </button>
          </div>
        </div>
      )}

      {/* Tool Call Log */}
      {toolCalls.length > 0 && (
        <div className="px-3 md:px-4 py-2 border-b border-cream-dark dark:border-slate-700">
          <p className="text-xs font-semibold text-navy/60 dark:text-slate-300 mb-1 font-heading">
            Tool Calls ({toolCalls.length})
          </p>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {toolCalls.map((tc, i) => (
              <div key={i} className="flex items-center gap-2 text-xs font-body min-w-0">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tc.success ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-navy/60 dark:text-slate-400 font-mono shrink-0">{tc.name}</span>
                <span className="text-navy/40 dark:text-slate-500 truncate">{tc.result.slice(0, 60)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Output */}
      {output && (
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-navy/60 dark:text-slate-300 font-heading">Output</p>
            {isComplete && (
              <button
                onClick={() => navigator.clipboard.writeText(output)}
                className="text-xs text-electric hover:text-electric-dark transition-colors font-body"
              >
                Copy
              </button>
            )}
          </div>
          <div className="bg-cream dark:bg-dark-surface rounded-lg p-3 text-sm text-navy dark:text-slate-200 whitespace-pre-wrap max-h-96 overflow-y-auto font-body">
            {output}
          </div>
        </div>
      )}

      {/* Error */}
      {isFailed && job.error_message && (
        <div className="px-4 py-3 bg-red-50 dark:bg-red-900/10">
          <p className="text-sm text-red-700 dark:text-red-400 font-body">{job.error_message}</p>
        </div>
      )}

      {/* Cost Info (on completion) */}
      {isComplete && job.output && (
        <div className="px-3 md:px-4 py-2 border-t border-cream-dark dark:border-slate-700 flex items-center gap-3 md:gap-4 text-xs text-navy/40 dark:text-slate-500 font-body flex-wrap">
          {(job.output as any).cost_usd != null && (
            <span>Cost: ${((job.output as any).cost_usd as number).toFixed(4)}</span>
          )}
          {(job.output as any).iterations != null && (
            <span>Iterations: {(job.output as any).iterations}</span>
          )}
          {(job.output as any).duration_ms != null && (
            <span>Duration: {((job.output as any).duration_ms / 1000).toFixed(1)}s</span>
          )}
        </div>
      )}
    </div>
  );
}
