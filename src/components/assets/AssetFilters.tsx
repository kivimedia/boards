'use client';

import { useState, useEffect } from 'react';
import { ASSET_TYPE_LABELS, ASSET_TYPE_ICONS } from '@/lib/asset-library';
import type { AssetType, Client } from '@/lib/types';

export interface AssetFilterValues {
  assetTypes: AssetType[];
  clientId: string;
  tags: string[];
}

interface AssetFiltersProps {
  onFilterChange: (filters: AssetFilterValues) => void;
}

const ALL_ASSET_TYPES: AssetType[] = ['image', 'video', 'document', 'audio', 'font', 'archive', 'other'];

export default function AssetFilters({ onFilterChange }: AssetFiltersProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<AssetType[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  useEffect(() => {
    const fetchClients = async () => {
      try {
        const res = await fetch('/api/clients');
        const json = await res.json();
        if (json.data) setClients(json.data);
      } catch {
        // Silently handle fetch errors
      }
    };
    fetchClients();
  }, []);

  useEffect(() => {
    onFilterChange({ assetTypes: selectedTypes, clientId: selectedClientId, tags });
  }, [selectedTypes, selectedClientId, tags, onFilterChange]);

  const toggleType = (type: AssetType) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      const newTag = tagInput.trim().toLowerCase();
      if (!tags.includes(newTag)) {
        setTags((prev) => [...prev, newTag]);
      }
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  };

  return (
    <aside className="w-64 shrink-0 bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-5 space-y-6">
      {/* Asset Type Checkboxes */}
      <div>
        <h3 className="text-sm font-heading font-semibold text-navy dark:text-slate-100 mb-3">Asset Type</h3>
        <div className="space-y-2">
          {ALL_ASSET_TYPES.map((type) => (
            <label
              key={type}
              className="flex items-center gap-2.5 cursor-pointer group"
            >
              <input
                type="checkbox"
                checked={selectedTypes.includes(type)}
                onChange={() => toggleType(type)}
                className="w-4 h-4 rounded border-navy/30 dark:border-slate-600 text-electric focus:ring-electric/30"
              />
              <span className="text-sm font-body text-navy/70 dark:text-slate-300 group-hover:text-navy dark:group-hover:text-slate-100 transition-colors">
                {ASSET_TYPE_ICONS[type]} {ASSET_TYPE_LABELS[type]}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Client Dropdown */}
      <div>
        <h3 className="text-sm font-heading font-semibold text-navy dark:text-slate-100 mb-3">Client</h3>
        <select
          value={selectedClientId}
          onChange={(e) => setSelectedClientId(e.target.value)}
          className="w-full px-3 py-2 rounded-xl bg-white dark:bg-dark-surface border-2 border-navy/20 dark:border-slate-700 text-navy dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-all duration-200 font-body text-sm"
        >
          <option value="">All Clients</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
      </div>

      {/* Tag Input */}
      <div>
        <h3 className="text-sm font-heading font-semibold text-navy dark:text-slate-100 mb-3">Tags</h3>
        <input
          type="text"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={handleAddTag}
          placeholder="Type tag and press Enter"
          className="w-full px-3 py-2 rounded-xl bg-white dark:bg-dark-surface border-2 border-navy/20 dark:border-slate-700 text-navy dark:text-slate-100 placeholder:text-navy/40 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-all duration-200 font-body text-sm"
        />
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {tags.map((tag) => (
              <button
                key={tag}
                onClick={() => removeTag(tag)}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-electric/10 text-electric rounded-full text-xs font-body hover:bg-electric/20 transition-colors"
              >
                {tag}
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Clear Filters */}
      {(selectedTypes.length > 0 || selectedClientId || tags.length > 0) && (
        <button
          onClick={() => {
            setSelectedTypes([]);
            setSelectedClientId('');
            setTags([]);
            setTagInput('');
          }}
          className="w-full text-center text-sm font-body text-navy/50 dark:text-slate-400 hover:text-electric transition-colors"
        >
          Clear all filters
        </button>
      )}
    </aside>
  );
}
