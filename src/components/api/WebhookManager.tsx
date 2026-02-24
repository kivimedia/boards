'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Webhook, WebhookEvent } from '@/lib/types';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';

interface Toast {
  type: 'success' | 'error';
  message: string;
}

const WEBHOOK_EVENTS: { event: WebhookEvent; label: string }[] = [
  { event: 'card.created', label: 'Card Created' },
  { event: 'card.updated', label: 'Card Updated' },
  { event: 'card.moved', label: 'Card Moved' },
  { event: 'card.deleted', label: 'Card Deleted' },
  { event: 'comment.added', label: 'Comment Added' },
  { event: 'comment.deleted', label: 'Comment Deleted' },
  { event: 'label.added', label: 'Label Added' },
  { event: 'label.removed', label: 'Label Removed' },
  { event: 'board.created', label: 'Board Created' },
  { event: 'board.updated', label: 'Board Updated' },
  { event: 'member.added', label: 'Member Added' },
  { event: 'member.removed', label: 'Member Removed' },
];

interface WebhookManagerProps {
  onSelectWebhook?: (webhookId: string) => void;
}

export default function WebhookManager({ onSelectWebhook }: WebhookManagerProps) {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);

  // Create state
  const [showCreate, setShowCreate] = useState(false);
  const [createUrl, setCreateUrl] = useState('');
  const [createEvents, setCreateEvents] = useState<WebhookEvent[]>([]);
  const [createDescription, setCreateDescription] = useState('');
  const [saving, setSaving] = useState(false);

  // Secret display state
  const [webhookSecret, setWebhookSecret] = useState<string | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);

  // Edit state
  const [editWebhook, setEditWebhook] = useState<Webhook | null>(null);
  const [editUrl, setEditUrl] = useState('');
  const [editEvents, setEditEvents] = useState<WebhookEvent[]>([]);
  const [editActive, setEditActive] = useState(true);
  const [editDescription, setEditDescription] = useState('');
  const [updating, setUpdating] = useState(false);

  // Delete state
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchWebhooks = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/webhooks');
      const json = await res.json();
      if (json.data) {
        setWebhooks(json.data);
      }
    } catch {
      showToast('error', 'Failed to load webhooks.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWebhooks();
  }, [fetchWebhooks]);

  const toggleEvent = (event: WebhookEvent, list: WebhookEvent[], setter: (v: WebhookEvent[]) => void) => {
    setter(list.includes(event) ? list.filter((e) => e !== event) : [...list, event]);
  };

  const handleCreate = async () => {
    if (!createUrl.trim() || createEvents.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch('/api/v1/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: createUrl.trim(),
          events: createEvents,
          description: createDescription.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create webhook');
      }
      const json = await res.json();
      setWebhookSecret(json.data.webhook.secret);
      setShowCreate(false);
      setCreateUrl('');
      setCreateEvents([]);
      setCreateDescription('');
      await fetchWebhooks();
      showToast('success', 'Webhook created successfully.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to create webhook.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!editWebhook) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/v1/webhooks/${editWebhook.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: editUrl.trim(),
          events: editEvents,
          is_active: editActive,
          description: editDescription.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update webhook');
      }
      setEditWebhook(null);
      await fetchWebhooks();
      showToast('success', 'Webhook updated.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to update webhook.');
    } finally {
      setUpdating(false);
    }
  };

  const handleToggle = async (webhook: Webhook) => {
    try {
      const res = await fetch(`/api/v1/webhooks/${webhook.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !webhook.is_active }),
      });
      if (!res.ok) throw new Error('Failed to toggle');
      await fetchWebhooks();
    } catch {
      showToast('error', 'Failed to toggle webhook.');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/v1/webhooks/${deleteId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      setWebhooks((prev) => prev.filter((w) => w.id !== deleteId));
      setDeleteId(null);
      showToast('success', 'Webhook deleted.');
    } catch {
      showToast('error', 'Failed to delete webhook.');
    } finally {
      setDeleting(false);
    }
  };

  const openEdit = (webhook: Webhook) => {
    setEditWebhook(webhook);
    setEditUrl(webhook.url);
    setEditEvents([...webhook.events]);
    setEditActive(webhook.is_active);
    setEditDescription(webhook.description || '');
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setSecretCopied(true);
      setTimeout(() => setSecretCopied(false), 2000);
    } catch {
      showToast('error', 'Failed to copy.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-3 text-navy/40 dark:text-slate-500 font-body text-sm">
          <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Loading webhooks...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`
            fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg font-body text-sm
            ${toast.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
            }
          `}
        >
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-base">Webhooks</h3>
          <p className="text-navy/50 dark:text-slate-400 font-body text-sm mt-0.5">
            Subscribe to events and receive real-time HTTP notifications.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Create Webhook
        </Button>
      </div>

      {/* Webhooks List */}
      <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 overflow-hidden">
        {webhooks.length === 0 ? (
          <div className="px-6 py-12 text-center text-navy/40 dark:text-slate-500 font-body text-sm">
            No webhooks configured. Create one to receive event notifications.
          </div>
        ) : (
          <div className="divide-y divide-cream-dark dark:divide-slate-700">
            {webhooks.map((webhook) => (
              <div
                key={webhook.id}
                className="px-6 py-4 hover:bg-cream/30 dark:hover:bg-slate-800/30 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => handleToggle(webhook)}
                    className={`w-10 h-5 rounded-full relative transition-colors shrink-0 ${
                      webhook.is_active ? 'bg-green-500' : 'bg-navy/20 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                        webhook.is_active ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-navy dark:text-slate-100 font-body truncate">
                      {webhook.url}
                    </p>
                    {webhook.description && (
                      <p className="text-xs text-navy/40 dark:text-slate-500 font-body mt-0.5">{webhook.description}</p>
                    )}
                    <div className="flex gap-1.5 mt-1.5 flex-wrap">
                      {webhook.events.map((event) => (
                        <span
                          key={event}
                          className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-electric/10 text-electric border border-electric/20"
                        >
                          {event}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5">
                      {webhook.failure_count > 0 && (
                        <span className="text-[11px] text-red-600 font-body">
                          {webhook.failure_count} failures
                        </span>
                      )}
                      {webhook.last_triggered_at && (
                        <span className="text-[11px] text-navy/30 dark:text-slate-600 font-body">
                          Last triggered: {new Date(webhook.last_triggered_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {onSelectWebhook && (
                      <Button variant="ghost" size="sm" onClick={() => onSelectWebhook(webhook.id)}>
                        Deliveries
                      </Button>
                    )}
                    <button
                      onClick={() => openEdit(webhook)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-navy/30 dark:text-slate-600 hover:text-electric hover:bg-electric/10 transition-colors"
                      title="Edit"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setDeleteId(webhook.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-navy/30 dark:text-slate-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      title="Delete"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Webhook Modal */}
      <Modal
        isOpen={showCreate}
        onClose={() => { setShowCreate(false); setCreateUrl(''); setCreateEvents([]); setCreateDescription(''); }}
        size="md"
      >
        <div className="p-6">
          <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-lg mb-2">Create Webhook</h3>
          <p className="text-navy/50 dark:text-slate-400 font-body text-sm mb-6">
            Configure a webhook endpoint to receive event notifications.
          </p>

          <div className="mb-4">
            <Input
              label="Endpoint URL (HTTPS)"
              placeholder="https://your-server.com/webhook"
              value={createUrl}
              onChange={(e) => setCreateUrl(e.target.value)}
            />
          </div>

          <div className="mb-4">
            <Input
              label="Description (optional)"
              placeholder="e.g., Slack integration notifications"
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-semibold text-navy dark:text-slate-100 mb-2 font-body">
              Events
            </label>
            <div className="grid grid-cols-2 gap-2">
              {WEBHOOK_EVENTS.map((ev) => (
                <label
                  key={ev.event}
                  className={`
                    flex items-center gap-2 px-3 py-2 rounded-lg border-2 cursor-pointer transition-colors text-xs
                    ${createEvents.includes(ev.event)
                      ? 'border-electric bg-electric/5'
                      : 'border-cream-dark dark:border-slate-700 hover:border-navy/20 dark:hover:border-slate-600'
                    }
                  `}
                >
                  <input
                    type="checkbox"
                    checked={createEvents.includes(ev.event)}
                    onChange={() => toggleEvent(ev.event, createEvents, setCreateEvents)}
                    className="sr-only"
                  />
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                    createEvents.includes(ev.event) ? 'border-electric bg-electric' : 'border-navy/20 dark:border-slate-600'
                  }`}>
                    {createEvents.includes(ev.event) && (
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  <span className="text-navy dark:text-slate-100 font-body">{ev.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" size="md" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              variant="primary"
              size="md"
              loading={saving}
              disabled={!createUrl.trim() || createEvents.length === 0}
              onClick={handleCreate}
            >
              Create Webhook
            </Button>
          </div>
        </div>
      </Modal>

      {/* Secret Display Modal */}
      <Modal
        isOpen={!!webhookSecret}
        onClose={() => { setWebhookSecret(null); setSecretCopied(false); }}
        size="md"
      >
        <div className="p-6">
          <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-lg mb-2">Webhook Created</h3>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
            <p className="text-amber-800 font-body text-sm">
              Copy this signing secret now. It will not be shown again. Use it to verify webhook signatures.
            </p>
          </div>
          <div className="bg-navy/5 dark:bg-slate-800 rounded-xl p-4 font-mono text-sm text-navy dark:text-slate-100 break-all border border-navy/10 dark:border-slate-700">
            {webhookSecret}
          </div>
          <div className="flex items-center justify-end gap-3 mt-4">
            <Button variant="secondary" size="md" onClick={() => webhookSecret && copyToClipboard(webhookSecret)}>
              {secretCopied ? 'Copied!' : 'Copy Secret'}
            </Button>
            <Button variant="primary" size="md" onClick={() => { setWebhookSecret(null); setSecretCopied(false); }}>
              Done
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Webhook Modal */}
      <Modal
        isOpen={!!editWebhook}
        onClose={() => setEditWebhook(null)}
        size="md"
      >
        <div className="p-6">
          <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-lg mb-4">Edit Webhook</h3>

          <div className="mb-4">
            <Input label="URL" value={editUrl} onChange={(e) => setEditUrl(e.target.value)} />
          </div>

          <div className="mb-4">
            <Input label="Description" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
          </div>

          <div className="mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={editActive}
                onChange={(e) => setEditActive(e.target.checked)}
                className="w-4 h-4 rounded border-navy/20 text-electric focus:ring-electric"
              />
              <span className="text-sm text-navy dark:text-slate-100 font-body">Active</span>
            </label>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-semibold text-navy dark:text-slate-100 mb-2 font-body">Events</label>
            <div className="grid grid-cols-2 gap-2">
              {WEBHOOK_EVENTS.map((ev) => (
                <label
                  key={ev.event}
                  className={`
                    flex items-center gap-2 px-3 py-2 rounded-lg border-2 cursor-pointer transition-colors text-xs
                    ${editEvents.includes(ev.event) ? 'border-electric bg-electric/5' : 'border-cream-dark dark:border-slate-700 hover:border-navy/20 dark:hover:border-slate-600'}
                  `}
                >
                  <input
                    type="checkbox"
                    checked={editEvents.includes(ev.event)}
                    onChange={() => toggleEvent(ev.event, editEvents, setEditEvents)}
                    className="sr-only"
                  />
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                    editEvents.includes(ev.event) ? 'border-electric bg-electric' : 'border-navy/20 dark:border-slate-600'
                  }`}>
                    {editEvents.includes(ev.event) && (
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  <span className="text-navy dark:text-slate-100 font-body">{ev.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" size="md" onClick={() => setEditWebhook(null)}>Cancel</Button>
            <Button variant="primary" size="md" loading={updating} onClick={handleEdit}>Save Changes</Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <Modal isOpen={!!deleteId} onClose={() => setDeleteId(null)} size="sm">
        <div className="p-6">
          <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-lg mb-2">Delete Webhook</h3>
          <p className="text-navy/60 dark:text-slate-400 font-body text-sm mb-6">
            Are you sure? This will delete the webhook and all its delivery history.
          </p>
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" size="md" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="danger" size="md" loading={deleting} onClick={handleDelete}>Delete</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
