'use client';

import { useState } from 'react';
import type { ClientEmail, EmailTone } from '@/lib/types';

interface EmailEditorProps {
  email?: ClientEmail;
  clientId: string;
  onSave: () => void;
}

const TONE_OPTIONS: { value: EmailTone; label: string }[] = [
  { value: 'formal', label: 'Formal' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'casual', label: 'Casual' },
];

export default function EmailEditor({ email, clientId, onSave }: EmailEditorProps) {
  const [subject, setSubject] = useState(email?.subject ?? '');
  const [body, setBody] = useState(email?.body ?? '');
  const [tone, setTone] = useState<EmailTone>(email?.tone ?? 'friendly');
  const [recipientsText, setRecipientsText] = useState(
    email?.recipients.join(', ') ?? ''
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const recipients = recipientsText
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);

    if (!subject.trim()) {
      setError('Subject is required');
      return;
    }
    if (!body.trim()) {
      setError('Body is required');
      return;
    }
    if (recipients.length === 0) {
      setError('At least one recipient is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const isUpdate = !!email;
      const url = isUpdate
        ? `/api/clients/${clientId}/emails/${email.id}`
        : `/api/clients/${clientId}/emails`;
      const method = isUpdate ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: subject.trim(),
          body: body.trim(),
          tone,
          recipients,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to save email');
      }

      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800 font-body">
          {error}
        </div>
      )}

      {/* Subject */}
      <div>
        <label className="block text-xs font-semibold text-navy/60 dark:text-slate-400 uppercase tracking-wider font-heading mb-1.5">
          Subject
        </label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Email subject..."
          className="w-full p-2.5 rounded-xl bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body"
        />
      </div>

      {/* Recipients */}
      <div>
        <label className="block text-xs font-semibold text-navy/60 dark:text-slate-400 uppercase tracking-wider font-heading mb-1.5">
          Recipients
        </label>
        <input
          type="text"
          value={recipientsText}
          onChange={(e) => setRecipientsText(e.target.value)}
          placeholder="email@example.com, another@example.com"
          className="w-full p-2.5 rounded-xl bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body"
        />
        <p className="text-xs text-navy/30 dark:text-slate-600 font-body mt-1">Separate multiple emails with commas</p>
      </div>

      {/* Tone Selector */}
      <div>
        <label className="block text-xs font-semibold text-navy/60 dark:text-slate-400 uppercase tracking-wider font-heading mb-1.5">
          Tone
        </label>
        <div className="flex gap-2">
          {TONE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTone(opt.value)}
              className={`
                px-3 py-1.5 rounded-lg text-xs font-medium font-body border transition-all
                ${tone === opt.value
                  ? 'bg-electric text-white border-electric shadow-sm'
                  : 'bg-white dark:bg-dark-surface text-navy/60 dark:text-slate-400 border-cream-dark dark:border-slate-700 hover:border-electric/40 hover:text-navy dark:hover:text-slate-100'
                }
              `}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div>
        <label className="block text-xs font-semibold text-navy/60 dark:text-slate-400 uppercase tracking-wider font-heading mb-1.5">
          Body
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your email content..."
          rows={10}
          className="w-full p-3 rounded-xl bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body resize-y leading-relaxed"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-xl text-sm font-medium font-body bg-electric text-white hover:bg-electric/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : email ? 'Update Email' : 'Create Email'}
        </button>
      </div>
    </div>
  );
}
