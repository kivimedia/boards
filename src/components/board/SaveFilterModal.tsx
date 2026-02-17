'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';

interface SaveFilterModalProps {
  boardId: string;
  filterConfig: Record<string, unknown>;
  onSave: () => void;
  onClose: () => void;
}

export default function SaveFilterModal({
  boardId,
  filterConfig,
  onSave,
  onClose,
}: SaveFilterModalProps) {
  const [name, setName] = useState('');
  const [isShared, setIsShared] = useState(false);
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);

    try {
      await fetch(`/api/boards/${boardId}/saved-filters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          filter_config: filterConfig,
          is_shared: isShared,
          is_default: isDefault,
        }),
      });
      onSave();
    } catch {
      // Error handling left to caller
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} size="sm">
      <div className="p-6">
        <h2 className="text-lg font-semibold text-navy dark:text-slate-100 font-heading mb-4">
          Save Filter
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-navy/70 dark:text-slate-300 mb-1.5 font-body">
              Filter Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My urgent cards"
              className="w-full p-2.5 rounded-xl bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric font-body"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
              }}
            />
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={isShared}
              onChange={(e) => setIsShared(e.target.checked)}
              className="w-4 h-4 rounded border-cream-dark dark:border-slate-600 text-electric focus:ring-electric/30"
            />
            <span className="text-sm text-navy dark:text-slate-100 font-body">Share with team</span>
          </label>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="w-4 h-4 rounded border-cream-dark dark:border-slate-600 text-electric focus:ring-electric/30"
            />
            <span className="text-sm text-navy dark:text-slate-100 font-body">Set as default</span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 mt-6">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} loading={saving} disabled={!name.trim()}>
            Save Filter
          </Button>
        </div>
      </div>
    </Modal>
  );
}
