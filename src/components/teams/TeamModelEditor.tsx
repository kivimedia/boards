'use client';

import { useState } from 'react';
import { AVAILABLE_MODELS } from '@/lib/ai/pageforge-constants';
import { MODEL_PRICING } from '@/lib/ai/cost-tracker';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';

interface Phase {
  name: string;
  is_gate?: boolean;
  skill_slug?: string;
  model?: string | null;
  gate_type?: string;
  gate_label?: string;
  [key: string]: unknown;
}

interface Template {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  phases: Phase[];
}

interface TeamModelEditorProps {
  template: Template;
  onClose: () => void;
  onSaved: () => void;
}

// Combine PageForge models with all models from pricing table
function getAllModels(): { id: string; label: string; provider: string }[] {
  const pfModels = AVAILABLE_MODELS.map(m => ({ ...m }));
  const pricingModels = MODEL_PRICING
    .filter(m => m.input_cost_per_1m > 0) // skip embeddings
    .map(m => ({ id: m.model_id, label: m.model_id, provider: m.provider }));

  const seen = new Set(pfModels.map(m => m.id));
  for (const m of pricingModels) {
    if (!seen.has(m.id)) {
      pfModels.push(m);
      seen.add(m.id);
    }
  }
  return pfModels;
}

const ALL_MODELS = getAllModels();

function providerColor(provider: string) {
  const colors: Record<string, string> = {
    anthropic: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800',
    openai: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800',
    google: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
    replicate: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800',
  };
  return colors[provider] || 'bg-gray-50 text-gray-700 border-gray-200';
}

function formatPhaseName(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

export default function TeamModelEditor({ template, onClose, onSaved }: TeamModelEditorProps) {
  const [phases, setPhases] = useState<Phase[]>(
    template.phases.map(p => ({ ...p }))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleModelChange = (index: number, modelId: string) => {
    setPhases(prev => {
      const next = [...prev];
      next[index] = { ...next[index], model: modelId || null };
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/teams/${template.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phases }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || `Failed (${res.status})`);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // Count how many non-gate phases have a custom model set
  const agentPhases = phases.filter(p => !p.is_gate);
  const customizedCount = agentPhases.filter(p => p.model).length;

  return (
    <Modal isOpen onClose={onClose} size="lg">
      <div className="p-6 max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="mb-6">
          <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-lg">
            {template.icon} {template.name}
          </h3>
          <p className="text-navy/50 dark:text-slate-400 font-body text-sm mt-1">
            Configure which AI model each agent uses in this pipeline.
          </p>
          {customizedCount > 0 && (
            <p className="text-electric font-body text-xs mt-2">
              {customizedCount} of {agentPhases.length} agents customized
            </p>
          )}
        </div>

        {error && (
          <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2.5">
            <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {/* Phases list */}
        <div className="space-y-1">
          {phases.map((phase, idx) => {
            const isGate = phase.is_gate;
            const currentModel = ALL_MODELS.find(m => m.id === phase.model);

            if (isGate) {
              return (
                <div
                  key={idx}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl bg-yellow-50/50 dark:bg-yellow-900/10 border border-yellow-200/50 dark:border-yellow-800/30"
                >
                  <div className="w-6 h-6 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-600">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300 font-body">
                      {phase.gate_label || formatPhaseName(phase.name)}
                    </p>
                    <p className="text-[10px] text-yellow-600/60 dark:text-yellow-400/50 font-body">
                      Human approval gate
                    </p>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={idx}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white dark:bg-dark-card border border-cream-dark dark:border-slate-700 hover:border-navy/20 dark:hover:border-slate-500 transition-colors"
              >
                {/* Phase number */}
                <div className="w-6 h-6 rounded-full bg-electric/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-bold text-electric">{idx + 1}</span>
                </div>

                {/* Phase info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-navy dark:text-slate-100 font-body">
                    {formatPhaseName(phase.name)}
                  </p>
                  {phase.skill_slug && (
                    <p className="text-[10px] text-navy/40 dark:text-slate-500 font-mono truncate">
                      {phase.skill_slug}
                    </p>
                  )}
                </div>

                {/* Current provider badge */}
                {currentModel && (
                  <span className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${providerColor(currentModel.provider)}`}>
                    {currentModel.provider}
                  </span>
                )}

                {/* Model selector */}
                <div className="relative flex-shrink-0 w-48">
                  <select
                    value={phase.model || ''}
                    onChange={(e) => handleModelChange(idx, e.target.value)}
                    className="appearance-none w-full rounded-lg border border-cream-dark dark:border-slate-700 bg-cream/30 dark:bg-dark-surface text-xs text-navy dark:text-slate-100 px-2.5 py-2 pr-7 font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-all"
                  >
                    <option value="">Default</option>
                    {ALL_MODELS.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.label || m.id}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-navy/30"><polyline points="6 9 12 15 18 9" /></svg>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Arrow flow indicator */}
        <div className="mt-4 flex items-center gap-1 flex-wrap px-4">
          {phases.map((phase, idx) => (
            <div key={idx} className="flex items-center gap-1">
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                phase.is_gate 
                  ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                  : phase.model 
                    ? 'bg-electric/10 text-electric' 
                    : 'bg-navy/5 text-navy/40 dark:bg-slate-800 dark:text-slate-500'
              }`}>
                {formatPhaseName(phase.name).split(' ').map(w => w[0]).join('')}
              </span>
              {idx < phases.length - 1 && (
                <span className="text-navy/15 dark:text-slate-700 text-[10px]">→</span>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-cream-dark dark:border-slate-700">
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            loading={saving}
            onClick={handleSave}
          >
            Save Model Config
          </Button>
        </div>
      </div>
    </Modal>
  );
}
