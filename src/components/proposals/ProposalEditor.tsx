'use client';

import { useState } from 'react';
import { ProposalDraft, LineItem } from './ProposalQueueView';

interface Props {
  proposal: ProposalDraft;
  onSave: (updates: {
    line_items: LineItem[];
    email_subject: string;
    email_body: string;
    total_amount: number;
  }) => Promise<void>;
  onCancel: () => void;
}

export default function ProposalEditor({ proposal, onSave, onCancel }: Props) {
  const [lineItems, setLineItems] = useState<LineItem[]>([...proposal.line_items]);
  const [emailSubject, setEmailSubject] = useState(proposal.email_subject);
  const [emailBody, setEmailBody] = useState(proposal.email_body);
  const [saving, setSaving] = useState(false);

  const updateItem = (index: number, field: keyof LineItem, value: string | number) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };

    // Recalculate total price if quantity or unit price changed
    if (field === 'quantity' || field === 'unitPrice') {
      updated[index].totalPrice = (updated[index].quantity || 1) * (updated[index].unitPrice || 0);
    }

    setLineItems(updated);
  };

  const addItem = () => {
    setLineItems([
      ...lineItems,
      { product: '', category: 'other', quantity: 1, unitPrice: 0, totalPrice: 0, notes: null },
    ]);
  };

  const removeItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const totalAmount = lineItems.reduce((sum, item) => sum + item.totalPrice, 0);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        line_items: lineItems,
        email_subject: emailSubject,
        email_body: emailBody,
        total_amount: totalAmount,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Line Items Editor */}
      <div className="space-y-2">
        {lineItems.map((item, i) => (
          <div key={i} className="flex gap-2 items-start">
            <input
              type="text"
              value={item.product}
              onChange={(e) => updateItem(i, 'product', e.target.value)}
              placeholder="Product name"
              className="flex-1 px-2 py-1.5 text-sm border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
            />
            <select
              value={item.category}
              onChange={(e) => updateItem(i, 'category', e.target.value)}
              className="w-28 px-2 py-1.5 text-sm border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
            >
              <option value="arch">Arch</option>
              <option value="bouquet">Bouquet</option>
              <option value="wall">Wall</option>
              <option value="banner">Banner</option>
              <option value="garland">Garland</option>
              <option value="centerpiece">Centerpiece</option>
              <option value="marquee_letter">Marquee</option>
              <option value="other">Other</option>
            </select>
            <input
              type="number"
              value={item.quantity}
              onChange={(e) => updateItem(i, 'quantity', parseInt(e.target.value) || 1)}
              min={1}
              className="w-14 px-2 py-1.5 text-sm border rounded text-right dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
            />
            <input
              type="number"
              value={item.unitPrice}
              onChange={(e) => updateItem(i, 'unitPrice', parseFloat(e.target.value) || 0)}
              min={0}
              step={0.01}
              className="w-20 px-2 py-1.5 text-sm border rounded text-right dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
            />
            <span className="w-20 py-1.5 text-sm text-right font-medium text-gray-900 dark:text-gray-100">
              ${item.totalPrice.toLocaleString()}
            </span>
            <button
              onClick={() => removeItem(i)}
              className="text-red-400 hover:text-red-600 p-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}

        <div className="flex items-center justify-between pt-2">
          <button
            onClick={addItem}
            className="text-sm text-pink-600 hover:text-pink-700 dark:text-pink-400"
          >
            + Add Line Item
          </button>
          <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
            Total: ${totalAmount.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Email Editor */}
      <div className="space-y-2">
        <input
          type="text"
          value={emailSubject}
          onChange={(e) => setEmailSubject(e.target.value)}
          placeholder="Email subject"
          className="w-full px-3 py-2 text-sm border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100"
        />
        <textarea
          value={emailBody}
          onChange={(e) => setEmailBody(e.target.value)}
          rows={10}
          className="w-full px-3 py-2 text-sm border rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 resize-y"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save & Approve'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium transition-colors dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
