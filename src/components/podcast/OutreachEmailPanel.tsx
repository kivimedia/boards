'use client';

import { useState, useEffect } from 'react';
import type { PGAOutreachRun } from '@/lib/types';

const SEND_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-300',
  approved: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  sent: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  bounced: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  replied: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  unsubscribed: 'bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-400',
};

interface OutreachEmailPanelProps {
  candidateId: string;
  candidateName: string;
  hasDossier: boolean;
  onRefresh?: () => void;
}

interface OutreachConfig {
  sender_name: string;
  sender_title: string;
  podcast_name: string;
  booking_url: string;
  reply_to_email: string;
}

const DEFAULT_CONFIG: OutreachConfig = {
  sender_name: '',
  sender_title: '',
  podcast_name: '',
  booking_url: '',
  reply_to_email: '',
};

export default function OutreachEmailPanel({
  candidateId,
  candidateName,
  hasDossier,
  onRefresh,
}: OutreachEmailPanelProps) {
  const [emails, setEmails] = useState<PGAOutreachRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [config, setConfig] = useState<OutreachConfig>(DEFAULT_CONFIG);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null);

  useEffect(() => {
    loadEmails();
    loadSavedConfig();
  }, [candidateId]);

  const loadSavedConfig = () => {
    try {
      const saved = localStorage.getItem('outreach_config');
      if (saved) {
        setConfig({ ...DEFAULT_CONFIG, ...JSON.parse(saved) });
      }
    } catch {
      // ignore
    }
  };

  const saveConfig = (c: OutreachConfig) => {
    setConfig(c);
    try {
      localStorage.setItem('outreach_config', JSON.stringify(c));
    } catch {
      // ignore
    }
  };

  const loadEmails = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/podcast/candidates/${candidateId}/outreach`);
      const json = await res.json();
      if (json.data?.outreach_runs) {
        setEmails(json.data.outreach_runs);
      }
    } catch (err) {
      console.error('Failed to load outreach:', err);
    } finally {
      setLoading(false);
    }
  };

  const generateEmail = async () => {
    if (!config.sender_name || !config.podcast_name || !config.booking_url || !config.reply_to_email) {
      setShowConfig(true);
      setError('Please fill in all outreach config fields');
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      const res = await fetch(`/api/podcast/candidates/${candidateId}/outreach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error || `HTTP ${res.status}`);
        return;
      }

      await loadEmails();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleAction = async (outreachId: string, action: string, responseType?: string) => {
    setActionLoading(outreachId);
    try {
      const res = await fetch(`/api/podcast/candidates/${candidateId}/outreach`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outreach_id: outreachId, action, response_type: responseType }),
      });

      if (res.ok) {
        await loadEmails();
        onRefresh?.();
      }
    } catch (err) {
      console.error('Action failed:', err);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <div className="w-4 h-4 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-navy/40 dark:text-slate-500 uppercase">
          Outreach Emails ({emails.length}/3)
        </h4>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="text-[10px] text-navy/40 dark:text-slate-500 hover:text-electric transition-colors"
          >
            Config
          </button>
          {hasDossier && emails.length < 3 && (
            <button
              onClick={generateEmail}
              disabled={generating}
              className="px-3 py-1 text-xs font-semibold rounded-lg bg-electric text-white hover:bg-electric/90 disabled:opacity-50 transition-colors"
            >
              {generating ? 'Generating...' : `Generate Touch ${emails.length + 1}`}
            </button>
          )}
          {!hasDossier && (
            <span className="text-[10px] text-amber-600 dark:text-amber-400">
              Generate dossier first
            </span>
          )}
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* Config panel */}
      {showConfig && (
        <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-3 space-y-2 border border-navy/5 dark:border-slate-700">
          <span className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase">
            Outreach Config (saved locally)
          </span>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Your name"
              value={config.sender_name}
              onChange={(e) => saveConfig({ ...config, sender_name: e.target.value })}
              className="px-2 py-1.5 text-xs rounded border border-navy/10 dark:border-slate-700 bg-white dark:bg-slate-800 text-navy dark:text-slate-100"
            />
            <input
              type="text"
              placeholder="Your title"
              value={config.sender_title}
              onChange={(e) => saveConfig({ ...config, sender_title: e.target.value })}
              className="px-2 py-1.5 text-xs rounded border border-navy/10 dark:border-slate-700 bg-white dark:bg-slate-800 text-navy dark:text-slate-100"
            />
            <input
              type="text"
              placeholder="Podcast name"
              value={config.podcast_name}
              onChange={(e) => saveConfig({ ...config, podcast_name: e.target.value })}
              className="px-2 py-1.5 text-xs rounded border border-navy/10 dark:border-slate-700 bg-white dark:bg-slate-800 text-navy dark:text-slate-100"
            />
            <input
              type="text"
              placeholder="Booking URL"
              value={config.booking_url}
              onChange={(e) => saveConfig({ ...config, booking_url: e.target.value })}
              className="px-2 py-1.5 text-xs rounded border border-navy/10 dark:border-slate-700 bg-white dark:bg-slate-800 text-navy dark:text-slate-100"
            />
            <input
              type="email"
              placeholder="Reply-to email"
              value={config.reply_to_email}
              onChange={(e) => saveConfig({ ...config, reply_to_email: e.target.value })}
              className="col-span-2 px-2 py-1.5 text-xs rounded border border-navy/10 dark:border-slate-700 bg-white dark:bg-slate-800 text-navy dark:text-slate-100"
            />
          </div>
        </div>
      )}

      {/* Email list */}
      {emails.length === 0 ? (
        <div className="text-center py-6 bg-slate-50 dark:bg-slate-900 rounded-lg border border-dashed border-navy/10 dark:border-slate-700">
          <p className="text-xs text-navy/40 dark:text-slate-500">
            No outreach emails generated yet
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {emails.map((email) => {
            const isExpanded = expandedEmailId === email.id;
            const isActioning = actionLoading === email.id;
            const statusColor = SEND_STATUS_COLORS[email.send_status] || SEND_STATUS_COLORS.draft;

            return (
              <div
                key={email.id}
                className="bg-white dark:bg-slate-800 rounded-lg border border-navy/5 dark:border-slate-700 overflow-hidden"
              >
                {/* Email header */}
                <div
                  className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-cream/30 dark:hover:bg-slate-700/30 transition-colors"
                  onClick={() => setExpandedEmailId(isExpanded ? null : email.id)}
                >
                  <span className="text-xs font-bold text-electric shrink-0">
                    #{email.touch_number}
                  </span>
                  <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${statusColor}`}>
                    {email.send_status}
                  </span>
                  <span className="text-sm text-navy dark:text-slate-200 font-medium truncate flex-1">
                    {email.subject || 'No subject'}
                  </span>
                  {email.copy_validation && (
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        (email.copy_validation as any).passed
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                      }`}
                    >
                      {(email.copy_validation as any).passed ? 'Valid' : 'Issues'}
                    </span>
                  )}
                  <svg
                    className={`w-3.5 h-3.5 text-navy/30 dark:text-slate-500 transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {/* Email body (expanded) */}
                {isExpanded && (
                  <div className="border-t border-navy/5 dark:border-slate-700 p-3 space-y-3">
                    <div>
                      <span className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase">Subject</span>
                      <p className="text-sm text-navy dark:text-slate-200 font-medium mt-0.5">{email.subject}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold text-navy/40 dark:text-slate-500 uppercase">Body</span>
                      <div className="mt-1 text-sm text-navy/70 dark:text-slate-300 whitespace-pre-wrap bg-slate-50 dark:bg-slate-900 rounded-lg p-3 border border-navy/5 dark:border-slate-700 max-h-48 overflow-y-auto font-body">
                        {email.body}
                      </div>
                    </div>

                    {/* Validation issues */}
                    {email.copy_validation && !(email.copy_validation as any).passed && (
                      <div>
                        <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase">Validation Issues</span>
                        <div className="mt-1 space-y-0.5">
                          {((email.copy_validation as any).issues || []).map((issue: string, idx: number) => (
                            <p key={idx} className="text-[10px] text-amber-600 dark:text-amber-400">
                              &#8226; {issue}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 pt-2 border-t border-navy/5 dark:border-slate-700">
                      {email.send_status === 'draft' && (
                        <button
                          onClick={() => handleAction(email.id, 'approve')}
                          disabled={isActioning}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                          {isActioning ? '...' : 'Approve'}
                        </button>
                      )}
                      {email.send_status === 'approved' && (
                        <button
                          onClick={() => handleAction(email.id, 'mark_sent')}
                          disabled={isActioning}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                        >
                          {isActioning ? '...' : 'Mark as Sent'}
                        </button>
                      )}
                      {email.send_status === 'sent' && (
                        <>
                          <button
                            onClick={() => handleAction(email.id, 'record_response', 'interested')}
                            disabled={isActioning}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 hover:bg-amber-200 disabled:opacity-50 transition-colors"
                          >
                            Replied
                          </button>
                          <button
                            onClick={() => handleAction(email.id, 'unsubscribe')}
                            disabled={isActioning}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-400 hover:bg-slate-200 disabled:opacity-50 transition-colors"
                          >
                            Unsubscribed
                          </button>
                        </>
                      )}
                      <div className="flex-1" />
                      {email.cost_usd != null && (
                        <span className="text-[10px] text-navy/30 dark:text-slate-600 self-center">
                          ${Number(email.cost_usd).toFixed(3)}
                        </span>
                      )}
                      <button
                        onClick={() => {
                          const text = `Subject: ${email.subject}\n\n${email.body}`;
                          navigator.clipboard.writeText(text);
                        }}
                        className="px-2 py-1 text-[10px] text-navy/40 dark:text-slate-500 hover:text-electric transition-colors"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
