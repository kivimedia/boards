'use client';

import { useState, useRef, useCallback } from 'react';

interface ParsedLead {
  full_name: string;
  linkedin_url?: string;
  company_name?: string;
  job_position?: string;
  city?: string;
  state?: string;
  country?: string;
  connection_degree?: number;
  email?: string;
  company_url?: string;
  pre_qualified?: boolean;
}

interface PreviewResult {
  leads: (ParsedLead & { is_duplicate?: boolean; duplicate_reason?: string })[];
  total_parsed: number;
  duplicates: number;
}

interface LeadImportModalProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

export default function LeadImportModal({ open, onClose, onImported }: LeadImportModalProps) {
  const [tab, setTab] = useState<'csv' | 'paste'>('csv');
  const [content, setContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ imported: number; batch_id: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setContent('');
    setFileName('');
    setPreview(null);
    setSelectedIndices(new Set());
    setError('');
    setResult(null);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      setContent(evt.target?.result as string);
    };
    reader.readAsText(file);
  };

  const handlePreview = async () => {
    if (!content.trim()) {
      setError('Please provide content to import');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/outreach/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: tab, content, confirm: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to parse');

      const previewData = data.data as PreviewResult;
      setPreview(previewData);
      // Select all non-duplicates by default
      const selected = new Set<number>();
      previewData.leads.forEach((lead, i) => {
        if (!lead.is_duplicate) selected.add(i);
      });
      setSelectedIndices(selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Parse error');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!preview) return;
    setConfirming(true);
    setError('');
    try {
      const res = await fetch('/api/outreach/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: tab,
          content,
          selected_indices: Array.from(selectedIndices),
          confirm: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');

      setResult(data.data);
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import error');
    } finally {
      setConfirming(false);
    }
  };

  const toggleAll = () => {
    if (!preview) return;
    if (selectedIndices.size === preview.leads.filter(l => !l.is_duplicate).length) {
      setSelectedIndices(new Set());
    } else {
      const all = new Set<number>();
      preview.leads.forEach((lead, i) => {
        if (!lead.is_duplicate) all.add(i);
      });
      setSelectedIndices(all);
    }
  };

  const toggleIndex = (idx: number) => {
    const next = new Set(selectedIndices);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setSelectedIndices(next);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[2vh] sm:pt-[5vh] px-2 sm:px-4">
      <div className="fixed inset-0 bg-navy/60 backdrop-blur-sm dark:bg-black/70" onClick={onClose} />
      <div className="relative bg-white dark:bg-dark-surface rounded-2xl shadow-modal w-full max-w-2xl max-h-[92vh] sm:max-h-[88vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white dark:bg-dark-surface px-6 pt-5 pb-4 border-b border-cream-dark dark:border-slate-700 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-navy dark:text-slate-100 font-heading">Import Leads</h2>
              <p className="text-xs text-navy/40 dark:text-slate-500 font-body mt-0.5">
                CSV upload or paste LinkedIn search results
              </p>
            </div>
            <button onClick={onClose} className="text-navy/30 hover:text-navy/60 dark:text-slate-600 dark:hover:text-slate-400 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-4">
          {result ? (
            /* Success state */
            <div className="text-center py-8">
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600 dark:text-green-400">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <p className="text-lg font-bold text-navy dark:text-white font-heading">
                {result.imported} leads imported
              </p>
              <p className="text-xs text-navy/40 dark:text-slate-500 font-body mt-1">
                Ready for enrichment and qualification
              </p>
              <button
                onClick={() => { resetState(); onClose(); }}
                className="mt-4 px-5 py-2.5 text-sm font-semibold text-white bg-electric hover:bg-electric-bright rounded-lg transition-colors"
              >
                Done
              </button>
            </div>
          ) : !preview ? (
            /* Input state */
            <>
              {/* Tabs */}
              <div className="flex gap-1 bg-cream dark:bg-dark-card rounded-lg p-1">
                <button
                  onClick={() => { setTab('csv'); resetState(); }}
                  className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors ${
                    tab === 'csv'
                      ? 'bg-white dark:bg-dark-surface text-navy dark:text-white shadow-sm'
                      : 'text-navy/50 dark:text-slate-400 hover:text-navy dark:hover:text-white'
                  }`}
                >
                  CSV Upload
                </button>
                <button
                  onClick={() => { setTab('paste'); resetState(); }}
                  className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors ${
                    tab === 'paste'
                      ? 'bg-white dark:bg-dark-surface text-navy dark:text-white shadow-sm'
                      : 'text-navy/50 dark:text-slate-400 hover:text-navy dark:hover:text-white'
                  }`}
                >
                  Paste & Parse
                </button>
              </div>

              {tab === 'csv' ? (
                <div>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-navy/15 dark:border-slate-600 rounded-xl p-8 text-center cursor-pointer hover:border-electric dark:hover:border-electric transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto text-navy/30 dark:text-slate-600 mb-2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    {fileName ? (
                      <p className="text-sm font-semibold text-navy dark:text-white font-heading">{fileName}</p>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-navy/60 dark:text-slate-400 font-body">
                          Click to upload CSV
                        </p>
                        <p className="text-[10px] text-navy/30 dark:text-slate-600 mt-1 font-body">
                          Sales Navigator, LinkedIn export, or any CSV with name + LinkedIn URL
                        </p>
                      </>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.tsv,.txt"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
              ) : (
                <div>
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Paste LinkedIn search results here...&#10;&#10;Each result typically looks like:&#10;John Smith&#10;2nd&#10;Professional Magician at Magic Co&#10;Charlotte, NC"
                    rows={10}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-dark-card border-2 border-navy/10 dark:border-slate-700 text-navy dark:text-slate-100 placeholder:text-navy/30 dark:placeholder:text-slate-600 text-sm font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-all resize-none"
                  />
                  <p className="text-[10px] text-navy/30 dark:text-slate-600 mt-1 font-body">
                    Also supports a plain list of LinkedIn profile URLs (one per line)
                  </p>
                </div>
              )}
            </>
          ) : (
            /* Preview state */
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <p className="text-sm font-semibold text-navy dark:text-white font-heading">
                    {preview.total_parsed} leads found
                  </p>
                  {preview.duplicates > 0 && (
                    <span className="px-2 py-0.5 text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full">
                      {preview.duplicates} duplicates
                    </span>
                  )}
                </div>
                <button onClick={() => setPreview(null)} className="text-xs text-electric hover:text-electric-bright font-semibold">
                  Back
                </button>
              </div>

              <div className="flex items-center gap-2 mb-1">
                <input
                  type="checkbox"
                  checked={selectedIndices.size === preview.leads.filter(l => !l.is_duplicate).length}
                  onChange={toggleAll}
                  className="rounded border-navy/20 dark:border-slate-600"
                />
                <span className="text-xs text-navy/50 dark:text-slate-400 font-body">
                  {selectedIndices.size} selected
                </span>
              </div>

              <div className="max-h-[40vh] overflow-y-auto space-y-1 pr-1">
                {preview.leads.map((lead, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-3 p-2.5 rounded-lg border transition-colors ${
                      lead.is_duplicate
                        ? 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 opacity-60'
                        : selectedIndices.has(idx)
                        ? 'border-electric/30 dark:border-electric/20 bg-electric/5 dark:bg-electric/5'
                        : 'border-cream-dark dark:border-slate-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIndices.has(idx)}
                      onChange={() => toggleIndex(idx)}
                      disabled={lead.is_duplicate}
                      className="rounded border-navy/20 dark:border-slate-600 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-navy dark:text-white font-heading truncate">
                          {lead.full_name}
                        </p>
                        {lead.pre_qualified && (
                          <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full shrink-0">
                            Match
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-navy/50 dark:text-slate-400 font-body truncate">
                        {[lead.job_position, lead.company_name, lead.city].filter(Boolean).join(' - ')}
                      </p>
                      {lead.is_duplicate && (
                        <p className="text-[10px] text-amber-600 dark:text-amber-400 font-body mt-0.5">
                          Duplicate: {lead.duplicate_reason}
                        </p>
                      )}
                    </div>
                    {lead.connection_degree && (
                      <span className="text-[10px] text-navy/30 dark:text-slate-600 font-body shrink-0">
                        {lead.connection_degree}nd
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-xs text-red-700 dark:text-red-300 font-body">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {!result && (
          <div className="sticky bottom-0 bg-white dark:bg-dark-surface px-6 py-4 border-t border-cream-dark dark:border-slate-700 rounded-b-2xl">
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2.5 text-sm font-semibold text-navy/60 dark:text-slate-400 hover:text-navy dark:hover:text-white transition-colors"
              >
                Cancel
              </button>
              {!preview ? (
                <button
                  onClick={handlePreview}
                  disabled={loading || !content.trim()}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-electric hover:bg-electric-bright rounded-lg disabled:opacity-50 transition-colors"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Parsing...
                    </span>
                  ) : 'Preview'}
                </button>
              ) : (
                <button
                  onClick={handleConfirm}
                  disabled={confirming || selectedIndices.size === 0}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-electric hover:bg-electric-bright rounded-lg disabled:opacity-50 transition-colors"
                >
                  {confirming ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Importing...
                    </span>
                  ) : `Import ${selectedIndices.size} Leads`}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
