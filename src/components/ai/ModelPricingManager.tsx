'use client';

import { useState, useEffect, useCallback } from 'react';
import Button from '@/components/ui/Button';
import type { AIModelPricingRow } from '@/lib/types';

interface Toast {
  type: 'success' | 'error';
  message: string;
}

export default function ModelPricingManager() {
  const [pricing, setPricing] = useState<AIModelPricingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<Toast | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [formProvider, setFormProvider] = useState('');
  const [formModelId, setFormModelId] = useState('');
  const [formInputCost, setFormInputCost] = useState('');
  const [formOutputCost, setFormOutputCost] = useState('');
  const [formImageCost, setFormImageCost] = useState('');
  const [formVideoCost, setFormVideoCost] = useState('');
  const [saving, setSaving] = useState(false);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchPricing = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/pricing');
      const json = await res.json();
      if (res.ok && json.data) {
        setPricing(json.data);
      } else {
        setError(json.error || 'Failed to load pricing.');
      }
    } catch {
      setError('Network error loading pricing data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPricing();
  }, [fetchPricing]);

  const handleSave = async () => {
    if (!formProvider.trim() || !formModelId.trim()) {
      showToast('error', 'Provider and Model ID are required.');
      return;
    }

    setSaving(true);

    try {
      const res = await fetch('/api/ai/pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: formProvider.trim(),
          modelId: formModelId.trim(),
          inputCostPer1k: parseFloat(formInputCost) || 0,
          outputCostPer1k: parseFloat(formOutputCost) || 0,
          imageCostPerUnit: parseFloat(formImageCost) || 0,
          videoCostPerSecond: parseFloat(formVideoCost) || 0,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Save failed');
      }

      showToast('success', 'Model pricing saved.');
      setShowForm(false);
      resetForm();
      fetchPricing();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormProvider('');
    setFormModelId('');
    setFormInputCost('');
    setFormOutputCost('');
    setFormImageCost('');
    setFormVideoCost('');
  };

  const editRow = (row: AIModelPricingRow) => {
    setFormProvider(row.provider);
    setFormModelId(row.model_id);
    setFormInputCost(String(row.input_cost_per_1k));
    setFormOutputCost(String(row.output_cost_per_1k));
    setFormImageCost(String(row.image_cost_per_unit));
    setFormVideoCost(String(row.video_cost_per_second));
    setShowForm(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-3 text-navy/40 dark:text-slate-500 font-body text-sm">
          <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Loading pricing...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
        <p className="text-red-800 font-body text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-heading font-semibold text-navy dark:text-slate-100">Model Pricing</h3>
        <Button size="sm" onClick={() => { setShowForm(!showForm); if (showForm) resetForm(); }}>
          {showForm ? 'Cancel' : '+ Add Pricing'}
        </Button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-cream/50 dark:bg-navy/30 rounded-2xl border border-cream-dark dark:border-slate-700 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1 uppercase tracking-wider font-heading">Provider</label>
              <input
                type="text"
                value={formProvider}
                onChange={(e) => setFormProvider(e.target.value)}
                placeholder="e.g. openai"
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1 uppercase tracking-wider font-heading">Model ID</label>
              <input
                type="text"
                value={formModelId}
                onChange={(e) => setFormModelId(e.target.value)}
                placeholder="e.g. gpt-4o"
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1 uppercase tracking-wider font-heading">Input Cost / 1K tokens</label>
              <input
                type="number"
                step="0.0001"
                value={formInputCost}
                onChange={(e) => setFormInputCost(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1 uppercase tracking-wider font-heading">Output Cost / 1K tokens</label>
              <input
                type="number"
                step="0.0001"
                value={formOutputCost}
                onChange={(e) => setFormOutputCost(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1 uppercase tracking-wider font-heading">Image Cost / Unit</label>
              <input
                type="number"
                step="0.001"
                value={formImageCost}
                onChange={(e) => setFormImageCost(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1 uppercase tracking-wider font-heading">Video Cost / Second</label>
              <input
                type="number"
                step="0.001"
                value={formVideoCost}
                onChange={(e) => setFormVideoCost(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={handleSave} loading={saving}>
              Save Pricing
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 overflow-hidden">
        {pricing.length === 0 ? (
          <div className="px-6 py-8 text-center text-navy/40 dark:text-slate-500 font-body text-sm">
            No model pricing configured yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-navy/50">
                  <th className="text-left px-4 py-3 font-heading font-semibold text-navy dark:text-slate-300 text-xs uppercase tracking-wider">Provider</th>
                  <th className="text-left px-4 py-3 font-heading font-semibold text-navy dark:text-slate-300 text-xs uppercase tracking-wider">Model</th>
                  <th className="text-right px-4 py-3 font-heading font-semibold text-navy dark:text-slate-300 text-xs uppercase tracking-wider">Input/1K</th>
                  <th className="text-right px-4 py-3 font-heading font-semibold text-navy dark:text-slate-300 text-xs uppercase tracking-wider">Output/1K</th>
                  <th className="text-right px-4 py-3 font-heading font-semibold text-navy dark:text-slate-300 text-xs uppercase tracking-wider">Image/Unit</th>
                  <th className="text-right px-4 py-3 font-heading font-semibold text-navy dark:text-slate-300 text-xs uppercase tracking-wider">Video/Sec</th>
                  <th className="text-right px-4 py-3 font-heading font-semibold text-navy dark:text-slate-300 text-xs uppercase tracking-wider">Effective</th>
                  <th className="px-4 py-3 w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-dark dark:divide-slate-700">
                {pricing.map((row) => (
                  <tr key={row.id} className="hover:bg-cream/30 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 font-body text-navy dark:text-slate-100 font-medium">{row.provider}</td>
                    <td className="px-4 py-3 font-body text-navy">{row.model_id}</td>
                    <td className="px-4 py-3 font-body text-navy/70 dark:text-slate-300 text-right">${row.input_cost_per_1k.toFixed(4)}</td>
                    <td className="px-4 py-3 font-body text-navy/70 dark:text-slate-300 text-right">${row.output_cost_per_1k.toFixed(4)}</td>
                    <td className="px-4 py-3 font-body text-navy/70 dark:text-slate-300 text-right">${row.image_cost_per_unit.toFixed(3)}</td>
                    <td className="px-4 py-3 font-body text-navy/70 dark:text-slate-300 text-right">${row.video_cost_per_second.toFixed(3)}</td>
                    <td className="px-4 py-3 font-body text-navy/50 dark:text-slate-400 text-right text-xs">{row.effective_from}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => editRow(row)}
                        className="text-electric hover:text-electric-bright text-xs font-medium transition-colors"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
