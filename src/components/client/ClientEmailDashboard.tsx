'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ClientEmail, EmailStatus } from '@/lib/types';
import EmailEditor from './EmailEditor';

interface ClientEmailDashboardProps {
  clientId: string;
}

type Tab = 'draft' | 'approved' | 'sent';

const TAB_LABELS: Record<Tab, string> = {
  draft: 'Drafts',
  approved: 'Approved',
  sent: 'Sent',
};

function statusBadge(status: EmailStatus): { text: string; classes: string } {
  switch (status) {
    case 'draft':
      return { text: 'Draft', classes: 'bg-yellow-50 text-yellow-700 border-yellow-200' };
    case 'approved':
      return { text: 'Approved', classes: 'bg-green-50 text-green-700 border-green-200' };
    case 'sent':
      return { text: 'Sent', classes: 'bg-blue-50 text-blue-700 border-blue-200' };
    case 'failed':
      return { text: 'Failed', classes: 'bg-red-50 text-red-700 border-red-200' };
    default:
      return { text: status, classes: 'bg-gray-50 text-gray-700 border-gray-200' };
  }
}

export default function ClientEmailDashboard({ clientId }: ClientEmailDashboardProps) {
  const [activeTab, setActiveTab] = useState<Tab>('draft');
  const [emails, setEmails] = useState<ClientEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafting, setDrafting] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState<ClientEmail | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/emails?status=${activeTab}`);
      if (!res.ok) throw new Error('Failed to load emails');
      const json = await res.json();
      setEmails(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load emails');
    } finally {
      setLoading(false);
    }
  }, [clientId, activeTab]);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  const handleDraftWithAI = async () => {
    setDrafting(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/emails/draft`, {
        method: 'POST',
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to generate draft');
      }
      setActiveTab('draft');
      await fetchEmails();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate draft');
    } finally {
      setDrafting(false);
    }
  };

  const handleSend = async (emailId: string) => {
    setSendingId(emailId);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/emails/${emailId}/send`, {
        method: 'POST',
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to send email');
      }
      await fetchEmails();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send email');
    } finally {
      setSendingId(null);
    }
  };

  const handleApprove = async (emailId: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/emails/${emailId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      });
      if (!res.ok) throw new Error('Failed to approve email');
      await fetchEmails();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve');
    }
  };

  const handleDelete = async (emailId: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/emails/${emailId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete email');
      await fetchEmails();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const handleEditorSave = () => {
    setShowEditor(false);
    setEditingEmail(null);
    fetchEmails();
  };

  if (showEditor) {
    return (
      <div className="rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-navy/50 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">
            {editingEmail ? 'Edit Email' : 'New Email'}
          </h3>
          <button
            onClick={() => { setShowEditor(false); setEditingEmail(null); }}
            className="text-navy/40 dark:text-slate-500 dark:text-slate-500 hover:text-navy dark:hover:text-slate-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-5">
          <EmailEditor
            email={editingEmail ?? undefined}
            clientId={clientId}
            onSave={handleEditorSave}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-navy/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-electric" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading">Client Emails</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setEditingEmail(null); setShowEditor(true); }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium font-body bg-cream-dark dark:bg-slate-800 hover:bg-cream-dark/80 dark:hover:bg-slate-700 text-navy dark:text-slate-100 transition-all"
            >
              + New Email
            </button>
            <button
              onClick={handleDraftWithAI}
              disabled={drafting}
              className="px-3 py-1.5 rounded-lg text-xs font-medium font-body bg-electric text-white hover:bg-electric/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {drafting ? (
                <>
                  <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Drafting...
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Draft with AI
                </>
              )}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-3">
          {(['draft', 'approved', 'sent'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`
                px-3 py-1.5 rounded-lg text-xs font-medium font-body transition-all
                ${activeTab === tab
                  ? 'bg-electric text-white shadow-sm'
                  : 'text-navy/50 dark:text-slate-400 hover:text-navy dark:hover:text-slate-100 hover:bg-cream-dark dark:hover:bg-slate-800'
                }
              `}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-5 mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800 font-body">
          {error}
        </div>
      )}

      {/* Content */}
      <div className="p-5">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="flex items-center gap-3 text-navy/40 dark:text-slate-500">
              <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-sm font-body">Loading emails...</span>
            </div>
          </div>
        ) : emails.length === 0 ? (
          <div className="py-10 text-center">
            <svg className="w-10 h-10 text-navy/15 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <p className="text-sm text-navy/40 dark:text-slate-500 font-body">
              No {activeTab} emails yet.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {emails.map((email) => {
              const badge = statusBadge(email.status);
              return (
                <div
                  key={email.id}
                  className="p-4 rounded-xl border border-cream-dark dark:border-slate-700 hover:border-electric/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading truncate">
                          {email.subject}
                        </h4>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium font-body shrink-0 ${badge.classes}`}>
                          {badge.text}
                        </span>
                        {email.ai_generated && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-electric/10 text-electric border border-electric/20 text-xs font-medium font-body shrink-0">
                            AI
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-navy/50 dark:text-slate-400 font-body line-clamp-2">
                        {email.body.slice(0, 200)}
                      </p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-navy/30 dark:text-slate-600 font-body">
                        <span>To: {email.recipients.join(', ')}</span>
                        <span>{new Date(email.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {email.status === 'draft' && (
                        <>
                          <button
                            onClick={() => { setEditingEmail(email); setShowEditor(true); }}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium font-body text-navy/60 dark:text-slate-400 hover:text-navy dark:hover:text-slate-100 bg-cream-dark/50 dark:bg-slate-800/50 hover:bg-cream-dark dark:hover:bg-slate-800 transition-all"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleApprove(email.id)}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium font-body text-green-700 bg-green-50 hover:bg-green-100 transition-all"
                          >
                            Approve
                          </button>
                        </>
                      )}
                      {email.status === 'approved' && (
                        <button
                          onClick={() => handleSend(email.id)}
                          disabled={sendingId === email.id}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium font-body text-white bg-electric hover:bg-electric/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {sendingId === email.id ? 'Sending...' : 'Send'}
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(email.id)}
                        className="px-2.5 py-1 rounded-lg text-xs font-medium font-body text-red-600/60 hover:text-red-700 hover:bg-red-50 transition-all"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
