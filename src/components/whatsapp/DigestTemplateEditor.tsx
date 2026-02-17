'use client';

import { useState, useEffect, useCallback } from 'react';
import type { WhatsAppDigestTemplate, DigestSection } from '@/lib/types';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

const SECTION_TYPES: { value: DigestSection['type']; label: string }[] = [
  { value: 'overdue', label: 'Overdue Cards' },
  { value: 'assigned', label: 'Assigned to Me' },
  { value: 'mentions', label: 'Recent Mentions' },
  { value: 'board_summary', label: 'Board Summary' },
  { value: 'custom', label: 'Custom Section' },
];

function createDefaultSection(type: DigestSection['type']): DigestSection {
  const sectionType = SECTION_TYPES.find((s) => s.value === type);
  return {
    type,
    title: sectionType?.label || 'Custom',
    enabled: true,
  };
}

interface Toast {
  type: 'success' | 'error';
  message: string;
}

export default function DigestTemplateEditor() {
  const [templates, setTemplates] = useState<WhatsAppDigestTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [sections, setSections] = useState<DigestSection[]>([]);
  const [saving, setSaving] = useState(false);

  // Preview state
  const [previewContent, setPreviewContent] = useState<string | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/digest-templates');
      const json = await res.json();
      if (json.data) setTemplates(json.data);
    } catch {
      showToast('error', 'Failed to load digest templates.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const resetForm = () => {
    setName('');
    setSections([]);
    setEditId(null);
    setShowForm(false);
    setPreviewContent(null);
  };

  const addSection = (type: DigestSection['type']) => {
    setSections((prev) => [...prev, createDefaultSection(type)]);
  };

  const toggleSection = (index: number) => {
    setSections((prev) =>
      prev.map((s, i) => (i === index ? { ...s, enabled: !s.enabled } : s))
    );
  };

  const updateSectionTitle = (index: number, title: string) => {
    setSections((prev) =>
      prev.map((s, i) => (i === index ? { ...s, title } : s))
    );
  };

  const removeSection = (index: number) => {
    setSections((prev) => prev.filter((_, i) => i !== index));
  };

  const moveSection = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= sections.length) return;
    const newSections = [...sections];
    const temp = newSections[index];
    newSections[index] = newSections[newIndex];
    newSections[newIndex] = temp;
    setSections(newSections);
  };

  const generatePreview = () => {
    const enabledSections = sections.filter((s) => s.enabled);
    const lines: string[] = [];
    for (const section of enabledSections) {
      lines.push(`*${section.title}*`);
      switch (section.type) {
        case 'overdue':
          lines.push('  - Sample Card 1 (due: 2025-01-01)');
          lines.push('  - Sample Card 2 (due: 2025-01-02)');
          break;
        case 'assigned':
          lines.push('  - Task A [Design Board]');
          lines.push('  - Task B [Dev Board]');
          break;
        case 'mentions':
          lines.push('  - "Great work!" on Card X');
          break;
        case 'board_summary':
          lines.push('  - Design: 8/12 completed');
          lines.push('  - Dev: 15/20 completed');
          break;
        case 'custom':
          lines.push('  (Custom content)');
          break;
      }
      lines.push('');
    }
    setPreviewContent(lines.join('\n'));
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editId) {
        const res = await fetch(`/api/whatsapp/digest-templates/${editId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), sections }),
        });
        if (!res.ok) throw new Error('Failed to update template');
        showToast('success', 'Template updated.');
      } else {
        const res = await fetch('/api/whatsapp/digest-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), sections }),
        });
        if (!res.ok) throw new Error('Failed to create template');
        showToast('success', 'Template created.');
      }
      resetForm();
      await fetchTemplates();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (template: WhatsAppDigestTemplate) => {
    setEditId(template.id);
    setName(template.name);
    setSections(template.sections);
    setShowForm(true);
  };

  const handleDelete = async (templateId: string) => {
    try {
      await fetch(`/api/whatsapp/digest-templates/${templateId}`, { method: 'DELETE' });
      setTemplates((prev) => prev.filter((t) => t.id !== templateId));
      showToast('success', 'Template deleted.');
    } catch {
      showToast('error', 'Failed to delete template.');
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
          Loading digest templates...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg font-body text-sm ${
          toast.type === 'success'
            ? 'bg-green-50 border border-green-200 text-green-800'
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-navy dark:text-slate-100 font-heading">Digest Templates</h3>
          <p className="text-xs text-navy/50 dark:text-slate-400 font-body mt-0.5">
            Configure the structure of your WhatsApp daily digest messages
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowForm(true)}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Template
        </Button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-2xl border-2 border-electric/20 dark:border-electric/30 bg-white dark:bg-dark-surface p-6 shadow-sm">
          <h4 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading mb-4">
            {editId ? 'Edit Template' : 'Create New Template'}
          </h4>
          <div className="mb-4">
            <Input
              label="Template Name"
              placeholder="e.g., Morning Digest"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Sections Builder */}
          <div className="mb-4">
            <label className="block text-sm font-semibold text-navy dark:text-slate-100 mb-2 font-body">Sections</label>
            <div className="space-y-2">
              {sections.map((section, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-cream-dark dark:border-slate-700 bg-cream/30 dark:bg-navy/30">
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => moveSection(i, 'up')}
                      disabled={i === 0}
                      className="text-navy/30 dark:text-slate-600 hover:text-navy dark:hover:text-slate-100 disabled:opacity-30"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="18 15 12 9 6 15" />
                      </svg>
                    </button>
                    <button
                      onClick={() => moveSection(i, 'down')}
                      disabled={i === sections.length - 1}
                      className="text-navy/30 dark:text-slate-600 hover:text-navy dark:hover:text-slate-100 disabled:opacity-30"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                  </div>
                  <button
                    onClick={() => toggleSection(i)}
                    className={`w-8 h-4 rounded-full transition-colors relative shrink-0 ${
                      section.enabled ? 'bg-electric' : 'bg-navy/20 dark:bg-slate-700'
                    }`}
                  >
                    <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${
                      section.enabled ? 'left-4' : 'left-0.5'
                    }`} />
                  </button>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-electric/10 text-electric shrink-0">
                    {section.type}
                  </span>
                  <input
                    value={section.title}
                    onChange={(e) => updateSectionTitle(i, e.target.value)}
                    className="flex-1 px-2 py-1 text-sm text-navy dark:text-slate-100 font-body border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface rounded-lg focus:outline-none focus:border-electric"
                  />
                  <button
                    onClick={() => removeSection(i)}
                    className="text-navy/30 dark:text-slate-600 hover:text-red-500 transition-colors shrink-0"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {SECTION_TYPES.map((st) => (
                <button
                  key={st.value}
                  onClick={() => addSection(st.value)}
                  className="px-3 py-1.5 text-xs font-body font-medium text-navy/60 dark:text-slate-400 bg-cream-dark dark:bg-slate-800 rounded-lg hover:bg-electric/10 hover:text-electric transition-colors"
                >
                  + {st.label}
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="mb-6">
            <Button variant="ghost" size="sm" onClick={generatePreview}>Preview Digest</Button>
            {previewContent !== null && (
              <div className="mt-3 p-4 rounded-xl bg-navy/5 dark:bg-navy/30 border border-cream-dark dark:border-slate-700">
                <pre className="text-xs text-navy/70 dark:text-slate-300 font-mono whitespace-pre-wrap">{previewContent || '(empty)'}</pre>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" size="md" onClick={resetForm}>Cancel</Button>
            <Button
              variant="primary"
              size="md"
              loading={saving}
              disabled={!name.trim()}
              onClick={handleSave}
            >
              {editId ? 'Update Template' : 'Create Template'}
            </Button>
          </div>
        </div>
      )}

      {/* Templates List */}
      <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 overflow-hidden">
        {templates.length === 0 ? (
          <div className="px-6 py-12 text-center text-navy/40 dark:text-slate-500 font-body text-sm">
            No digest templates yet. Create one to customize your daily digest.
          </div>
        ) : (
          <div className="divide-y divide-cream-dark dark:divide-slate-700">
            {templates.map((template) => (
              <div key={template.id} className="flex items-center gap-4 px-6 py-4 hover:bg-cream/30 dark:hover:bg-slate-800/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-navy dark:text-slate-100 font-body">{template.name}</p>
                    {template.is_default && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-green-100 text-green-700">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-navy/40 dark:text-slate-500 font-body mt-0.5">
                    {template.sections.length} section{template.sections.length !== 1 ? 's' : ''} -
                    {template.sections.filter((s) => s.enabled).length} enabled
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(template)}>Edit</Button>
                  <button
                    onClick={() => handleDelete(template.id)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-navy/30 dark:text-slate-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
