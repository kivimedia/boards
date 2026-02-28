'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface VpsAgentJob {
  id: string;
  job_type: string;
  status: string;
  payload: Record<string, unknown> | null;
  progress_data: Record<string, unknown> | null;
  progress_message: string | null;
  output: Record<string, unknown> | null;
  output_preview: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface VpsAgentJobState {
  job: VpsAgentJob | null;
  isRunning: boolean;
  isPaused: boolean;
  isComplete: boolean;
  isFailed: boolean;
  output: string;
  toolCalls: { name: string; input: Record<string, unknown>; result: string; success: boolean }[];
  confirmationNeeded: boolean;
  confirmationMessage: string;
  pendingTool: { id: string; name: string; input: Record<string, unknown> } | null;
  chainSteps: { skill_slug: string; skill_name: string; order: number; status: string }[];
  iteration: number;
  maxIterations: number;
  confirm: (decision: 'approve' | 'reject') => Promise<void>;
  startJob: (params: { skill_id: string; input_message: string; board_id?: string }) => Promise<string | null>;
}

export function useVpsAgentJob(initialJobId?: string): VpsAgentJobState {
  const [job, setJob] = useState<VpsAgentJob | null>(null);
  const [jobId, setJobId] = useState<string | null>(initialJobId || null);

  // Subscribe to Realtime updates for this specific job
  useEffect(() => {
    if (!jobId) return;

    const supabase = createClient();

    // Initial fetch
    supabase
      .from('vps_jobs')
      .select('*')
      .eq('id', jobId)
      .single()
      .then(({ data }) => {
        if (data) setJob(data as VpsAgentJob);
      });

    // Realtime subscription
    const channel = supabase
      .channel(`vps-agent-job-${jobId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'vps_jobs',
          filter: `id=eq.${jobId}`,
        },
        (payload) => {
          setJob(payload.new as VpsAgentJob);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [jobId]);

  const progressData = (job?.progress_data ?? {}) as Record<string, unknown>;

  const confirm = useCallback(async (decision: 'approve' | 'reject') => {
    if (!jobId) return;
    await fetch('/api/agents/run-vps/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId, decision }),
    });
  }, [jobId]);

  const startJob = useCallback(async (params: {
    skill_id: string;
    input_message: string;
    board_id?: string;
  }): Promise<string | null> => {
    try {
      const res = await fetch('/api/agents/run-vps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const newJobId = data.data?.job_id;
      if (newJobId) {
        setJobId(newJobId);
        return newJobId;
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  return {
    job,
    isRunning: job?.status === 'running' || job?.status === 'queued',
    isPaused: job?.status === 'paused',
    isComplete: job?.status === 'completed',
    isFailed: job?.status === 'failed',
    output: (progressData.output_so_far as string) || (job?.output as any)?.full_output || '',
    toolCalls: (progressData.tool_calls as any[]) || [],
    confirmationNeeded: !!(progressData.confirmation_needed),
    confirmationMessage: (progressData.confirmation_message as string) || '',
    pendingTool: (progressData.pending_tool as any) || null,
    chainSteps: (progressData.chain_steps as any[]) || [],
    iteration: (progressData.iteration as number) || 0,
    maxIterations: (progressData.max_iterations as number) || 10,
    confirm,
    startJob,
  };
}
