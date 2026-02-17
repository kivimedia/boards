'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { BriefingTemplate, BriefingTemplateField, CardBrief } from '@/lib/types';
import { calculateCompleteness } from '@/lib/briefing';
import BriefCompleteness from './BriefCompleteness';

interface BriefEditorProps {
  cardId: string;
  boardId: string;
  onRefresh: () => void;
}

export default function BriefEditor({ cardId, boardId, onRefresh }: BriefEditorProps) {
  const [brief, setBrief] = useState<CardBrief | null>(null);
  const [templates, setTemplates] = useState<BriefingTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [boardType, setBoardType] = useState<string | null>(null);
  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({});

  // Cleanup debounce timers on unmount
  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach(clearTimeout);
    };
  }, []);

  // Fetch board type first, then brief and templates
  useEffect(() => {
    fetchBoardType();
  }, [boardId]);

  useEffect(() => {
    if (boardType !== null) {
      fetchData();
    }
  }, [cardId, boardType]);

  const fetchBoardType = async () => {
    try {
      const res = await fetch(`/api/boards/${boardId}`);
      const json = await res.json();
      if (json.data) {
        setBoardType(json.data.type || null);
      }
    } catch (err) {
      console.error('Failed to fetch board type:', err);
    }
  };

  const fetchData = async () => {
    setLoading(true);

    try {
      const [briefRes, templatesRes] = await Promise.all([
        fetch(`/api/cards/${cardId}/brief`),
        boardType
          ? fetch(`/api/briefing-templates?board_type=${boardType}`)
          : Promise.resolve(null),
      ]);

      const briefJson = await briefRes.json();
      const briefData: CardBrief | null = briefJson.data || null;

      let templatesList: BriefingTemplate[] = [];
      if (templatesRes) {
        const templatesJson = await templatesRes.json();
        templatesList = templatesJson.data || [];
      }

      setTemplates(templatesList);
      setBrief(briefData);

      if (briefData) {
        setSelectedTemplateId(briefData.template_id);
        setFormData((briefData.data as Record<string, unknown>) || {});
      } else if (templatesList.length === 1) {
        // Auto-select if only one template available
        setSelectedTemplateId(templatesList[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch brief data:', err);
    }

    setLoading(false);
  };

  const getActiveTemplate = (): BriefingTemplate | null => {
    if (!selectedTemplateId) return null;
    // Check if the brief already has the template data attached
    if (brief?.template && brief.template.id === selectedTemplateId) {
      return brief.template;
    }
    return templates.find((t) => t.id === selectedTemplateId) || null;
  };

  const saveBrief = useCallback(
    async (data: Record<string, unknown>, templateId?: string) => {
      setSaving(true);
      try {
        const payload: Record<string, unknown> = { data };
        if (templateId) {
          payload.template_id = templateId;
        }

        const res = await fetch(`/api/cards/${cardId}/brief`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const json = await res.json();
        if (json.data) {
          setBrief(json.data);
        }
        onRefresh();
      } catch (err) {
        console.error('Failed to save brief:', err);
      }
      setSaving(false);
    },
    [cardId, onRefresh]
  );

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    // Save immediately with the new template
    saveBrief(formData, templateId);
  };

  const handleFieldChange = (key: string, value: unknown) => {
    const newData = { ...formData, [key]: value };
    setFormData(newData);

    // Debounced save for text-like fields
    if (debounceTimers.current[key]) {
      clearTimeout(debounceTimers.current[key]);
    }

    debounceTimers.current[key] = setTimeout(() => {
      saveBrief(newData, selectedTemplateId || undefined);
    }, 600);
  };

  const handleImmediateChange = (key: string, value: unknown) => {
    const newData = { ...formData, [key]: value };
    setFormData(newData);
    saveBrief(newData, selectedTemplateId || undefined);
  };

  const renderField = (field: BriefingTemplateField) => {
    const value = formData[field.key];

    switch (field.type) {
      case 'text':
        return (
          <input
            type="text"
            value={(value as string) || ''}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            placeholder={`Enter ${field.label.toLowerCase()}...`}
            className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body"
          />
        );

      case 'textarea':
        return (
          <textarea
            value={(value as string) || ''}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            placeholder={`Enter ${field.label.toLowerCase()}...`}
            rows={3}
            className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body resize-none"
          />
        );

      case 'number':
        return (
          <input
            type="number"
            value={(value as number) ?? ''}
            onChange={(e) =>
              handleFieldChange(
                field.key,
                e.target.value ? Number(e.target.value) : null
              )
            }
            placeholder={`Enter ${field.label.toLowerCase()}...`}
            className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body"
          />
        );

      case 'date':
        return (
          <input
            type="date"
            value={(value as string) || ''}
            onChange={(e) => handleImmediateChange(field.key, e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body"
          />
        );

      case 'dropdown':
        return (
          <select
            value={(value as string) || ''}
            onChange={(e) => handleImmediateChange(field.key, e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body"
          >
            <option value="">Select...</option>
            {(field.options || []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        );

      case 'url':
        return (
          <div className="flex items-center gap-2">
            <input
              type="url"
              value={(value as string) || ''}
              onChange={(e) => handleFieldChange(field.key, e.target.value)}
              placeholder="https://..."
              className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body"
            />
            {typeof value === 'string' && value.startsWith('http') && (
              <a
                href={value}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 p-2 rounded-lg text-navy/40 hover:text-electric hover:bg-electric/10 transition-all"
                title="Open link"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )}
          </div>
        );

      case 'url_list':
        return (
          <textarea
            value={
              Array.isArray(value)
                ? (value as string[]).join('\n')
                : (value as string) || ''
            }
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            placeholder="One URL per line..."
            rows={3}
            className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body resize-none"
          />
        );

      case 'checkbox':
        return (
          <button
            onClick={() => handleImmediateChange(field.key, !value)}
            className={`
              w-5 h-5 rounded border-2 flex items-center justify-center transition-all
              ${value
                ? 'bg-electric border-electric'
                : 'border-navy/20 hover:border-electric bg-white'
              }
            `}
          >
            {!!value && (
              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        );

      default:
        return null;
    }
  };

  // Calculate current completeness for display
  const activeTemplate = getActiveTemplate();
  const fields = activeTemplate?.fields || [];
  const { score, isComplete, missingRequired } = calculateCompleteness(formData, fields);

  if (loading) {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-navy/50 dark:text-slate-400 font-heading">
          Brief
        </h3>
        <div className="flex items-center justify-center py-12">
          <svg className="animate-spin h-5 w-5 text-electric" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      </div>
    );
  }

  // No templates available for this board type
  if (templates.length === 0 && !brief) {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-navy/50 dark:text-slate-400 font-heading">
          Brief
        </h3>
        <div className="p-6 rounded-xl bg-cream dark:bg-navy text-center">
          <p className="text-sm text-navy/40 dark:text-slate-400 font-body">
            No briefing templates are available for this board type.
          </p>
        </div>
      </div>
    );
  }

  // Show template selector if no brief and no template selected
  if (!brief && !selectedTemplateId) {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-navy/50 dark:text-slate-400 font-heading">
          Brief
        </h3>
        <div className="p-6 rounded-xl bg-cream dark:bg-navy space-y-4">
          <p className="text-sm text-navy/60 dark:text-slate-400 font-body">
            Select a briefing template to get started:
          </p>
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) handleTemplateSelect(e.target.value);
            }}
            className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body"
          >
            <option value="">Choose a template...</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with template name */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-navy/50 dark:text-slate-400 font-heading">
          {activeTemplate ? activeTemplate.name : 'Brief'}
        </h3>
        {saving && (
          <span className="text-xs text-navy/40 dark:text-slate-400 font-body">Saving...</span>
        )}
      </div>

      {/* Completeness bar */}
      {fields.length > 0 && (
        <BriefCompleteness
          score={score}
          isComplete={isComplete}
          missingRequired={missingRequired}
        />
      )}

      {/* Template selector (allow switching if templates exist) */}
      {templates.length > 1 && (
        <div>
          <label className="text-xs font-semibold text-navy/60 dark:text-slate-300 mb-1.5 font-heading block">
            Template
          </label>
          <select
            value={selectedTemplateId || ''}
            onChange={(e) => {
              if (e.target.value) handleTemplateSelect(e.target.value);
            }}
            className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body"
          >
            <option value="">Choose a template...</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Dynamic form fields */}
      {fields.length > 0 && (
        <div className="space-y-4">
          {fields.map((field) => (
            <div key={field.key}>
              <label className="flex items-center gap-1 text-xs font-semibold text-navy/60 dark:text-slate-300 mb-1.5 font-heading">
                {field.label}
                {field.required && (
                  <span className="text-red-500">*</span>
                )}
              </label>
              {renderField(field)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
