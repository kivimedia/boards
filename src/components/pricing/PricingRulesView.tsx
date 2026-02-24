'use client';

import { useState, useEffect, useCallback } from 'react';

interface PricingRule {
  id: string;
  name: string;
  rule_type: string;
  conditions: Record<string, unknown>;
  value: number;
  formula: string | null;
  is_active: boolean;
  priority: number;
  notes: string | null;
  created_at: string;
}

const RULE_TYPES = [
  { value: 'minimum_charge', label: 'Minimum Charge', description: 'Enforce a minimum order amount' },
  { value: 'mileage_surcharge', label: 'Mileage Surcharge', description: 'Extra fee based on delivery distance/city' },
  { value: 'location_premium', label: 'Location Premium', description: 'Premium for specific venues' },
  { value: 'product_price', label: 'Product Price Override', description: 'Set price for a specific product/category' },
  { value: 'package_discount', label: 'Package Discount', description: 'Discount when multiple items are ordered' },
];

export default function PricingRulesView() {
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [ruleType, setRuleType] = useState('minimum_charge');
  const [value, setValue] = useState('');
  const [priority, setPriority] = useState('100');
  const [notes, setNotes] = useState('');
  const [conditionsJson, setConditionsJson] = useState('{}');

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/pricing-rules');
      const json = await res.json();
      if (json.ok) setRules(json.data || []);
    } catch (err) {
      console.error('Failed to fetch pricing rules:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const resetForm = () => {
    setName('');
    setRuleType('minimum_charge');
    setValue('');
    setPriority('100');
    setNotes('');
    setConditionsJson('{}');
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let conditions = {};
    try {
      conditions = JSON.parse(conditionsJson);
    } catch {
      alert('Invalid JSON in conditions field');
      return;
    }

    const payload = {
      name,
      rule_type: ruleType,
      value: parseFloat(value),
      priority: parseInt(priority),
      conditions,
      notes: notes || null,
    };

    try {
      if (editingId) {
        await fetch(`/api/pricing-rules/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        await fetch('/api/pricing-rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      resetForm();
      fetchRules();
    } catch (err) {
      console.error('Save failed:', err);
    }
  };

  const handleEdit = (rule: PricingRule) => {
    setName(rule.name);
    setRuleType(rule.rule_type);
    setValue(rule.value.toString());
    setPriority(rule.priority.toString());
    setNotes(rule.notes || '');
    setConditionsJson(JSON.stringify(rule.conditions, null, 2));
    setEditingId(rule.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this pricing rule?')) return;
    try {
      await fetch(`/api/pricing-rules/${id}`, { method: 'DELETE' });
      fetchRules();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const handleToggleActive = async (rule: PricingRule) => {
    try {
      await fetch(`/api/pricing-rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !rule.is_active }),
      });
      fetchRules();
    } catch (err) {
      console.error('Toggle failed:', err);
    }
  };

  const getRuleTypeLabel = (type: string) => RULE_TYPES.find((r) => r.value === type)?.label || type;

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {rules.length} pricing rule{rules.length !== 1 ? 's' : ''} configured
        </p>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 text-sm font-medium transition-colors"
        >
          Add Rule
        </button>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="border rounded-lg p-4 dark:border-gray-700 bg-white dark:bg-gray-800/50 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Rule name"
              required
              className="px-3 py-2 text-sm border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
            />
            <select
              value={ruleType}
              onChange={(e) => setRuleType(e.target.value)}
              className="px-3 py-2 text-sm border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
            >
              {RULE_TYPES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <input
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Value ($)"
              step="0.01"
              required
              className="px-3 py-2 text-sm border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
            />
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              placeholder="Priority (lower = first)"
              className="px-3 py-2 text-sm border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
            />
          </div>
          <textarea
            value={conditionsJson}
            onChange={(e) => setConditionsJson(e.target.value)}
            placeholder='Conditions JSON, e.g. {"cities": ["Raleigh", "Durham"]}'
            rows={3}
            className="w-full px-3 py-2 text-sm border rounded-lg font-mono dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
          />
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="w-full px-3 py-2 text-sm border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
          />
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors">
              {editingId ? 'Update' : 'Add'}
            </button>
            <button type="button" onClick={resetForm} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Rules List */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500" />
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className={`border rounded-lg p-4 dark:border-gray-700 bg-white dark:bg-gray-800/50 ${!rule.is_active ? 'opacity-50' : ''}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-gray-900 dark:text-gray-100">{rule.name}</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                      {getRuleTypeLabel(rule.rule_type)}
                    </span>
                    <span className="text-xs text-gray-400">Priority: {rule.priority}</span>
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    Value: <span className="font-semibold">${rule.value.toLocaleString()}</span>
                  </div>
                  {Object.keys(rule.conditions).length > 0 && (
                    <div className="text-xs text-gray-400 mt-1 font-mono">
                      {JSON.stringify(rule.conditions)}
                    </div>
                  )}
                  {rule.notes && (
                    <div className="text-xs text-gray-400 mt-1">{rule.notes}</div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleToggleActive(rule)}
                    className={`w-8 h-5 rounded-full transition-colors ${
                      rule.is_active ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  >
                    <span
                      className={`block w-3.5 h-3.5 rounded-full bg-white shadow transform transition-transform ${
                        rule.is_active ? 'translate-x-3.5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                  <button
                    onClick={() => handleEdit(rule)}
                    className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(rule.id)}
                    className="text-xs text-red-600 hover:text-red-700 dark:text-red-400"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
          {rules.length === 0 && (
            <div className="text-center text-gray-400 py-8">
              No pricing rules configured. Add your first rule above.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
