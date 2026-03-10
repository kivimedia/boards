'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { checkMessageQuality } from '@/lib/outreach/message-quality';
import { getSequenceOverview } from '@/lib/outreach/template-engine';

interface Template {
  id: string;
  template_number: number;
  variant: 'A' | 'B';
  stage: string;
  template_text: string;
  prerequisite: Record<string, unknown>;
  max_length: number | null;
  is_followup: boolean;
  is_active: boolean;
}

interface RotationVariant {
  id: string;
  variant_number: number;
  template_text: string;
  is_active: boolean;
}

export default function TemplateEditor() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [rotationVariants, setRotationVariants] = useState<RotationVariant[]>([]);
  const [usage, setUsage] = useState<Record<number, { sent: number; drafted: number }>>({});
  const [loading, setLoading] = useState(true);
  const [selectedNum, setSelectedNum] = useState<number>(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createVariant, setCreateVariant] = useState<'A' | 'B'>('A');
  const [createText, setCreateText] = useState('');
  const [seeding, setSeeding] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const sequence = getSequenceOverview();

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/outreach/templates');
      const data = await res.json();
      if (res.ok) {
        setTemplates(data.data.templates || []);
        setRotationVariants(data.data.rotation_variants || []);
        setUsage(data.data.usage || {});
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTemplates(); }, []);

  const currentTemplates = templates.filter(t => t.template_number === selectedNum);
  const currentRotations = selectedNum === 1 ? rotationVariants : [];
  const selectedSequence = sequence.find(s => s.number === selectedNum);

  const handleSave = async (templateId: string) => {
    setSaving(true);
    try {
      await fetch(`/api/outreach/templates/${templateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_text: editText }),
      });
      setEditingId(null);
      fetchTemplates();
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (templateId: string, currentActive: boolean) => {
    await fetch(`/api/outreach/templates/${templateId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !currentActive }),
    });
    fetchTemplates();
  };

  const handleCreate = async () => {
    if (!createText.trim() || !selectedSequence) return;
    setSaving(true);
    setFeedbackMsg(null);
    try {
      const res = await fetch('/api/outreach/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_number: selectedNum,
          variant: createVariant,
          stage: selectedSequence.stage,
          template_text: createText,
          is_followup: selectedSequence.isFollowup,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFeedbackMsg({ type: 'error', text: json.error || 'Failed to create template' });
        return;
      }
      setFeedbackMsg({ type: 'success', text: `Template T${selectedNum} Variant ${createVariant} created` });
      setCreating(false);
      setCreateText('');
      fetchTemplates();
    } catch (err) {
      setFeedbackMsg({ type: 'error', text: err instanceof Error ? err.message : 'Create failed' });
    } finally {
      setSaving(false);
      setTimeout(() => setFeedbackMsg(null), 5000);
    }
  };

  const handleSeedDefaults = async () => {
    setSeeding(true);
    setFeedbackMsg(null);
    try {
      const res = await fetch('/api/outreach/templates/seed', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        setFeedbackMsg({ type: 'error', text: json.error || 'Seed failed' });
        return;
      }
      setFeedbackMsg({ type: 'success', text: 'Default templates loaded successfully' });
      fetchTemplates();
    } catch (err) {
      setFeedbackMsg({ type: 'error', text: err instanceof Error ? err.message : 'Seed failed' });
    } finally {
      setSeeding(false);
      setTimeout(() => setFeedbackMsg(null), 5000);
    }
  };

  // Live quality check for editing/creating
  const liveCheck = editText
    ? checkMessageQuality(editText, { templateNumber: selectedNum })
    : null;

  const createCheck = createText
    ? checkMessageQuality(createText, { templateNumber: selectedNum })
    : null;

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
      <div className="flex items-center gap-2">
        <Link href="/outreach" className="text-sm text-navy/40 dark:text-slate-500 hover:text-electric font-body transition-colors">
          Dashboard
        </Link>
        <span className="text-navy/20 dark:text-slate-700">/</span>
        <span className="text-sm font-semibold text-navy dark:text-white font-heading">Templates</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Sequence sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 p-4">
            <h3 className="text-xs font-semibold text-navy/60 dark:text-slate-400 uppercase font-heading mb-3">
              Message Sequence
            </h3>
            <div className="space-y-1">
              {sequence.map((step) => {
                const hasTemplate = templates.some(t => t.template_number === step.number && t.is_active);
                const u = usage[step.number];
                return (
                  <button
                    key={step.number}
                    onClick={() => setSelectedNum(step.number)}
                    className={`w-full text-left p-2.5 rounded-lg transition-colors ${
                      selectedNum === step.number
                        ? 'bg-electric/10 border border-electric/30'
                        : 'hover:bg-cream dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                        hasTemplate
                          ? 'bg-electric/20 text-electric'
                          : 'bg-navy/10 dark:bg-slate-700 text-navy/40 dark:text-slate-500'
                      }`}>
                        {step.number}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-semibold truncate ${
                          selectedNum === step.number ? 'text-electric' : 'text-navy dark:text-white'
                        } font-heading`}>
                          {step.label}
                        </p>
                        <div className="flex items-center gap-1.5">
                          {step.isFollowup && (
                            <span className="text-[8px] text-amber-500 font-semibold">FOLLOW-UP</span>
                          )}
                          {u && u.sent > 0 && (
                            <span className="text-[8px] text-navy/30 dark:text-slate-600">{u.sent} sent</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Template detail */}
        <div className="lg:col-span-3 space-y-4">
          {/* Selected template info */}
          <div className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-bold text-navy dark:text-white font-heading">
                  T{selectedNum}: {selectedSequence?.label}
                </h2>
                <p className="text-[10px] text-navy/40 dark:text-slate-500 font-body mt-0.5">
                  Stage: {selectedSequence?.stage}
                  {selectedSequence?.isFollowup && ' (Follow-up)'}
                </p>
              </div>
              {usage[selectedNum] && (
                <div className="text-right">
                  <p className="text-xs text-navy/40 dark:text-slate-500 font-body">
                    {usage[selectedNum].sent} sent / {usage[selectedNum].drafted} drafted
                  </p>
                </div>
              )}
            </div>

            {/* Feedback message */}
            {feedbackMsg && (
              <div className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-lg text-xs font-semibold ${
                feedbackMsg.type === 'success'
                  ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
                  : 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
              }`}>
                <span>{feedbackMsg.type === 'success' ? '\u2713' : '\u2717'}</span>
                <span>{feedbackMsg.text}</span>
                <button onClick={() => setFeedbackMsg(null)} className="ml-auto text-current opacity-50 hover:opacity-100">{'\u00d7'}</button>
              </div>
            )}

            {/* Variants */}
            {currentTemplates.length === 0 ? (
              <div className="text-center py-8 bg-cream dark:bg-dark-surface rounded-lg">
                <p className="text-xs text-navy/40 dark:text-slate-500 font-body">
                  No templates configured for T{selectedNum}
                </p>
                {templates.length === 0 ? (
                  <div className="mt-3 flex items-center justify-center gap-3">
                    <button
                      onClick={handleSeedDefaults}
                      disabled={seeding}
                      className="px-4 py-2 text-xs font-semibold text-white bg-electric hover:bg-electric-bright rounded-lg disabled:opacity-50 transition-colors"
                    >
                      {seeding ? 'Loading...' : 'Load Default Templates'}
                    </button>
                    <span className="text-[10px] text-navy/20 dark:text-slate-700">or</span>
                    <button
                      onClick={() => { setCreating(true); setCreateText(''); setCreateVariant('A'); }}
                      className="px-4 py-2 text-xs font-semibold text-electric border border-electric/30 hover:bg-electric/5 rounded-lg transition-colors"
                    >
                      Create Manually
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setCreating(true); setCreateText(''); setCreateVariant('A'); }}
                    className="mt-3 px-4 py-2 text-xs font-semibold text-electric border border-electric/30 hover:bg-electric/5 rounded-lg transition-colors"
                  >
                    + Create Template for T{selectedNum}
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {currentTemplates.map((tmpl) => (
                  <div key={tmpl.id} className={`rounded-lg border p-4 ${
                    tmpl.is_active
                      ? 'border-cream-dark dark:border-slate-700'
                      : 'border-navy/5 dark:border-slate-800 opacity-50'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 text-[10px] font-semibold bg-electric/10 text-electric rounded">
                          Variant {tmpl.variant}
                        </span>
                        {!tmpl.is_active && (
                          <span className="px-2 py-0.5 text-[10px] font-semibold bg-gray-100 dark:bg-gray-800 text-gray-500 rounded">
                            Inactive
                          </span>
                        )}
                        {tmpl.max_length && (
                          <span className="text-[10px] text-navy/30 dark:text-slate-600">
                            Max: {tmpl.max_length} chars
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleActive(tmpl.id, tmpl.is_active)}
                          className="text-[10px] text-navy/40 dark:text-slate-500 hover:text-navy dark:hover:text-white font-semibold transition-colors"
                        >
                          {tmpl.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        {editingId !== tmpl.id ? (
                          <button
                            onClick={() => { setEditingId(tmpl.id); setEditText(tmpl.template_text); }}
                            className="text-[10px] text-electric hover:text-electric-bright font-semibold transition-colors"
                          >
                            Edit
                          </button>
                        ) : (
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-[10px] text-navy/40 dark:text-slate-500 font-semibold"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>

                    {editingId === tmpl.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          rows={4}
                          className="w-full px-3 py-2 text-sm rounded-lg bg-cream dark:bg-dark-surface border border-navy/10 dark:border-slate-700 text-navy dark:text-slate-100 font-body resize-none focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric"
                        />
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-navy/30 dark:text-slate-600">{editText.length} chars</span>
                            {liveCheck && (
                              <span className={`text-[10px] font-semibold ${liveCheck.passed ? 'text-green-600' : 'text-red-500'}`}>
                                Q: {liveCheck.scores.overall}
                              </span>
                            )}
                            {liveCheck?.hardBlocks.map((b, i) => (
                              <span key={i} className="text-[9px] text-red-500">{b}</span>
                            ))}
                          </div>
                          <button
                            onClick={() => handleSave(tmpl.id)}
                            disabled={saving || (liveCheck ? !liveCheck.passed : false)}
                            className="px-3 py-1.5 text-[11px] font-semibold text-white bg-electric hover:bg-electric-bright rounded-lg disabled:opacity-50 transition-colors"
                          >
                            {saving ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-navy/60 dark:text-slate-400 font-body whitespace-pre-wrap">
                        {tmpl.template_text}
                      </p>
                    )}

                    {/* Prerequisites display */}
                    {Object.keys(tmpl.prerequisite || {}).length > 0 && (
                      <div className="mt-2 pt-2 border-t border-cream-dark dark:border-slate-700">
                        <p className="text-[9px] text-navy/30 dark:text-slate-600 font-body">
                          Prerequisites: {Object.entries(tmpl.prerequisite).map(([k, v]) => `${k}=${String(v)}`).join(', ')}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Add variant button when templates exist but user might want B variant */}
            {currentTemplates.length > 0 && currentTemplates.length < 2 && !creating && (
              <div className="mt-3">
                <button
                  onClick={() => {
                    setCreating(true);
                    setCreateText('');
                    setCreateVariant(currentTemplates[0]?.variant === 'A' ? 'B' : 'A');
                  }}
                  className="text-[10px] text-electric hover:text-electric-bright font-semibold transition-colors"
                >
                  + Add Variant {currentTemplates[0]?.variant === 'A' ? 'B' : 'A'}
                </button>
              </div>
            )}

            {/* Create template form */}
            {creating && (
              <div className="mt-4 p-4 rounded-lg border border-electric/30 bg-electric/5 dark:bg-electric/10 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-navy dark:text-white font-heading">
                    New Template - T{selectedNum} Variant {createVariant}
                  </h4>
                  <button
                    onClick={() => setCreating(false)}
                    className="text-[10px] text-navy/40 dark:text-slate-500 hover:text-navy dark:hover:text-white font-semibold"
                  >
                    Cancel
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-[10px] text-navy/50 dark:text-slate-400 font-body">Variant:</label>
                  <select
                    value={createVariant}
                    onChange={(e) => setCreateVariant(e.target.value as 'A' | 'B')}
                    className="px-2 py-1 text-xs rounded border border-navy/10 dark:border-slate-700 bg-white dark:bg-dark-card text-navy dark:text-white font-body"
                  >
                    <option value="A">A</option>
                    <option value="B">B</option>
                  </select>
                  <span className="text-[10px] text-navy/30 dark:text-slate-600 font-body">
                    Stage: {selectedSequence?.stage}
                  </span>
                </div>
                <textarea
                  value={createText}
                  onChange={(e) => setCreateText(e.target.value)}
                  rows={5}
                  placeholder="Write your template message here. Use {{first_name}}, {{company}}, {{title}} as placeholders..."
                  className="w-full px-3 py-2 text-sm rounded-lg bg-white dark:bg-dark-card border border-navy/10 dark:border-slate-700 text-navy dark:text-slate-100 font-body resize-none focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric placeholder:text-navy/30 dark:placeholder:text-slate-600"
                />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-navy/30 dark:text-slate-600">{createText.length} chars</span>
                    {createCheck && (
                      <span className={`text-[10px] font-semibold ${createCheck.passed ? 'text-green-600' : 'text-red-500'}`}>
                        Q: {createCheck.scores.overall}
                      </span>
                    )}
                    {createCheck?.hardBlocks.map((b, i) => (
                      <span key={i} className="text-[9px] text-red-500">{b}</span>
                    ))}
                  </div>
                  <button
                    onClick={handleCreate}
                    disabled={saving || !createText.trim() || (createCheck ? !createCheck.passed : false)}
                    className="px-4 py-1.5 text-[11px] font-semibold text-white bg-electric hover:bg-electric-bright rounded-lg disabled:opacity-50 transition-colors"
                  >
                    {saving ? 'Creating...' : 'Create Template'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Rotation variants (T1 only) */}
          {selectedNum === 1 && currentRotations.length > 0 && (
            <div className="bg-white dark:bg-dark-card rounded-xl border border-cream-dark dark:border-slate-700 p-5">
              <h3 className="text-xs font-semibold text-navy/60 dark:text-slate-400 uppercase font-heading mb-3">
                Rotation Variants (Anti-Detection)
              </h3>
              <p className="text-[10px] text-navy/30 dark:text-slate-600 font-body mb-3">
                Connection notes rotate between these variants to avoid LinkedIn pattern detection.
              </p>
              <div className="space-y-2">
                {currentRotations.map((rv) => (
                  <div key={rv.id} className={`p-3 rounded-lg border ${
                    rv.is_active ? 'border-cream-dark dark:border-slate-700' : 'border-navy/5 dark:border-slate-800 opacity-50'
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300 rounded">
                        Rotation {rv.variant_number}
                      </span>
                      {!rv.is_active && (
                        <span className="text-[9px] text-gray-400">Inactive</span>
                      )}
                    </div>
                    <p className="text-xs text-navy/60 dark:text-slate-400 font-body whitespace-pre-wrap">
                      {rv.template_text}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
