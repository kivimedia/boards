'use client';

import { useState, useEffect } from 'react';
import { ASSET_TYPE_ICONS, ASSET_TYPE_LABELS } from '@/lib/asset-library';
import type { Asset, AssetCollection } from '@/lib/types';
import Button from '@/components/ui/Button';

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface AssetDetailProps {
  asset: Asset;
  onClose: () => void;
}

export default function AssetDetail({ asset, onClose }: AssetDetailProps) {
  const [versions, setVersions] = useState<Asset[]>([]);
  const [collections, setCollections] = useState<AssetCollection[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [currentTags, setCurrentTags] = useState<string[]>(asset.tags || []);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchVersions = async () => {
      try {
        const res = await fetch(`/api/assets/${asset.id}/versions`);
        const json = await res.json();
        if (json.data) setVersions(json.data);
      } catch {
        // Silently handle fetch errors
      }
    };

    const fetchCollections = async () => {
      try {
        const res = await fetch('/api/assets/collections');
        const json = await res.json();
        if (json.data) setCollections(json.data);
      } catch {
        // Silently handle fetch errors
      }
    };

    fetchVersions();
    fetchCollections();
  }, [asset.id]);

  const handleAddTag = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      const newTag = tagInput.trim().toLowerCase();
      if (!currentTags.includes(newTag)) {
        const updatedTags = [...currentTags, newTag];
        setCurrentTags(updatedTags);
        setTagInput('');

        setSaving(true);
        try {
          await fetch(`/api/assets/${asset.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tags: updatedTags }),
          });
        } finally {
          setSaving(false);
        }
      } else {
        setTagInput('');
      }
    }
  };

  const handleRemoveTag = async (tag: string) => {
    const updatedTags = currentTags.filter((t) => t !== tag);
    setCurrentTags(updatedTags);

    setSaving(true);
    try {
      await fetch(`/api/assets/${asset.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: updatedTags }),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAddToCollection = async (collectionId: string) => {
    try {
      await fetch(`/api/assets/collections/${collectionId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId: asset.id }),
      });
    } catch {
      // Silently handle fetch errors
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[5vh] px-4">
      <div className="fixed inset-0 bg-navy/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl bg-white dark:bg-dark-surface rounded-2xl shadow-modal max-h-[85vh] overflow-y-auto">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-8 h-8 rounded-lg bg-cream-dark dark:bg-slate-800 hover:bg-cream dark:hover:bg-slate-700 flex items-center justify-center text-navy/50 dark:text-slate-400 hover:text-navy dark:hover:text-slate-200 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Preview area */}
        <div className="h-48 bg-cream-dark dark:bg-slate-800 flex items-center justify-center rounded-t-2xl">
          <span className="text-6xl">{ASSET_TYPE_ICONS[asset.asset_type]}</span>
        </div>

        <div className="p-6 space-y-6">
          {/* Header */}
          <div>
            <h2 className="text-xl font-heading font-semibold text-navy dark:text-slate-100 mb-1">{asset.name}</h2>
            <p className="text-sm font-body text-navy/50 dark:text-slate-400">
              {ASSET_TYPE_LABELS[asset.asset_type]} &middot; {formatFileSize(asset.file_size)}
              {asset.mime_type && ` \u00B7 ${asset.mime_type}`}
            </p>
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-cream dark:bg-dark-bg rounded-xl p-4">
              <span className="text-xs font-heading font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider">Version</span>
              <p className="text-sm font-body text-navy dark:text-slate-100 mt-1">{asset.version}</p>
            </div>
            <div className="bg-cream dark:bg-dark-bg rounded-xl p-4">
              <span className="text-xs font-heading font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider">Created</span>
              <p className="text-sm font-body text-navy dark:text-slate-100 mt-1">{formatDate(asset.created_at)}</p>
            </div>
            <div className="bg-cream dark:bg-dark-bg rounded-xl p-4">
              <span className="text-xs font-heading font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider">Source Card</span>
              <p className="text-sm font-body text-navy dark:text-slate-100 mt-1">{asset.source_card_id || '--'}</p>
            </div>
            <div className="bg-cream dark:bg-dark-bg rounded-xl p-4">
              <span className="text-xs font-heading font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wider">Archived</span>
              <p className="text-sm font-body text-navy dark:text-slate-100 mt-1">{asset.is_archived ? 'Yes' : 'No'}</p>
            </div>
          </div>

          {/* Tags (editable) */}
          <div>
            <h3 className="text-sm font-heading font-semibold text-navy dark:text-slate-100 mb-2">
              Tags
              {saving && <span className="ml-2 text-xs text-navy/40 dark:text-slate-500 font-normal">Saving...</span>}
            </h3>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {currentTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => handleRemoveTag(tag)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-electric/10 text-electric rounded-full text-xs font-body hover:bg-electric/20 transition-colors"
                >
                  {tag}
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              ))}
            </div>
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleAddTag}
              placeholder="Add tag and press Enter"
              className="w-full px-3 py-2 rounded-xl bg-white dark:bg-dark-surface border-2 border-navy/20 dark:border-slate-700 text-navy dark:text-slate-100 placeholder:text-navy/40 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-all duration-200 font-body text-sm"
            />
          </div>

          {/* Version History */}
          {versions.length > 1 && (
            <div>
              <h3 className="text-sm font-heading font-semibold text-navy dark:text-slate-100 mb-2">Version History</h3>
              <div className="space-y-2">
                {versions.map((v) => (
                  <div
                    key={v.id}
                    className={`flex items-center justify-between px-4 py-2.5 rounded-xl border-2 ${
                      v.id === asset.id
                        ? 'border-electric/30 bg-electric/5'
                        : 'border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-navy/60 dark:text-slate-400 bg-cream-dark dark:bg-slate-800 px-2 py-0.5 rounded">
                        v{v.version}
                      </span>
                      <span className="text-sm font-body text-navy dark:text-slate-100">{v.name}</span>
                    </div>
                    <span className="text-xs font-body text-navy/40 dark:text-slate-500">
                      {formatDate(v.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Collection Membership */}
          {collections.length > 0 && (
            <div>
              <h3 className="text-sm font-heading font-semibold text-navy dark:text-slate-100 mb-2">Add to Collection</h3>
              <div className="flex flex-wrap gap-2">
                {collections.map((col) => (
                  <Button
                    key={col.id}
                    variant="secondary"
                    size="sm"
                    onClick={() => handleAddToCollection(col.id)}
                  >
                    {col.name}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
