'use client';

import { useState, useEffect, useCallback } from 'react';
import Divi5ModulePicker from './Divi5ModulePicker';

interface SiteOption {
  id: string;
  name: string;
}

interface KBMapping {
  id: string;
  site_profile_id: string | null;
  figma_element_type: string;
  divi5_module: string;
  divi5_config: Record<string, unknown>;
  confidence_score: number;
  times_approved: number;
  times_overridden: number;
  was_overridden: boolean;
  created_at: string;
  updated_at: string;
}

interface PageForgeMappingsAdminProps {
  sites: SiteOption[];
}

type SortKey = 'figma_element_type' | 'divi5_module' | 'confidence_score' | 'times_used';
type SortDir = 'asc' | 'desc';

function parseSlugs(moduleString: string): string[] {
  return moduleString
    .split('+')
    .map(s => s.replace(/\(.*?\)/g, '').trim())
    .filter(Boolean);
}

function slugsToString(slugs: string[]): string {
  return slugs.join(' + ');
}

export default function PageForgeMappingsAdmin({ sites }: PageForgeMappingsAdminProps) {
  const [mappings, setMappings] = useState<KBMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [siteFilter, setSiteFilter] = useState<string>('');
  const [sortKey, setSortKey] = useState<SortKey>('figma_element_type');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFigmaType, setEditFigmaType] = useState('');
  const [editSlugs, setEditSlugs] = useState<string[]>([]);
  const [addingNew, setAddingNew] = useState(false);
  const [newFigmaType, setNewFigmaType] = useState('');
  const [newSlugs, setNewSlugs] = useState<string[]>([]);
  const [newSiteId, setNewSiteId] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchMappings = useCallback(async () => {
    setLoading(true);
    try {
      const url = siteFilter
        ? `/api/pageforge/mappings?site_profile_id=${siteFilter}`
        : '/api/pageforge/mappings';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setMappings(data.mappings || []);
      }
    } catch (err) {
      console.error('Failed to fetch mappings:', err);
    } finally {
      setLoading(false);
    }
  }, [siteFilter]);

  useEffect(() => { fetchMappings(); }, [fetchMappings]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sorted = [...mappings].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortKey === 'times_used') {
      return ((a.times_approved + a.times_overridden) - (b.times_approved + b.times_overridden)) * dir;
    }
    if (sortKey === 'confidence_score') {
      return (a.confidence_score - b.confidence_score) * dir;
    }
    const aVal = a[sortKey] || '';
    const bVal = b[sortKey] || '';
    return aVal.localeCompare(bVal) * dir;
  });

  const sortArrow = (key: SortKey) =>
    sortKey === key ? (sortDir === 'asc' ? ' \u25B2' : ' \u25BC') : '';

  // Edit handlers
  const startEdit = (m: KBMapping) => {
    setEditingId(m.id);
    setEditFigmaType(m.figma_element_type);
    setEditSlugs(parseSlugs(m.divi5_module));
    setAddingNew(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditFigmaType('');
    setEditSlugs([]);
  };

  const saveEdit = async () => {
    if (!editingId || !editFigmaType.trim() || editSlugs.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/pageforge/mappings/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          figma_element_type: editFigmaType.trim(),
          divi5_module: slugsToString(editSlugs),
        }),
      });
      if (res.ok) {
        showToast('success', 'Mapping updated');
        cancelEdit();
        await fetchMappings();
      } else {
        const err = await res.json();
        showToast('error', err.error || 'Failed to update');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/pageforge/mappings/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('success', 'Mapping deleted');
        setMappings(prev => prev.filter(m => m.id !== id));
      } else {
        showToast('error', 'Failed to delete');
      }
    } finally {
      setSaving(false);
    }
  };

  // Add new mapping
  const startAddNew = () => {
    setAddingNew(true);
    setNewFigmaType('');
    setNewSlugs([]);
    setNewSiteId(siteFilter || '');
    cancelEdit();
  };

  const cancelAddNew = () => {
    setAddingNew(false);
    setNewFigmaType('');
    setNewSlugs([]);
  };

  const saveNew = async () => {
    if (!newFigmaType.trim() || newSlugs.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch('/api/pageforge/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_profile_id: newSiteId || null,
          figma_element_type: newFigmaType.trim(),
          divi5_module: slugsToString(newSlugs),
        }),
      });
      if (res.ok) {
        showToast('success', 'Mapping created');
        cancelAddNew();
        await fetchMappings();
      } else {
        const err = await res.json();
        showToast('error', err.error || 'Failed to create');
      }
    } finally {
      setSaving(false);
    }
  };

  const confidenceColor = (score: number) => {
    if (score >= 0.75) return 'bg-green-500';
    if (score >= 0.5) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <select
            value={siteFilter}
            onChange={(e) => setSiteFilter(e.target.value)}
            className="text-xs px-3 py-2 rounded-lg border border-navy/15 dark:border-slate-600 bg-white dark:bg-slate-800 text-navy dark:text-slate-200 font-body"
          >
            <option value="">All Sites</option>
            {sites.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <span className="text-xs text-navy/40 dark:text-slate-500 font-body">
            {mappings.length} mapping{mappings.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          onClick={startAddNew}
          disabled={addingNew}
          className="px-4 py-2 text-xs font-semibold text-white bg-electric rounded-lg hover:bg-electric/90 transition-colors disabled:opacity-50 font-heading"
        >
          + Add Mapping
        </button>
      </div>

      {/* Add new form */}
      {addingNew && (
        <div className="rounded-xl border-2 border-electric/30 dark:border-electric/20 bg-white dark:bg-slate-800 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-navy dark:text-slate-200 font-heading">
            New Mapping
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-[11px] font-medium text-navy/60 dark:text-slate-400 mb-1 block">
                Figma Element Type
              </label>
              <input
                type="text"
                value={newFigmaType}
                onChange={(e) => setNewFigmaType(e.target.value)}
                placeholder="e.g. hero, features, testimonials"
                className="w-full text-xs px-3 py-2 rounded-lg border border-navy/15 dark:border-slate-600 bg-white dark:bg-slate-700 text-navy dark:text-slate-200 focus:ring-1 focus:ring-electric"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-navy/60 dark:text-slate-400 mb-1 block">
                Site Profile
              </label>
              <select
                value={newSiteId}
                onChange={(e) => setNewSiteId(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-lg border border-navy/15 dark:border-slate-600 bg-white dark:bg-slate-700 text-navy dark:text-slate-200"
              >
                <option value="">Global (all sites)</option>
                {sites.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium text-navy/60 dark:text-slate-400 mb-1 block">
              Divi 5 Modules
            </label>
            <Divi5ModulePicker selectedSlugs={newSlugs} onChange={setNewSlugs} />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={saveNew}
              disabled={saving || !newFigmaType.trim() || newSlugs.length === 0}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-electric rounded-lg hover:bg-electric/90 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Mapping'}
            </button>
            <button
              onClick={cancelAddNew}
              className="px-3 py-1.5 text-xs text-navy/50 dark:text-slate-400 hover:text-navy dark:hover:text-slate-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="p-8 text-center text-sm text-navy/40 dark:text-slate-500 animate-pulse">
          Loading mappings...
        </div>
      ) : mappings.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-slate-800 rounded-xl border border-navy/10 dark:border-slate-700">
          <p className="text-sm text-navy/40 dark:text-slate-500 font-body">
            No mappings found. Add a mapping to teach the AI which Divi 5 modules to use.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-navy/10 dark:border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-body">
              <thead>
                <tr className="border-b border-cream-dark dark:border-slate-700 bg-cream/30 dark:bg-navy/30">
                  <th
                    className="text-left px-4 py-2.5 font-semibold text-navy/60 dark:text-slate-400 cursor-pointer select-none hover:text-navy dark:hover:text-slate-100"
                    onClick={() => handleSort('figma_element_type')}
                  >
                    Figma Type{sortArrow('figma_element_type')}
                  </th>
                  <th
                    className="text-left px-4 py-2.5 font-semibold text-navy/60 dark:text-slate-400 cursor-pointer select-none hover:text-navy dark:hover:text-slate-100"
                    onClick={() => handleSort('divi5_module')}
                  >
                    Divi 5 Modules{sortArrow('divi5_module')}
                  </th>
                  <th
                    className="text-center px-4 py-2.5 font-semibold text-navy/60 dark:text-slate-400 cursor-pointer select-none hover:text-navy dark:hover:text-slate-100 w-20"
                    onClick={() => handleSort('confidence_score')}
                  >
                    Conf{sortArrow('confidence_score')}
                  </th>
                  <th
                    className="text-center px-4 py-2.5 font-semibold text-navy/60 dark:text-slate-400 cursor-pointer select-none hover:text-navy dark:hover:text-slate-100 w-16"
                    onClick={() => handleSort('times_used')}
                  >
                    Used{sortArrow('times_used')}
                  </th>
                  <th className="text-right px-4 py-2.5 font-semibold text-navy/60 dark:text-slate-400 w-28">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((m) => (
                  <MappingRow
                    key={m.id}
                    mapping={m}
                    isEditing={editingId === m.id}
                    editFigmaType={editFigmaType}
                    editSlugs={editSlugs}
                    saving={saving}
                    confidenceColor={confidenceColor}
                    onStartEdit={() => startEdit(m)}
                    onCancelEdit={cancelEdit}
                    onSaveEdit={saveEdit}
                    onDelete={() => handleDelete(m.id)}
                    onEditFigmaTypeChange={setEditFigmaType}
                    onEditSlugsChange={setEditSlugs}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg text-sm font-body z-50 shadow-lg ${
          toast.type === 'success' ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

// Extracted row component to keep the table clean
interface MappingRowProps {
  mapping: KBMapping;
  isEditing: boolean;
  editFigmaType: string;
  editSlugs: string[];
  saving: boolean;
  confidenceColor: (score: number) => string;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  onEditFigmaTypeChange: (val: string) => void;
  onEditSlugsChange: (slugs: string[]) => void;
}

function MappingRow({
  mapping: m,
  isEditing,
  editFigmaType,
  editSlugs,
  saving,
  confidenceColor,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onEditFigmaTypeChange,
  onEditSlugsChange,
}: MappingRowProps) {
  const timesUsed = m.times_approved + m.times_overridden;
  const confPct = Math.round(m.confidence_score * 100);

  return (
    <>
      <tr className={`border-b border-cream-dark/50 dark:border-slate-800 ${isEditing ? 'bg-electric/5 dark:bg-electric/5' : 'hover:bg-cream/50 dark:hover:bg-navy/20'}`}>
        <td className="px-4 py-3">
          <span className="font-medium text-navy dark:text-slate-200">{m.figma_element_type}</span>
        </td>
        <td className="px-4 py-3">
          <code className="text-[11px] font-mono text-navy/70 dark:text-slate-300 bg-navy/5 dark:bg-slate-700 px-1.5 py-0.5 rounded">
            {m.divi5_module}
          </code>
        </td>
        <td className="px-4 py-3 text-center">
          <div className="flex items-center justify-center gap-1.5">
            <div className="w-10 h-1.5 rounded-full bg-navy/10 dark:bg-slate-600 overflow-hidden">
              <div
                className={`h-full rounded-full ${confidenceColor(m.confidence_score)}`}
                style={{ width: `${confPct}%` }}
              />
            </div>
            <span className="text-navy/50 dark:text-slate-400">{confPct}%</span>
          </div>
        </td>
        <td className="px-4 py-3 text-center text-navy/50 dark:text-slate-400">
          {timesUsed}x
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-1.5">
            {isEditing ? (
              <button
                onClick={onCancelEdit}
                className="text-[11px] px-2 py-1 text-navy/40 dark:text-slate-500 hover:text-navy dark:hover:text-slate-300"
              >
                Cancel
              </button>
            ) : (
              <>
                <button
                  onClick={onStartEdit}
                  disabled={saving}
                  className="text-[11px] px-2 py-1 rounded bg-electric/10 text-electric font-medium hover:bg-electric/20 transition-colors disabled:opacity-50"
                >
                  Edit
                </button>
                <button
                  onClick={onDelete}
                  disabled={saving}
                  className="text-[11px] px-2 py-1 rounded bg-red-500/10 text-red-500 font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50"
                >
                  Delete
                </button>
              </>
            )}
          </div>
        </td>
      </tr>

      {/* Inline edit row */}
      {isEditing && (
        <tr className="bg-electric/5 dark:bg-electric/5">
          <td colSpan={5} className="px-4 py-4">
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-medium text-navy/60 dark:text-slate-400 mb-1 block">
                  Figma Element Type
                </label>
                <input
                  type="text"
                  value={editFigmaType}
                  onChange={(e) => onEditFigmaTypeChange(e.target.value)}
                  className="w-full max-w-xs text-xs px-3 py-2 rounded-lg border border-navy/15 dark:border-slate-600 bg-white dark:bg-slate-700 text-navy dark:text-slate-200 focus:ring-1 focus:ring-electric"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-navy/60 dark:text-slate-400 mb-1 block">
                  Divi 5 Modules
                </label>
                <Divi5ModulePicker selectedSlugs={editSlugs} onChange={onEditSlugsChange} />
              </div>
              <button
                onClick={onSaveEdit}
                disabled={saving || !editFigmaType.trim() || editSlugs.length === 0}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-electric rounded-lg hover:bg-electric/90 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
