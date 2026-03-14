'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import type {
  PRRun,
  PRRunStatus,
  PROutlet,
  PREmailDraft,
  PRCostEvent,
  PRVerificationStatus,
  PRQAStatus,
  PRDraftStatus,
  PRPipelineStage,
} from '@/lib/types';

/* ------------------------------------------------------------------ */
/*  Badges                                                             */
/* ------------------------------------------------------------------ */

function RunStatusBadge({ status }: { status: PRRunStatus }) {
  const styles: Record<string, string> = {
    PENDING: 'bg-gray-500/20 text-gray-400',
    RESEARCH: 'bg-blue-500/20 text-blue-400',
    VERIFICATION: 'bg-blue-500/20 text-blue-400',
    QA_LOOP: 'bg-blue-500/20 text-blue-400',
    EMAIL_GEN: 'bg-blue-500/20 text-blue-400',
    GATE_A: 'bg-amber-500/20 text-amber-400',
    GATE_B: 'bg-amber-500/20 text-amber-400',
    GATE_C: 'bg-amber-500/20 text-amber-400',
    COMPLETED: 'bg-green-500/20 text-green-400',
    FAILED: 'bg-red-500/20 text-red-400',
    CANCELLED: 'bg-gray-500/20 text-gray-500',
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${styles[status] || 'bg-gray-500/20 text-gray-400'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function VerificationBadge({ status }: { status: PRVerificationStatus }) {
  const s: Record<string, string> = {
    PENDING: 'bg-gray-500/20 text-gray-400',
    VERIFIED: 'bg-green-500/20 text-green-400',
    FAILED: 'bg-red-500/20 text-red-400',
    SKIPPED: 'bg-gray-500/20 text-gray-500',
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s[status]}`}>{status}</span>;
}

function QABadge({ status }: { status: PRQAStatus }) {
  const s: Record<string, string> = {
    PENDING: 'bg-gray-500/20 text-gray-400',
    PASSED: 'bg-green-500/20 text-green-400',
    FAILED: 'bg-red-500/20 text-red-400',
    NEEDS_REVIEW: 'bg-amber-500/20 text-amber-400',
    RE_EVALUATED: 'bg-blue-500/20 text-blue-400',
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s[status]}`}>{status.replace(/_/g, ' ')}</span>;
}

function DraftBadge({ status }: { status: PRDraftStatus }) {
  const s: Record<string, string> = {
    DRAFT: 'bg-gray-500/20 text-gray-400',
    APPROVED: 'bg-green-500/20 text-green-400',
    REJECTED: 'bg-red-500/20 text-red-400',
    SENT: 'bg-blue-500/20 text-blue-400',
    REVISED: 'bg-amber-500/20 text-amber-400',
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s[status]}`}>{status}</span>;
}

/* ------------------------------------------------------------------ */
/*  Pipeline Visualizer                                                */
/* ------------------------------------------------------------------ */

const PIPELINE_STAGES = [
  { key: 'research', label: 'Research', statuses: ['RESEARCH'] },
  { key: 'verification', label: 'Verification', statuses: ['VERIFICATION'] },
  { key: 'qa', label: 'QA Loop', statuses: ['QA_LOOP'] },
  { key: 'email', label: 'Email Gen', statuses: ['EMAIL_GEN'] },
];

const GATES = ['GATE_A', 'GATE_B', 'GATE_C'];

function getStageIndex(status: PRRunStatus): number {
  if (['PENDING'].includes(status)) return -1;
  if (['RESEARCH', 'GATE_A'].includes(status)) return 0;
  if (['VERIFICATION', 'GATE_B'].includes(status)) return 1;
  if (['QA_LOOP', 'GATE_C'].includes(status)) return 2;
  if (['EMAIL_GEN'].includes(status)) return 3;
  if (['COMPLETED'].includes(status)) return 4;
  return -1;
}

function PipelineVisualizer({ status }: { status: PRRunStatus }) {
  const currentIdx = getStageIndex(status);
  const isGate = GATES.includes(status);

  return (
    <div className="flex items-center gap-2 overflow-x-auto py-2">
      {PIPELINE_STAGES.map((stage, i) => {
        const isCompleted = currentIdx > i || (currentIdx === i && !isGate && status !== stage.statuses[0]);
        const isCurrent = currentIdx === i;
        const isActive = isCurrent && !isGate;
        const isGateStage = isCurrent && isGate;

        return (
          <div key={stage.key} className="flex items-center gap-2">
            {i > 0 && (
              <div className={`w-8 h-0.5 ${currentIdx > i ? 'bg-green-500' : currentIdx === i ? 'bg-amber-400' : 'bg-gray-600'}`} />
            )}
            <div
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium whitespace-nowrap ${
                isCompleted
                  ? 'bg-green-500/10 border-green-500/30 text-green-400'
                  : isActive
                  ? 'bg-blue-500/10 border-blue-500/30 text-blue-400 ring-1 ring-blue-500/50'
                  : isGateStage
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 ring-1 ring-amber-500/50'
                  : 'bg-gray-500/5 border-gray-500/20 text-gray-500'
              }`}
            >
              {currentIdx > i ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              ) : isGateStage ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              ) : isActive ? (
                <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              ) : (
                <div className="w-2 h-2 rounded-full bg-gray-600" />
              )}
              {stage.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Research                                                      */
/* ------------------------------------------------------------------ */

function ResearchTab({ runId }: { runId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['pr-outlets', runId, 'research'],
    queryFn: async () => {
      const res = await fetch(`/api/team-pr/outlets?run_id=${runId}&pipeline_stage=DISCOVERED`, { credentials: 'include' });
      const json = await res.json();
      return json.data;
    },
  });

  const outlets: PROutlet[] = data?.items || [];

  if (isLoading) return <div className="h-32 rounded-lg bg-gray-500/10 animate-pulse" />;
  if (outlets.length === 0) return <p className="text-gray-400 text-sm text-center py-8">No outlets discovered yet.</p>;

  return (
    <div className="rounded-xl border border-gray-500/20 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-500/5 border-b border-gray-500/20">
            <th className="text-left px-4 py-3 font-medium text-gray-400">Name</th>
            <th className="text-left px-4 py-3 font-medium text-gray-400">Type</th>
            <th className="text-left px-4 py-3 font-medium text-gray-400">URL</th>
            <th className="text-right px-4 py-3 font-medium text-gray-400">Relevance</th>
            <th className="text-left px-4 py-3 font-medium text-gray-400">Topics</th>
          </tr>
        </thead>
        <tbody>
          {outlets.map((o) => (
            <tr key={o.id} className="border-b border-gray-500/10 hover:bg-gray-500/5 transition-colors">
              <td className="px-4 py-3 text-white font-medium">{o.name}</td>
              <td className="px-4 py-3 text-gray-400">{o.outlet_type || '-'}</td>
              <td className="px-4 py-3">
                {o.url ? (
                  <a href={o.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline truncate max-w-[200px] block">
                    {new URL(o.url).hostname}
                  </a>
                ) : '-'}
              </td>
              <td className="px-4 py-3 text-right">
                <span className={`font-medium ${o.relevance_score >= 0.7 ? 'text-green-400' : o.relevance_score >= 0.4 ? 'text-amber-400' : 'text-gray-400'}`}>
                  {(o.relevance_score * 100).toFixed(0)}%
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {(o.topics || []).slice(0, 3).map((t) => (
                    <span key={t} className="px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-400 text-[10px]">{t}</span>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Verification                                                  */
/* ------------------------------------------------------------------ */

function VerificationTab({ runId }: { runId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['pr-outlets', runId, 'verified'],
    queryFn: async () => {
      const res = await fetch(`/api/team-pr/outlets?run_id=${runId}&pipeline_stage=VERIFIED`, { credentials: 'include' });
      const json = await res.json();
      return json.data;
    },
  });

  const outlets: PROutlet[] = data?.items || [];

  if (isLoading) return <div className="h-32 rounded-lg bg-gray-500/10 animate-pulse" />;
  if (outlets.length === 0) return <p className="text-gray-400 text-sm text-center py-8">No verified outlets yet.</p>;

  return (
    <div className="rounded-xl border border-gray-500/20 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-500/5 border-b border-gray-500/20">
            <th className="text-left px-4 py-3 font-medium text-gray-400">Name</th>
            <th className="text-left px-4 py-3 font-medium text-gray-400">Status</th>
            <th className="text-left px-4 py-3 font-medium text-gray-400">Contact</th>
            <th className="text-left px-4 py-3 font-medium text-gray-400">Email</th>
            <th className="text-right px-4 py-3 font-medium text-gray-400">Confidence</th>
            <th className="text-right px-4 py-3 font-medium text-gray-400">V.Score</th>
          </tr>
        </thead>
        <tbody>
          {outlets.map((o) => (
            <tr key={o.id} className="border-b border-gray-500/10 hover:bg-gray-500/5 transition-colors">
              <td className="px-4 py-3 text-white font-medium">{o.name}</td>
              <td className="px-4 py-3"><VerificationBadge status={o.verification_status} /></td>
              <td className="px-4 py-3 text-gray-300">{o.contact_name || '-'}</td>
              <td className="px-4 py-3 text-gray-400 text-xs">{o.contact_email || '-'}</td>
              <td className="px-4 py-3 text-right text-gray-300">{o.contact_confidence ? `${(o.contact_confidence * 100).toFixed(0)}%` : '-'}</td>
              <td className="px-4 py-3 text-right text-gray-300">{(o.verification_score * 100).toFixed(0)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: QA                                                            */
/* ------------------------------------------------------------------ */

function QATab({ runId }: { runId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['pr-outlets', runId, 'qa'],
    queryFn: async () => {
      const res = await fetch(`/api/team-pr/outlets?run_id=${runId}&pipeline_stage=QA_PASSED`, { credentials: 'include' });
      const json = await res.json();
      return json.data;
    },
  });

  const outlets: PROutlet[] = data?.items || [];

  if (isLoading) return <div className="h-32 rounded-lg bg-gray-500/10 animate-pulse" />;
  if (outlets.length === 0) return <p className="text-gray-400 text-sm text-center py-8">No QA results yet.</p>;

  return (
    <div className="rounded-xl border border-gray-500/20 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-500/5 border-b border-gray-500/20">
            <th className="text-left px-4 py-3 font-medium text-gray-400">Name</th>
            <th className="text-left px-4 py-3 font-medium text-gray-400">QA Status</th>
            <th className="text-right px-4 py-3 font-medium text-gray-400">QA Score</th>
            <th className="text-left px-4 py-3 font-medium text-gray-400">Notes</th>
          </tr>
        </thead>
        <tbody>
          {outlets.map((o) => (
            <tr key={o.id} className="border-b border-gray-500/10 hover:bg-gray-500/5 transition-colors">
              <td className="px-4 py-3 text-white font-medium">{o.name}</td>
              <td className="px-4 py-3"><QABadge status={o.qa_status} /></td>
              <td className="px-4 py-3 text-right">
                <span className={`font-medium ${o.qa_score >= 0.7 ? 'text-green-400' : o.qa_score >= 0.4 ? 'text-amber-400' : 'text-gray-400'}`}>
                  {(o.qa_score * 100).toFixed(0)}%
                </span>
              </td>
              <td className="px-4 py-3 text-gray-400 text-xs max-w-[300px] truncate">{o.qa_notes || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Emails                                                        */
/* ------------------------------------------------------------------ */

function EmailsTab({ runId }: { runId: string }) {
  const queryClient = useQueryClient();
  const [previewDraft, setPreviewDraft] = useState<PREmailDraft | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['pr-drafts', runId],
    queryFn: async () => {
      const res = await fetch(`/api/team-pr/drafts?run_id=${runId}`, { credentials: 'include' });
      const json = await res.json();
      return json.data;
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (draftId: string) => {
      const res = await fetch(`/api/team-pr/drafts/${draftId}/approve`, { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to approve');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pr-drafts', runId] }),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ draftId, notes }: { draftId: string; notes: string }) => {
      const res = await fetch(`/api/team-pr/drafts/${draftId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reviewer_notes: notes }),
      });
      if (!res.ok) throw new Error('Failed to reject');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pr-drafts', runId] }),
  });

  const drafts: PREmailDraft[] = data?.items || [];

  if (isLoading) return <div className="h-32 rounded-lg bg-gray-500/10 animate-pulse" />;
  if (drafts.length === 0) return <p className="text-gray-400 text-sm text-center py-8">No email drafts yet.</p>;

  return (
    <>
      <div className="rounded-xl border border-gray-500/20 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-500/5 border-b border-gray-500/20">
              <th className="text-left px-4 py-3 font-medium text-gray-400">Subject</th>
              <th className="text-left px-4 py-3 font-medium text-gray-400">Outlet</th>
              <th className="text-left px-4 py-3 font-medium text-gray-400">Angle</th>
              <th className="text-left px-4 py-3 font-medium text-gray-400">Status</th>
              <th className="text-right px-4 py-3 font-medium text-gray-400">Actions</th>
            </tr>
          </thead>
          <tbody>
            {drafts.map((d) => (
              <tr key={d.id} className="border-b border-gray-500/10 hover:bg-gray-500/5 transition-colors">
                <td className="px-4 py-3 text-white font-medium max-w-[250px] truncate">{d.subject}</td>
                <td className="px-4 py-3 text-gray-300">{d.outlet?.name || d.outlet_id.slice(0, 8)}</td>
                <td className="px-4 py-3">
                  {d.pitch_angle && (
                    <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px]">{d.pitch_angle}</span>
                  )}
                </td>
                <td className="px-4 py-3"><DraftBadge status={d.status} /></td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => setPreviewDraft(d)} className="text-xs text-gray-400 hover:text-white transition-colors">Preview</button>
                    {d.status === 'DRAFT' && (
                      <>
                        <button
                          onClick={() => approveMutation.mutate(d.id)}
                          disabled={approveMutation.isPending}
                          className="text-xs text-green-400 hover:text-green-300 transition-colors"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => {
                            const notes = prompt('Rejection notes:');
                            if (notes) rejectMutation.mutate({ draftId: d.id, notes });
                          }}
                          className="text-xs text-red-400 hover:text-red-300 transition-colors"
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Preview Modal */}
      {previewDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#141420] border border-gray-500/20 rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Email Preview</h3>
              <button onClick={() => setPreviewDraft(null)} className="text-gray-400 hover:text-white">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <span className="text-xs text-gray-500">Subject</span>
                <p className="text-white font-medium">{previewDraft.subject}</p>
              </div>
              <div>
                <span className="text-xs text-gray-500">To</span>
                <p className="text-gray-300 text-sm">{previewDraft.outlet?.contact_email || 'No contact email'}</p>
              </div>
              <hr className="border-gray-500/20" />
              <div className="prose prose-invert prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: previewDraft.body_html || previewDraft.body_text }} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab: Costs                                                         */
/* ------------------------------------------------------------------ */

function CostsTab({ runId }: { runId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['pr-costs', runId],
    queryFn: async () => {
      const res = await fetch(`/api/team-pr/costs?run_id=${runId}`, { credentials: 'include' });
      const json = await res.json();
      return json.data;
    },
  });

  const costs: PRCostEvent[] = data?.items || [];
  const totalByService: Record<string, number> = {};
  costs.forEach((c) => {
    totalByService[c.service_name] = (totalByService[c.service_name] || 0) + c.cost_usd;
  });
  const grandTotal = Object.values(totalByService).reduce((s, v) => s + v, 0);

  if (isLoading) return <div className="h-32 rounded-lg bg-gray-500/10 animate-pulse" />;
  if (costs.length === 0) return <p className="text-gray-400 text-sm text-center py-8">No cost events yet.</p>;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(totalByService).map(([service, amount]) => (
          <div key={service} className="p-3 rounded-lg border border-gray-500/20 bg-[#141420]/50">
            <p className="text-xs text-gray-400 capitalize">{service.replace(/_/g, ' ')}</p>
            <p className="text-lg font-bold text-white">${amount.toFixed(4)}</p>
          </div>
        ))}
        <div className="p-3 rounded-lg border border-purple-500/30 bg-purple-500/5">
          <p className="text-xs text-purple-400">Total</p>
          <p className="text-lg font-bold text-purple-300">${grandTotal.toFixed(4)}</p>
        </div>
      </div>

      {/* Details table */}
      <div className="rounded-xl border border-gray-500/20 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-500/5 border-b border-gray-500/20">
              <th className="text-left px-4 py-3 font-medium text-gray-400">Service</th>
              <th className="text-left px-4 py-3 font-medium text-gray-400">Operation</th>
              <th className="text-right px-4 py-3 font-medium text-gray-400">Credits</th>
              <th className="text-right px-4 py-3 font-medium text-gray-400">Cost</th>
              <th className="text-left px-4 py-3 font-medium text-gray-400">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-400">Time</th>
            </tr>
          </thead>
          <tbody>
            {costs.map((c) => (
              <tr key={c.id} className="border-b border-gray-500/10 hover:bg-gray-500/5 transition-colors">
                <td className="px-4 py-3 text-gray-300 capitalize">{c.service_name.replace(/_/g, ' ')}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">{c.operation || '-'}</td>
                <td className="px-4 py-3 text-right text-gray-300">{c.credits_used}</td>
                <td className="px-4 py-3 text-right text-white font-medium">${c.cost_usd.toFixed(4)}</td>
                <td className="px-4 py-3">
                  {c.success ? (
                    <span className="text-green-400 text-xs">OK</span>
                  ) : (
                    <span className="text-red-400 text-xs">Failed</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{new Date(c.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

type TabKey = 'research' | 'verification' | 'qa' | 'emails' | 'costs';

export default function RunDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const runId = params.runId as string;
  const [activeTab, setActiveTab] = useState<TabKey>('research');

  const { data, isLoading } = useQuery({
    queryKey: ['pr-run', runId],
    queryFn: async () => {
      const res = await fetch(`/api/team-pr/runs/${runId}`, { credentials: 'include' });
      const json = await res.json();
      return json.data;
    },
    refetchInterval: 10000, // poll while active
  });

  const gateMutation = useMutation({
    mutationFn: async (action: 'approve' | 'cancel') => {
      const res = await fetch(`/api/team-pr/runs/${runId}/${action}`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Failed to ${action}`);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pr-run', runId] }),
  });

  const run: PRRun | null = data || null;

  if (isLoading) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="h-8 w-48 rounded bg-gray-500/10 animate-pulse mb-6" />
        <div className="h-64 rounded-xl bg-gray-500/10 animate-pulse" />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="p-6 max-w-6xl mx-auto text-center py-20">
        <p className="text-gray-400 mb-4">Run not found.</p>
        <Link href="/team-pr" className="text-purple-400 hover:text-purple-300 text-sm">Back to dashboard</Link>
      </div>
    );
  }

  const isGate = GATES.includes(run.status);

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'research', label: 'Research' },
    { key: 'verification', label: 'Verification' },
    { key: 'qa', label: 'QA' },
    { key: 'emails', label: 'Emails' },
    { key: 'costs', label: 'Costs' },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Back */}
      <Link href="/team-pr" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Back to Dashboard
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-navy dark:text-white">Run</h1>
            <RunStatusBadge status={run.status} />
          </div>
          <p className="text-sm text-gray-400 mt-1">
            {run.client?.name || run.client_id.slice(0, 8)}
            {run.territory?.name && ` - ${run.territory.name}`}
          </p>
        </div>
      </div>

      {/* Pipeline Visualizer */}
      <div className="p-4 rounded-xl border border-gray-500/20 bg-[#141420]/50">
        <PipelineVisualizer status={run.status} />
      </div>

      {/* Gate Actions */}
      {isGate && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-amber-500/30 bg-amber-500/5">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span className="text-sm text-amber-300 flex-1">
            Gate approval required. Review the results and decide whether to continue.
          </span>
          <button
            onClick={() => gateMutation.mutate('approve')}
            disabled={gateMutation.isPending}
            className="px-4 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            Approve & Continue
          </button>
          <button
            onClick={() => gateMutation.mutate('cancel')}
            disabled={gateMutation.isPending}
            className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            Cancel Run
          </button>
        </div>
      )}

      {/* Stats Bar */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {[
          { label: 'Discovered', value: run.outlets_discovered },
          { label: 'Verified', value: run.outlets_verified },
          { label: 'QA Passed', value: run.outlets_qa_passed },
          { label: 'Emails Gen', value: run.emails_generated },
          { label: 'Emails Approved', value: run.emails_approved },
          { label: 'Cost', value: `$${run.total_cost_usd.toFixed(2)}` },
        ].map((s) => (
          <div key={s.label} className="p-3 rounded-lg border border-gray-500/20 bg-[#141420]/50 text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">{s.label}</p>
            <p className="text-lg font-bold text-white mt-0.5">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-500/20">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.key
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'research' && <ResearchTab runId={runId} />}
      {activeTab === 'verification' && <VerificationTab runId={runId} />}
      {activeTab === 'qa' && <QATab runId={runId} />}
      {activeTab === 'emails' && <EmailsTab runId={runId} />}
      {activeTab === 'costs' && <CostsTab runId={runId} />}
    </div>
  );
}
