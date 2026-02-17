'use client';

import { useState, useRef, useEffect } from 'react';

// ============================================================================
// AGENT EXECUTION STREAM
// Real-time display showing tool calls, thinking, confirmations.
// ============================================================================

interface ToolCallEvent {
  id?: string;
  name: string;
  input: Record<string, unknown>;
  result?: string;
  success?: boolean;
  status: 'running' | 'completed' | 'failed' | 'pending_confirmation';
}

interface ChainStepEvent {
  step: number;
  skill_name: string;
  status: 'running' | 'completed' | 'skipped' | 'failed';
}

interface ConfirmationEvent {
  tool_call_id: string;
  name: string;
  input: Record<string, unknown>;
  message: string;
}

export interface ExecutionStreamState {
  text: string;
  toolCalls: ToolCallEvent[];
  chainSteps: ChainStepEvent[];
  thinkingSummary: string | null;
  confirmation: ConfirmationEvent | null;
  isRunning: boolean;
  error: string | null;
  iterations: number;
  tokenCount: number;
}

interface Props {
  state: ExecutionStreamState;
  onApprove?: (toolCallId: string) => void;
  onReject?: (toolCallId: string) => void;
}

function ToolCallCard({ tc, defaultExpanded }: { tc: ToolCallEvent; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);

  const statusConfig = {
    running: { icon: '...', color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-200 dark:border-blue-800' },
    completed: { icon: 'ok', color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-800' },
    failed: { icon: '!', color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-200 dark:border-red-800' },
    pending_confirmation: { icon: '?', color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-800' },
  };

  const cfg = statusConfig[tc.status] || statusConfig.running;
  const isThink = tc.name === 'think';

  return (
    <div className={`rounded-lg border ${cfg.border} ${cfg.bg} overflow-hidden`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        <span className={`text-xs font-mono font-bold ${cfg.color}`}>[{cfg.icon}]</span>
        <span className="text-xs font-semibold text-navy dark:text-slate-200 flex-1 truncate">
          {isThink ? 'Reasoning' : tc.name.replace(/_/g, ' ')}
        </span>
        {tc.status === 'running' && (
          <span className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        )}
        <svg className={`w-3 h-3 text-navy/40 dark:text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-3 pb-2 space-y-1 border-t border-navy/5 dark:border-slate-700">
          {/* Input */}
          <div className="text-[10px] text-navy/40 dark:text-slate-500 uppercase tracking-wider mt-1">Input</div>
          <pre className="text-xs text-navy/60 dark:text-slate-400 font-mono bg-white/50 dark:bg-slate-800/50 p-2 rounded overflow-x-auto max-h-32 overflow-y-auto">
            {JSON.stringify(tc.input, null, 2)}
          </pre>

          {/* Result */}
          {tc.result && (
            <>
              <div className="text-[10px] text-navy/40 dark:text-slate-500 uppercase tracking-wider">Result</div>
              <pre className="text-xs text-navy/60 dark:text-slate-400 font-mono bg-white/50 dark:bg-slate-800/50 p-2 rounded overflow-x-auto max-h-32 overflow-y-auto">
                {tc.result}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ChainStepBadge({ step }: { step: ChainStepEvent }) {
  const config = {
    running: { color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30', icon: '...' },
    completed: { color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30', icon: 'ok' },
    skipped: { color: 'text-gray-500 dark:text-gray-500', bg: 'bg-gray-100 dark:bg-gray-800', icon: '--' },
    failed: { color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30', icon: '!' },
  };
  const cfg = config[step.status] || config.running;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}>
      {step.status === 'running' && <span className="animate-pulse">*</span>}
      Step {step.step + 1}: {step.skill_name}
      <span className="font-mono text-[10px]">[{cfg.icon}]</span>
    </span>
  );
}

export default function AgentExecutionStream({ state, onApprove, onReject }: Props) {
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outputRef.current && state.isRunning) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [state.text, state.isRunning]);

  return (
    <div className="space-y-3">
      {/* Chain steps */}
      {state.chainSteps.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {state.chainSteps.map((step, i) => (
            <ChainStepBadge key={i} step={step} />
          ))}
        </div>
      )}

      {/* Thinking indicator */}
      {state.thinkingSummary && state.isRunning && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
          <span className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-purple-600 dark:text-purple-400">
            Thinking: {state.thinkingSummary}...
          </span>
        </div>
      )}

      {/* Tool calls */}
      {state.toolCalls.length > 0 && (
        <div className="space-y-2">
          {state.toolCalls.map((tc, i) => (
            <ToolCallCard key={i} tc={tc} defaultExpanded={tc.name === 'think' ? false : tc.status === 'running'} />
          ))}
        </div>
      )}

      {/* Confirmation dialog */}
      {state.confirmation && (
        <div className="p-4 rounded-lg border-2 border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">!</span>
            <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">Confirmation Required</span>
          </div>
          <p className="text-sm text-amber-700 dark:text-amber-400 mb-3">{state.confirmation.message}</p>
          <div className="flex gap-2">
            {onApprove && (
              <button
                onClick={() => onApprove(state.confirmation!.tool_call_id)}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
              >
                Approve
              </button>
            )}
            {onReject && (
              <button
                onClick={() => onReject(state.confirmation!.tool_call_id)}
                className="px-4 py-2 text-sm font-semibold rounded-lg border border-red-300 dark:border-red-600 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                Reject
              </button>
            )}
          </div>
        </div>
      )}

      {/* Error */}
      {state.error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-600 dark:text-red-400">
          {state.error}
        </div>
      )}

      {/* Text output */}
      {state.text && (
        <div
          ref={outputRef}
          className="p-4 rounded-lg bg-cream dark:bg-slate-900 text-sm text-navy/80 dark:text-slate-300 max-h-96 overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed"
        >
          {state.text}
          {state.isRunning && <span className="animate-pulse text-electric">|</span>}
        </div>
      )}

      {/* Footer stats */}
      {(state.isRunning || state.toolCalls.length > 0) && (
        <div className="flex items-center gap-4 text-[10px] text-navy/40 dark:text-slate-500 uppercase tracking-wider">
          {state.isRunning && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              Running
            </span>
          )}
          {state.toolCalls.length > 0 && (
            <span>Tools: {state.toolCalls.length}</span>
          )}
        </div>
      )}
    </div>
  );
}
