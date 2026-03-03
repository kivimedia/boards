'use client';

import { useState, useRef, useCallback } from 'react';
import type { LIJobType } from '@/lib/types';

interface JobProgressPanelProps {
  jobType: LIJobType;
  payload: Record<string, unknown>;
  onComplete?: (result: Record<string, unknown>) => void;
  onClose?: () => void;
}

interface ProgressEvent {
  type: 'progress' | 'cost' | 'step_data' | 'complete' | 'error';
  data: Record<string, unknown>;
  timestamp: number;
}

export default function JobProgressPanel({ jobType, payload, onComplete, onClose }: JobProgressPanelProps) {
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [status, setStatus] = useState<'idle' | 'running' | 'complete' | 'error'>('idle');
  const [totalCost, setTotalCost] = useState(0);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [startTime, setStartTime] = useState<number>(0);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const abortRef = useRef<AbortController>();

  const addEvent = useCallback((event: ProgressEvent) => {
    setEvents(prev => [...prev.slice(-100), event]); // Keep last 100 events
  }, []);

  const startJob = useCallback(async () => {
    setStatus('running');
    setEvents([]);
    setTotalCost(0);
    setResult(null);
    const now = Date.now();
    setStartTime(now);

    // Elapsed timer
    timerRef.current = setInterval(() => {
      setElapsed(Date.now() - now);
    }, 1000);

    abortRef.current = new AbortController();

    try {
      const response = await fetch('/api/outreach/jobs/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_type: jobType, payload }),
        signal: abortRef.current.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Stream failed: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let currentEvent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        for (const line of text.split('\n')) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (currentEvent === 'heartbeat') continue;

              if (currentEvent === 'cost') {
                setTotalCost(prev => prev + (data.cost_usd || 0));
              }

              if (currentEvent === 'complete') {
                setResult(data);
                setStatus('complete');
                onComplete?.(data);
              } else if (currentEvent === 'error') {
                setStatus('error');
                addEvent({ type: 'error', data, timestamp: Date.now() });
              } else if (currentEvent === 'done') {
                // Stream ended
              } else {
                addEvent({ type: currentEvent as ProgressEvent['type'], data, timestamp: Date.now() });
              }
            } catch {
              // Invalid JSON in SSE data
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setStatus('error');
        addEvent({
          type: 'error',
          data: { error: (err as Error).message },
          timestamp: Date.now(),
        });
      }
    } finally {
      clearInterval(timerRef.current);
    }
  }, [jobType, payload, onComplete, addEvent]);

  const handleStop = () => {
    abortRef.current?.abort();
    clearInterval(timerRef.current);
    setStatus('error');
  };

  const formatElapsed = (ms: number): string => {
    const secs = Math.floor(ms / 1000);
    const mins = Math.floor(secs / 60);
    return mins > 0 ? `${mins}m ${secs % 60}s` : `${secs}s`;
  };

  return (
    <div className="bg-white dark:bg-navy-800 rounded-lg border border-gray-200 dark:border-navy-700 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 dark:border-navy-700 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-navy dark:text-white">
            {jobType.replace(/_/g, ' ')}
          </h3>
          {status === 'running' && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 animate-pulse">
              Running
            </span>
          )}
          {status === 'complete' && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
              Complete
            </span>
          )}
          {status === 'error' && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">
              Error
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {status === 'running' && (
            <span className="text-xs text-navy/50 dark:text-slate-400">
              {formatElapsed(elapsed)}
            </span>
          )}
          {totalCost > 0 && (
            <span className="text-xs text-navy/50 dark:text-slate-400">
              ${totalCost.toFixed(4)}
            </span>
          )}
          {status === 'idle' && (
            <button
              onClick={startJob}
              className="text-xs px-3 py-1.5 rounded bg-electric text-white hover:bg-electric-bright transition-colors"
            >
              Start
            </button>
          )}
          {status === 'running' && (
            <button
              onClick={handleStop}
              className="text-xs px-3 py-1.5 rounded bg-red-100 text-red-700 hover:bg-red-200"
            >
              Stop
            </button>
          )}
          {onClose && (status === 'complete' || status === 'error') && (
            <button
              onClick={onClose}
              className="text-xs px-3 py-1.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-navy-700 dark:text-slate-300"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Progress Log */}
      <div className="px-4 py-3 max-h-64 overflow-y-auto space-y-1 font-mono text-xs">
        {events.map((event, i) => (
          <div key={i} className={`${
            event.type === 'error'
              ? 'text-red-600 dark:text-red-400'
              : event.type === 'cost'
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-navy/60 dark:text-slate-400'
          }`}>
            <span className="text-navy/30 dark:text-slate-600 mr-2">
              {new Date(event.timestamp).toLocaleTimeString('en-US', { hour12: false })}
            </span>
            {event.data.message || event.data.error || JSON.stringify(event.data)}
          </div>
        ))}
        {events.length === 0 && status === 'idle' && (
          <div className="text-navy/30 dark:text-slate-600 text-center py-4">
            Click Start to begin processing
          </div>
        )}
      </div>

      {/* Result Summary */}
      {result && (
        <div className="px-4 py-3 border-t border-gray-100 dark:border-navy-700 bg-green-50 dark:bg-green-950/30">
          <div className="text-xs font-semibold text-green-700 dark:text-green-300 mb-1">Result</div>
          <pre className="text-xs text-green-600 dark:text-green-400 overflow-auto max-h-24">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
