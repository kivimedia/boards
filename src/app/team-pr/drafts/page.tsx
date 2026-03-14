'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { PREmailDraft, PRDraftStatus, PRRun } from '@/lib/types';

/* ------------------------------------------------------------------ */
/*  Badge                                                              */
/* ------------------------------------------------------------------ */

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
/*  Edit Modal                                                         */
/* ------------------------------------------------------------------ */

function EditDraftModal({
  draft,
  onClose,
}: {
  draft: PREmailDraft;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body_text);

  const updateMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/team-pr/drafts/${draft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to update');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pr-drafts-queue'] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#141420] border border-gray-500/20 rounded-2xl w-full max-w-xl sm:max-w-2xl max-h-[80vh] overflow-y-auto p-6 mx-4 sm:mx-0">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Edit Draft</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Subject</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-gray-500/10 border border-gray-500/20 text-white text-sm outline-none focus:border-purple-500/50"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={12}
              className="w-full px-3 py-2 rounded-lg bg-gray-500/10 border border-gray-500/20 text-white text-sm outline-none focus:border-purple-500/50 resize-none font-mono"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
            <button
              onClick={() => updateMutation.mutate({ subject, body_text: body })}
              disabled={updateMutation.isPending}
              className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Reject Modal                                                       */
/* ------------------------------------------------------------------ */

function RejectModal({ draftId, onClose }: { draftId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');

  const rejectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/team-pr/drafts/${draftId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reviewer_notes: notes }),
      });
      if (!res.ok) throw new Error('Failed to reject');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pr-drafts-queue'] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#141420] border border-gray-500/20 rounded-2xl w-full max-w-md p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Reject Draft</h3>
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-1">Notes for rejection</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 rounded-lg bg-gray-500/10 border border-gray-500/20 text-white text-sm outline-none focus:border-purple-500/50 resize-none"
            placeholder="Reason for rejection..."
          />
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
          <button
            onClick={() => rejectMutation.mutate()}
            disabled={rejectMutation.isPending || !notes.trim()}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            {rejectMutation.isPending ? 'Rejecting...' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

const STATUSES: PRDraftStatus[] = ['DRAFT', 'APPROVED', 'REJECTED', 'SENT', 'REVISED'];

export default function DraftsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [runFilter, setRunFilter] = useState<string>('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingDraft, setEditingDraft] = useState<PREmailDraft | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const queryParams = new URLSearchParams();
  if (statusFilter) queryParams.set('status', statusFilter);
  if (runFilter) queryParams.set('run_id', runFilter);

  const { data, isLoading } = useQuery({
    queryKey: ['pr-drafts-queue', statusFilter, runFilter],
    queryFn: async () => {
      const res = await fetch(`/api/team-pr/drafts?${queryParams.toString()}`, { credentials: 'include' });
      const json = await res.json();
      return json.data;
    },
  });

  const { data: runsData } = useQuery({
    queryKey: ['pr-runs', 'all'],
    queryFn: async () => {
      const res = await fetch('/api/team-pr/runs', { credentials: 'include' });
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pr-drafts-queue'] }),
  });

  const batchApproveMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch('/api/team-pr/drafts/batch-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ draft_ids: ids }),
      });
      if (!res.ok) throw new Error('Failed to batch approve');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pr-drafts-queue'] });
      setSelected(new Set());
    },
  });

  const drafts: PREmailDraft[] = data?.items || [];
  const runs: PRRun[] = runsData?.items || [];
  const pendingCount = drafts.filter((d) => d.status === 'DRAFT').length;

  function toggleSelect(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-navy dark:text-white">Email Drafts</h1>
          {pendingCount > 0 && (
            <span className="rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-500/20 text-amber-400">
              {pendingCount} pending
            </span>
          )}
        </div>
        {selected.size > 0 && (
          <button
            onClick={() => batchApproveMutation.mutate(Array.from(selected))}
            disabled={batchApproveMutation.isPending}
            className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            Batch Approve ({selected.size})
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg bg-gray-500/10 border border-gray-500/20 text-white text-sm outline-none"
        >
          <option value="">All Statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={runFilter}
          onChange={(e) => setRunFilter(e.target.value)}
          className="px-3 py-2 rounded-lg bg-gray-500/10 border border-gray-500/20 text-white text-sm outline-none"
        >
          <option value="">All Runs</option>
          {runs.map((r) => (
            <option key={r.id} value={r.id}>
              {r.client?.name || r.client_id.slice(0, 8)} - {new Date(r.created_at).toLocaleDateString()}
            </option>
          ))}
        </select>
      </div>

      {/* Draft Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-48 rounded-xl bg-gray-500/10 animate-pulse" />)}
        </div>
      ) : drafts.length === 0 ? (
        <div className="rounded-xl border border-gray-500/20 p-12 text-center">
          <p className="text-gray-400">No email drafts found. Run a PR pipeline to generate email drafts.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {drafts.map((draft) => (
            <div
              key={draft.id}
              className={`rounded-xl border p-5 transition-all ${
                selected.has(draft.id)
                  ? 'border-purple-500/50 bg-purple-500/5'
                  : 'border-gray-500/20 bg-[#141420]/50 hover:border-gray-500/40'
              }`}
            >
              {/* Top row */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  {draft.status === 'DRAFT' && (
                    <input
                      type="checkbox"
                      checked={selected.has(draft.id)}
                      onChange={() => toggleSelect(draft.id)}
                      className="rounded border-gray-500"
                    />
                  )}
                  <div>
                    <p className="text-sm text-gray-400">{draft.outlet?.name || draft.outlet_id.slice(0, 8)}</p>
                    <p className="text-[10px] text-gray-600">{draft.outlet?.outlet_code}</p>
                  </div>
                </div>
                <DraftBadge status={draft.status} />
              </div>

              {/* Subject */}
              <h3 className="text-white font-semibold text-sm mb-2 line-clamp-1">{draft.subject}</h3>

              {/* Body preview */}
              <p className="text-gray-400 text-xs line-clamp-3 mb-3">
                {draft.body_text}
              </p>

              {/* Contact */}
              {draft.outlet?.contact_email && (
                <p className="text-xs text-gray-500 mb-2">
                  To: {draft.outlet.contact_name && `${draft.outlet.contact_name} - `}{draft.outlet.contact_email}
                </p>
              )}

              {/* Pitch angle */}
              {draft.pitch_angle && (
                <span className="inline-block px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] mb-3">
                  {draft.pitch_angle}
                </span>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2 border-t border-gray-500/10">
                {draft.status === 'DRAFT' && (
                  <>
                    <button
                      onClick={() => approveMutation.mutate(draft.id)}
                      disabled={approveMutation.isPending}
                      className="px-3 py-1.5 rounded-lg bg-green-600/20 text-green-400 hover:bg-green-600/30 text-xs font-medium transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => setRejectingId(draft.id)}
                      className="px-3 py-1.5 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30 text-xs font-medium transition-colors"
                    >
                      Reject
                    </button>
                  </>
                )}
                <button
                  onClick={() => setEditingDraft(draft)}
                  className="px-3 py-1.5 rounded-lg bg-gray-500/10 text-gray-400 hover:bg-gray-500/20 text-xs font-medium transition-colors"
                >
                  Edit
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {editingDraft && <EditDraftModal draft={editingDraft} onClose={() => setEditingDraft(null)} />}
      {rejectingId && <RejectModal draftId={rejectingId} onClose={() => setRejectingId(null)} />}
    </div>
  );
}
