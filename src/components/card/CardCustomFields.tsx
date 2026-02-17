'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CustomFieldDefinition, CustomFieldValue, CustomFieldType } from '@/lib/types';

interface CardCustomFieldsProps {
  cardId: string;
  boardId: string;
  onRefresh: () => void;
}

export default function CardCustomFields({ cardId, boardId, onRefresh }: CardCustomFieldsProps) {
  const [definitions, setDefinitions] = useState<CustomFieldDefinition[]>([]);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({});
  const supabase = createClient();

  useEffect(() => {
    fetchFields();
  }, [cardId, boardId]);

  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach(clearTimeout);
    };
  }, []);

  const fetchFields = async () => {
    setLoading(true);

    const [defsResult, valsResult] = await Promise.all([
      supabase
        .from('custom_field_definitions')
        .select('*')
        .eq('board_id', boardId)
        .order('position', { ascending: true }),
      supabase
        .from('custom_field_values')
        .select('*, definition:custom_field_definitions(*)')
        .eq('card_id', cardId),
    ]);

    setDefinitions(defsResult.data || []);

    const valueMap: Record<string, unknown> = {};
    (valsResult.data || []).forEach((v: CustomFieldValue) => {
      valueMap[v.field_definition_id] = v.value;
    });
    setValues(valueMap);
    setLoading(false);
  };

  const saveFieldValue = useCallback(
    async (fieldDefinitionId: string, value: unknown) => {
      try {
        await fetch(`/api/cards/${cardId}/custom-fields`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ field_definition_id: fieldDefinitionId, value }),
        });
        onRefresh();
      } catch (err) {
        console.error('Failed to save custom field:', err);
      }
    },
    [cardId, onRefresh]
  );

  const handleFieldChange = (fieldDefinitionId: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [fieldDefinitionId]: value }));

    if (debounceTimers.current[fieldDefinitionId]) {
      clearTimeout(debounceTimers.current[fieldDefinitionId]);
    }

    debounceTimers.current[fieldDefinitionId] = setTimeout(() => {
      saveFieldValue(fieldDefinitionId, value);
    }, 500);
  };

  const handleCheckboxChange = (fieldDefinitionId: string, checked: boolean) => {
    setValues((prev) => ({ ...prev, [fieldDefinitionId]: checked }));
    saveFieldValue(fieldDefinitionId, checked);
  };

  const handleDropdownChange = (fieldDefinitionId: string, value: string) => {
    setValues((prev) => ({ ...prev, [fieldDefinitionId]: value }));
    saveFieldValue(fieldDefinitionId, value);
  };

  const handleDateChange = (fieldDefinitionId: string, value: string) => {
    setValues((prev) => ({ ...prev, [fieldDefinitionId]: value }));
    saveFieldValue(fieldDefinitionId, value);
  };

  const renderField = (definition: CustomFieldDefinition) => {
    const value = values[definition.id];
    const fieldType = definition.field_type as CustomFieldType;

    switch (fieldType) {
      case 'text':
        return (
          <input
            type="text"
            value={(value as string) || ''}
            onChange={(e) => handleFieldChange(definition.id, e.target.value)}
            placeholder={`Enter ${definition.name.toLowerCase()}...`}
            className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body"
          />
        );

      case 'number':
        return (
          <input
            type="number"
            value={(value as number) ?? ''}
            onChange={(e) => handleFieldChange(definition.id, e.target.value ? Number(e.target.value) : null)}
            placeholder={`Enter ${definition.name.toLowerCase()}...`}
            className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body"
          />
        );

      case 'dropdown':
        return (
          <select
            value={(value as string) || ''}
            onChange={(e) => handleDropdownChange(definition.id, e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body"
          >
            <option value="">Select...</option>
            {(definition.options || []).map((option: string) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        );

      case 'date':
        return (
          <input
            type="date"
            value={(value as string) || ''}
            onChange={(e) => handleDateChange(definition.id, e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body"
          />
        );

      case 'checkbox':
        return (
          <button
            onClick={() => handleCheckboxChange(definition.id, !value)}
            className={`
              w-5 h-5 rounded border-2 flex items-center justify-center transition-all
              ${value
                ? 'bg-electric border-electric'
                : 'border-navy/20 dark:border-slate-600 hover:border-electric bg-white dark:bg-dark-surface'
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

      case 'url':
        return (
          <div className="flex items-center gap-2">
            <input
              type="url"
              value={(value as string) || ''}
              onChange={(e) => handleFieldChange(definition.id, e.target.value)}
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

      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div>
        <h3 className="text-sm font-semibold text-navy/50 dark:text-slate-400 mb-3 font-heading">
          Custom Fields
        </h3>
        <div className="flex items-center justify-center py-8">
          <svg className="animate-spin h-5 w-5 text-electric" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      </div>
    );
  }

  if (definitions.length === 0) {
    return (
      <div>
        <h3 className="text-sm font-semibold text-navy/50 dark:text-slate-400 mb-3 font-heading">
          Custom Fields
        </h3>
        <p className="text-sm text-navy/30 dark:text-slate-500 text-center py-4 font-body">
          No custom fields configured for this board
        </p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-navy/50 dark:text-slate-400 mb-3 font-heading">
        Custom Fields ({definitions.length})
      </h3>

      <div className="space-y-3">
        {definitions.map((definition) => (
          <div key={definition.id}>
            <label className="flex items-center gap-1 text-xs font-semibold text-navy/60 dark:text-slate-300 mb-1.5 font-heading">
              {definition.name}
              {definition.is_required && (
                <span className="text-danger">*</span>
              )}
            </label>
            {renderField(definition)}
          </div>
        ))}
      </div>
    </div>
  );
}
