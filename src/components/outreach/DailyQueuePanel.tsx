'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import MessagePreview from './MessagePreview';

interface QueueMessage {
  id: string;
  lead_id: string;
  template_number: number | null;
  variant: string | null;
  rotation_variant: number | null;
  message_text: string;
  quality_passed: boolean;
  quality_check: {
    passed: boolean;
    hardBlocks: string[];
    warnings: string[];
    scores: { voice_compliance: number; personalization: number; length_compliance: number; overall: number };
  };
  status: string;
  lead: {
    id: string;
    full_name: string;
    job_position: string | null;
    company_name: string | null;
    lead_score: number;
    pipeline_stage: string;
    website: string | null;
    linkedin_url: string | null;
  } | null;
}

interface QueueBatch {
  id: string;
  target_date: string;
  batch_size: number;
  approved: boolean;
  status: string;
  warmup_week: number | null;
}

interface QueueStats {
  warmup_week: number;
  daily_limit: number;
  weekly_limit: number;
  weekly_sent: number;
  is_paused: boolean;
}

export default function DailyQueuePanel() {
  const [batch, setBatch] = useState<QueueBatch | null>(null);
  const [messages, setMessages] = useState<QueueMessage[]>([]);
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewMessage, setPreviewMessage] = useState<QueueMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState<string | null>(null);

  const handleSendBatch = async () => {
    if (!batch) return;
    if (!confirm(`Send ${batch.batch_size} messages via LinkedIn browser automation? This will take several minutes.`)) return;
    setSending(true);
    setSendProgress('Starting...');
    try {
      const res = await fetch('/api/outreach/queue/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch_id: batch.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to send batch');
        return;
      }
      setSendProgress(`Job queued (${data.data.batch_size} messages). Processing on VPS...`);
      // Poll for completion
      const jobId = data.data.job_id;
      const pollInterval = setInterval(async () => {
        try {
          const jobRes = await fetch(`/api/outreach/jobs/${jobId}`);
          const jobData = await jobRes.json();
          if (jobData.data?.status === 'COMPLETED') {
            clearInterval(pollInterval);
            setSendProgress(null);
            setSending(false);
            fetchQueue();
          } else if (jobData.data?.status === 'FAILED') {
            clearInterval(pollInterval);
            setSendProgress(null);
            setSending(false);
            alert(`Send batch failed: ${jobData.data.error_message || 'Unknown error'}`);
            fetchQueue();
          } else if (jobData.data?.result?.sent !== undefined) {
            setSendProgress(`Sending... ${jobData.data.result.sent}/${batch.batch_size} sent`);
          }
        } catch { /* continue polling */ }
      }, 5000);
    } finally {
      // Don't reset sending here - let polling handle it
    }
  };

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/outreach/queue?date=${selectedDate}`);
      const data = await res.json();
      if (res.ok) {
        setBatch(data.data.batch);
        setMessages(data.data.messages || []);
        setStats(data.data.stats);
        // Select all quality-passed messages by default
        const passed = new Set<string>();
        (data.data.messages || []).forEach((m: QueueMessage) => {
          if (m.quality_passed && m.lead) passed.add(m.lead_id);
        });
        setSelected(passed);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchQueue(); }, [selectedDate]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/outreach/queue/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate }),
      });
      if (res.ok) fetchQueue();
    } finally {
      setGenerating(false);
    }
  };

  const handleApprove = async () => {
    if (!batch) return;
    setApproving(true);
    try {
      await fetch('/api/outreach/queue/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batch_id: batch.id,
          lead_ids: Array.from(selected),
        }),
      });
      fetchQueue();
    } finally {
      setApproving(false);
    }
  };

  const toggleSelect = (leadId: string) => {
    const next = new Set(selected);
    if (next.has(leadId)) next.delete(leadId);
    else next.add(leadId);
    setSelected(next);
  };

  const toggleAll = () => {
    if (selected.size === messages.filter(m => m.quality_passed).length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(messages.filter(m => m.quality_passed).map(m => m.lead_id)));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/outreach" className="text-sm text-navy/40 dark:text-slate-500 hover:text-electric font-body transition-colors">
            Dashboard
          </Link>
          <span className="text-navy/20 dark:text-slate-700">/</span>
          <span className="text-sm font-semibold text-navy dark:text-white font-heading">Daily Queue</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border border-navy/10 dark:border-slate-700 bg-white dark:bg-dark-card text-navy dark:text-slate-100 font-body"
          />
          {!batch && (
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="px-4 py-2 text-sm font-semibold text-white bg-electric hover:bg-electric-bright rounded-lg disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {generating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Generating...
                </>
              ) : 'Generate Batch'}
            </button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-white dark:bg-dark-card rounded-xl p-3 border border-cream-dark dark:border-slate-700">
            <p className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase font-heading">Warm-up Week</p>
            <p className="text-lg font-bold text-navy dark:text-white font-heading">{stats.warmup_week}</p>
          </div>
          <div className="bg-white dark:bg-dark-card rounded-xl p-3 border border-cream-dark dark:border-slate-700">
            <p className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase font-heading">Daily Limit</p>
            <p className="text-lg font-bold text-navy dark:text-white font-heading">{stats.daily_limit}</p>
          </div>
          <div className="bg-white dark:bg-dark-card rounded-xl p-3 border border-cream-dark dark:border-slate-700">
            <p className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase font-heading">Weekly Sent</p>
            <p className="text-lg font-bold text-navy dark:text-white font-heading">
              {stats.weekly_sent}/{stats.weekly_limit}
            </p>
          </div>
          <div className="bg-white dark:bg-dark-card rounded-xl p-3 border border-cream-dark dark:border-slate-700">
            <p className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase font-heading">Batch Size</p>
            <p className="text-lg font-bold text-electric font-heading">{messages.length}</p>
          </div>
          <div className="bg-white dark:bg-dark-card rounded-xl p-3 border border-cream-dark dark:border-slate-700">
            <p className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase font-heading">Status</p>
            <p className={`text-lg font-bold font-heading ${
              stats.is_paused ? 'text-red-500' :
              batch?.status === 'approved' ? 'text-green-600 dark:text-green-400' :
              batch?.status === 'sent' ? 'text-blue-600 dark:text-blue-400' :
              'text-amber-500'
            }`}>
              {stats.is_paused ? 'Paused' : batch?.status?.replace(/_/g, ' ') || 'No batch'}
            </p>
          </div>
        </div>
      )}

      {/* Paused warning */}
      {stats?.is_paused && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <p className="text-xs text-red-700 dark:text-red-300 font-semibold font-heading">
            Outreach is paused. No batches will be generated until resumed in Settings.
          </p>
        </div>
      )}

      {/* No batch state */}
      {!batch && !generating && (
        <div className="text-center py-16 bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700">
          <p className="text-sm text-navy/40 dark:text-slate-500 font-body">No batch for {selectedDate}</p>
          <p className="text-xs text-navy/30 dark:text-slate-600 mt-1">Click "Generate Batch" to create today's queue</p>
        </div>
      )}

      {/* Messages list */}
      {messages.length > 0 && (
        <>
          {/* Bulk controls */}
          {batch?.status === 'pending' && (
            <div className="flex items-center justify-between p-3 bg-cream dark:bg-dark-surface rounded-lg border border-cream-dark dark:border-slate-700">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selected.size === messages.filter(m => m.quality_passed).length && messages.length > 0}
                  onChange={toggleAll}
                  className="rounded border-navy/20 dark:border-slate-600"
                />
                <span className="text-xs font-semibold text-navy/60 dark:text-slate-400 font-heading">
                  {selected.size} of {messages.length} selected
                </span>
              </div>
              <button
                onClick={handleApprove}
                disabled={approving || selected.size === 0}
                className="px-4 py-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {approving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Approving...
                  </>
                ) : `Approve ${selected.size} Messages`}
              </button>
            </div>
          )}

          {/* Send Batch button - shows when approved */}
          {batch?.status === 'approved' && (
            <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/10 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex-1">
                <p className="text-sm font-semibold text-green-800 dark:text-green-300 font-heading">
                  Batch approved - ready to send
                </p>
                {sendProgress && (
                  <p className="text-xs text-green-700 dark:text-green-400 mt-1 font-body">{sendProgress}</p>
                )}
              </div>
              <button
                onClick={handleSendBatch}
                disabled={sending}
                className="px-4 py-2 text-sm font-semibold text-white bg-electric hover:bg-electric-bright rounded-lg disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {sending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Sending...
                  </>
                ) : `Send ${batch.batch_size} via LinkedIn`}
              </button>
            </div>
          )}

          <div className="space-y-2">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`p-4 rounded-xl border transition-colors ${
                  !msg.quality_passed
                    ? 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10'
                    : selected.has(msg.lead_id)
                    ? 'border-electric/30 dark:border-electric/20 bg-electric/5 dark:bg-electric/5'
                    : 'border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-card'
                }`}
              >
                <div className="flex items-start gap-3">
                  {batch?.status === 'pending' && (
                    <input
                      type="checkbox"
                      checked={selected.has(msg.lead_id)}
                      onChange={() => toggleSelect(msg.lead_id)}
                      disabled={!msg.quality_passed}
                      className="mt-1 rounded border-navy/20 dark:border-slate-600 shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Link
                        href={`/outreach/leads/${msg.lead_id}`}
                        className="text-sm font-semibold text-navy dark:text-white hover:text-electric font-heading transition-colors"
                      >
                        {msg.lead?.full_name || 'Unknown'}
                      </Link>
                      {msg.template_number && (
                        <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-electric/10 text-electric rounded">
                          T{msg.template_number}{msg.variant ? msg.variant : ''}
                        </span>
                      )}
                      {msg.rotation_variant && (
                        <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300 rounded">
                          R{msg.rotation_variant}
                        </span>
                      )}
                      <span className={`px-1.5 py-0.5 text-[9px] font-semibold rounded ${
                        msg.quality_passed
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                          : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                      }`}>
                        Q:{msg.quality_check?.scores?.overall || 0}
                      </span>
                      {msg.lead?.lead_score !== undefined && (
                        <span className="text-[10px] text-navy/30 dark:text-slate-600">
                          Score: {msg.lead.lead_score}
                        </span>
                      )}
                    </div>
                    {msg.lead?.job_position && (
                      <p className="text-[10px] text-navy/40 dark:text-slate-500 font-body mb-2">
                        {msg.lead.job_position}{msg.lead.company_name ? ` at ${msg.lead.company_name}` : ''}
                      </p>
                    )}
                    <p className="text-xs text-navy/60 dark:text-slate-400 font-body line-clamp-2 whitespace-pre-wrap">
                      {msg.message_text}
                    </p>

                    {/* Quality issues */}
                    {(msg.quality_check?.hardBlocks?.length > 0 || msg.quality_check?.warnings?.length > 0) && (
                      <div className="mt-2 space-y-1">
                        {msg.quality_check.hardBlocks.map((block, i) => (
                          <p key={i} className="text-[10px] text-red-600 dark:text-red-400 font-body flex items-center gap-1">
                            <span className="w-3 h-3 flex items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30 text-[8px] shrink-0">!</span>
                            {block}
                          </p>
                        ))}
                        {msg.quality_check.warnings.map((warn, i) => (
                          <p key={i} className="text-[10px] text-amber-600 dark:text-amber-400 font-body flex items-center gap-1">
                            <span className="w-3 h-3 flex items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30 text-[8px] shrink-0">!</span>
                            {warn}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setPreviewMessage(msg)}
                    className="text-[10px] text-electric hover:text-electric-bright font-semibold shrink-0 transition-colors"
                  >
                    Preview
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Message preview modal */}
      {previewMessage && (
        <MessagePreview
          message={previewMessage}
          onClose={() => setPreviewMessage(null)}
          onSave={async (updatedText) => {
            try {
              const res = await fetch(`/api/outreach/messages/${previewMessage.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message_text: updatedText }),
              });
              if (!res.ok) {
                const data = await res.json();
                alert(data.error || 'Failed to save');
                return;
              }
            } catch {
              alert('Failed to save message');
              return;
            }
            setPreviewMessage(null);
            fetchQueue();
          }}
        />
      )}
    </div>
  );
}
