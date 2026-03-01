'use client';

import { useState, useEffect } from 'react';
import { Client } from '@/lib/types';
import { AssetCategory, AssetLink, DiscoveredCard, FileAttachment } from '@/lib/offboarding';
import Button from '@/components/ui/Button';

interface OffboardingWizardProps {
  preselectedClientId?: string;
}

interface DiscoveryResult {
  client: Client;
  searchTerms: string[];
  cards: DiscoveredCard[];
  assets: Record<AssetCategory, AssetLink[]>;
  fileAttachments: FileAttachment[];
  credentialCount: number;
  summary: {
    totalCards: number;
    directCards: number;
    heuristicCards: number;
    figmaLinks: number;
    canvaLinks: number;
    dropboxLinks: number;
    driveLinks: number;
    otherLinks: number;
    fileCount: number;
    credentialCount: number;
  };
}

type Step = 'select' | 'discover' | 'report';

export default function OffboardingWizard({ preselectedClientId }: OffboardingWizardProps) {
  const [step, setStep] = useState<Step>('select');
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState(preselectedClientId || '');
  const [loading, setLoading] = useState(false);
  const [loadingClients, setLoadingClients] = useState(true);
  const [discovery, setDiscovery] = useState<DiscoveryResult | null>(null);
  const [extraTerms, setExtraTerms] = useState('');
  const [generating, setGenerating] = useState(false);
  const [reportUrl, setReportUrl] = useState<string | null>(null);
  const [reportFormat, setReportFormat] = useState<'google_sheet' | 'csv'>('csv');
  const [includeCredentials, setIncludeCredentials] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch clients on mount
  useEffect(() => {
    fetch('/api/clients')
      .then(r => r.json())
      .then(json => {
        if (json.data) setClients(json.data);
      })
      .finally(() => setLoadingClients(false));
  }, []);

  // Auto-start discovery if preselected
  useEffect(() => {
    if (preselectedClientId && clients.length > 0) {
      handleDiscover();
    }
  }, [preselectedClientId, clients]);

  const handleDiscover = async () => {
    if (!selectedClientId) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/clients/${selectedClientId}/offboarding/discover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          extraSearchTerms: extraTerms.split(',').map(t => t.trim()).filter(Boolean),
        }),
      });

      const json = await res.json();
      if (json.data) {
        setDiscovery(json.data);
        setStep('discover');
      } else {
        setError(json.error || 'Discovery failed');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateReport = async () => {
    if (!discovery) return;
    setGenerating(true);
    setError(null);

    try {
      const res = await fetch(`/api/clients/${selectedClientId}/offboarding/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          includeCredentials,
          format: reportFormat,
          extraSearchTerms: extraTerms.split(',').map(t => t.trim()).filter(Boolean),
        }),
      });

      if (reportFormat === 'csv') {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${discovery.client.name.replace(/[^a-zA-Z0-9]/g, '_')}_Offboarding.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setStep('report');
        setReportUrl('downloaded');
      } else {
        const json = await res.json();
        if (json.data?.sheetUrl) {
          setReportUrl(json.data.sheetUrl);
          setStep('report');
        } else {
          setError(json.error || 'Failed to create Google Sheet');
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const selectedClient = clients.find(c => c.id === selectedClientId);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Step indicator */}
      <div className="flex items-center gap-4 mb-8">
        {([
          { key: 'select', idx: 0, label: '1. Select Client' },
          { key: 'discover', idx: 1, label: '2. Review Assets' },
          { key: 'report', idx: 2, label: '3. Report' },
        ] as const).map(({ key, idx, label }) => {
          const currentIdx = step === 'select' ? 0 : step === 'discover' ? 1 : 2;
          const isActive = step === key;
          const isCompleted = idx < currentIdx;
          return (
            <div
              key={key}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-electric text-white'
                  : isCompleted
                    ? 'bg-electric/10 text-electric'
                    : 'bg-cream-dark dark:bg-slate-800 text-navy/40 dark:text-slate-500'
              }`}
            >
              {label}
            </div>
          );
        })}
      </div>

      {error && (
        <div className="mb-6 p-4 bg-danger/10 border border-danger/20 rounded-xl text-danger text-sm">
          {error}
        </div>
      )}

      {/* Step 1: Select Client */}
      {step === 'select' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-navy dark:text-white font-heading mb-2">
              Client Offboarding Report
            </h2>
            <p className="text-navy/60 dark:text-slate-400 font-body">
              Select a client to generate a comprehensive handoff report. We'll scan all boards for related cards,
              collect Figma, Canva, Dropbox, and Drive links, and include credentials from the vault.
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-navy dark:text-slate-300 mb-2 font-heading">
              Select Client
            </label>
            {loadingClients ? (
              <div className="text-navy/40 dark:text-slate-500 text-sm">Loading clients...</div>
            ) : (
              <select
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-slate-900 text-navy dark:text-white font-body focus:outline-none focus:ring-2 focus:ring-brand"
              >
                <option value="">Choose a client...</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.company ? ` - ${c.company}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {selectedClient && (
            <div className="p-4 bg-cream dark:bg-slate-800/50 rounded-xl border border-cream-dark dark:border-slate-700">
              <div className="text-sm space-y-1 text-navy/70 dark:text-slate-400 font-body">
                <div><strong>Name:</strong> {selectedClient.name}</div>
                {selectedClient.company && <div><strong>Company:</strong> {selectedClient.company}</div>}
                {selectedClient.email && <div><strong>Email:</strong> {selectedClient.email}</div>}
                {selectedClient.phone && <div><strong>Phone:</strong> {selectedClient.phone}</div>}
                {selectedClient.contract_type && <div><strong>Contract:</strong> {selectedClient.contract_type}</div>}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-navy dark:text-slate-300 mb-2 font-heading">
              Extra Search Terms (optional)
            </label>
            <input
              type="text"
              value={extraTerms}
              onChange={(e) => setExtraTerms(e.target.value)}
              placeholder="e.g. website.com, brand name, product name (comma separated)"
              className="w-full px-4 py-3 rounded-xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-slate-900 text-navy dark:text-white font-body focus:outline-none focus:ring-2 focus:ring-brand"
            />
            <p className="text-xs text-navy/40 dark:text-slate-500 mt-1">
              We'll automatically search using the client's name, company, and any domains found in their cards.
              Add extra terms here if needed.
            </p>
          </div>

          <Button
            onClick={handleDiscover}
            loading={loading}
            disabled={!selectedClientId}
            className="w-full"
          >
            Start Discovery
          </Button>
        </div>
      )}

      {/* Step 2: Review Discovered Assets */}
      {step === 'discover' && discovery && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-navy dark:text-white font-heading">
                {discovery.client.name} - Discovery Results
              </h2>
              <p className="text-navy/60 dark:text-slate-400 text-sm font-body">
                Search terms used: {discovery.searchTerms.join(', ')}
              </p>
            </div>
            <button
              onClick={() => setStep('select')}
              className="text-sm text-brand hover:underline font-body"
            >
              Back
            </button>
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Cards Found', value: discovery.summary.totalCards, sub: `${discovery.summary.directCards} direct, ${discovery.summary.heuristicCards} heuristic` },
              { label: 'Design Links', value: discovery.summary.figmaLinks + discovery.summary.canvaLinks, sub: `${discovery.summary.figmaLinks} Figma, ${discovery.summary.canvaLinks} Canva` },
              { label: 'File Links', value: discovery.summary.dropboxLinks + discovery.summary.driveLinks, sub: `${discovery.summary.dropboxLinks} Dropbox, ${discovery.summary.driveLinks} Drive` },
              { label: 'Credentials', value: discovery.summary.credentialCount, sub: 'in vault' },
            ].map(({ label, value, sub }) => (
              <div key={label} className="p-4 bg-cream dark:bg-slate-800/50 rounded-xl border border-cream-dark dark:border-slate-700 text-center">
                <div className="text-2xl font-bold text-navy dark:text-white font-heading">{value}</div>
                <div className="text-xs font-semibold text-navy/60 dark:text-slate-400 font-heading">{label}</div>
                <div className="text-xs text-navy/40 dark:text-slate-500 font-body">{sub}</div>
              </div>
            ))}
          </div>

          {/* Asset sections */}
          {(['figma', 'canva', 'dropbox', 'drive'] as AssetCategory[]).map(category => {
            const items = discovery.assets[category];
            if (items.length === 0) return null;
            const labels: Record<string, string> = { figma: 'Figma', canva: 'Canva', dropbox: 'Dropbox', drive: 'Google Drive' };
            return (
              <div key={category} className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-cream-dark dark:border-slate-700">
                <h3 className="text-sm font-bold text-navy dark:text-white font-heading mb-3">
                  {labels[category]} Links ({items.length})
                </h3>
                <div className="space-y-2">
                  {items.map((item, i) => (
                    <div key={i} className="flex items-start gap-3 text-sm">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand hover:underline break-all font-body flex-1"
                      >
                        {item.url.length > 80 ? item.url.slice(0, 80) + '...' : item.url}
                      </a>
                      <span className="text-navy/40 dark:text-slate-500 whitespace-nowrap font-body text-xs">
                        {item.source}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Cards by board */}
          {discovery.cards.length > 0 && (
            <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-cream-dark dark:border-slate-700">
              <h3 className="text-sm font-bold text-navy dark:text-white font-heading mb-3">
                Cards by Board ({discovery.cards.length})
              </h3>
              <div className="space-y-3">
                {Object.entries(
                  discovery.cards.reduce<Record<string, DiscoveredCard[]>>((acc, card) => {
                    (acc[card.board_name] = acc[card.board_name] || []).push(card);
                    return acc;
                  }, {})
                ).map(([boardName, cards]) => (
                  <div key={boardName}>
                    <div className="text-xs font-semibold text-navy/60 dark:text-slate-400 uppercase tracking-wider mb-1 font-heading">
                      {boardName} ({cards.length})
                    </div>
                    <div className="space-y-1 pl-3">
                      {cards.slice(0, 10).map(card => (
                        <div key={card.id} className="flex items-center gap-2 text-sm">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${card.match_type === 'direct' ? 'bg-brand' : 'bg-amber-400'}`} />
                          <span className="text-navy dark:text-slate-300 font-body truncate">{card.title}</span>
                          <span className="text-navy/30 dark:text-slate-600 text-xs font-body">{card.list_name}</span>
                        </div>
                      ))}
                      {cards.length > 10 && (
                        <div className="text-xs text-navy/40 dark:text-slate-500 font-body">
                          ... and {cards.length - 10} more
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 mt-3 text-xs text-navy/40 dark:text-slate-500">
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-brand" /> Direct match</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Heuristic match</span>
              </div>
            </div>
          )}

          {/* Re-scan with extra terms */}
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-navy/60 dark:text-slate-400 mb-1 font-heading">
                Add more search terms and re-scan
              </label>
              <input
                type="text"
                value={extraTerms}
                onChange={(e) => setExtraTerms(e.target.value)}
                placeholder="extra terms, comma separated"
                className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-slate-900 text-navy dark:text-white text-sm font-body focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            <Button size="sm" variant="secondary" onClick={handleDiscover} loading={loading}>
              Re-scan
            </Button>
          </div>

          {/* Report options */}
          <div className="p-4 bg-cream dark:bg-slate-800/50 rounded-xl border border-cream-dark dark:border-slate-700 space-y-4">
            <h3 className="text-sm font-bold text-navy dark:text-white font-heading">Report Options</h3>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={includeCredentials}
                onChange={(e) => setIncludeCredentials(e.target.checked)}
                className="w-4 h-4 rounded border-cream-dark text-brand focus:ring-brand"
              />
              <span className="text-sm text-navy dark:text-slate-300 font-body">
                Include credentials (usernames & passwords)
              </span>
            </label>

            <div>
              <label className="block text-xs font-semibold text-navy/60 dark:text-slate-400 mb-2 font-heading">Format</label>
              <div className="flex gap-3">
                <label className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 cursor-pointer transition-all text-sm font-body ${
                  reportFormat === 'csv' ? 'border-brand bg-brand/5 text-brand' : 'border-cream-dark dark:border-slate-700 text-navy/60 dark:text-slate-400'
                }`}>
                  <input type="radio" name="format" value="csv" checked={reportFormat === 'csv'} onChange={() => setReportFormat('csv')} className="sr-only" />
                  CSV Download
                </label>
                <label className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 cursor-pointer transition-all text-sm font-body ${
                  reportFormat === 'google_sheet' ? 'border-brand bg-brand/5 text-brand' : 'border-cream-dark dark:border-slate-700 text-navy/60 dark:text-slate-400'
                }`}>
                  <input type="radio" name="format" value="google_sheet" checked={reportFormat === 'google_sheet'} onChange={() => setReportFormat('google_sheet')} className="sr-only" />
                  Google Sheet
                </label>
              </div>
            </div>
          </div>

          <Button onClick={handleGenerateReport} loading={generating} className="w-full">
            Generate Report
          </Button>
        </div>
      )}

      {/* Step 3: Report Ready */}
      {step === 'report' && (
        <div className="space-y-6 text-center">
          <div className="p-8 bg-white dark:bg-slate-900 rounded-2xl border border-cream-dark dark:border-slate-700">
            <div className="text-5xl mb-4">
              {reportFormat === 'csv' ? '📥' : '📊'}
            </div>
            <h2 className="text-xl font-bold text-navy dark:text-white font-heading mb-2">
              Report Generated!
            </h2>
            <p className="text-navy/60 dark:text-slate-400 font-body mb-6">
              {reportFormat === 'csv'
                ? 'Your CSV file has been downloaded.'
                : 'Your Google Sheet is ready.'}
            </p>

            {reportUrl && reportUrl !== 'downloaded' && (
              <div className="space-y-3">
                <a
                  href={reportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-brand text-white rounded-xl font-semibold hover:bg-brand/90 transition-all font-body"
                >
                  Open Google Sheet
                </a>
                <div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(reportUrl);
                    }}
                    className="text-sm text-brand hover:underline font-body"
                  >
                    Copy link
                  </button>
                </div>
              </div>
            )}

            <div className="mt-8 flex justify-center gap-3">
              <Button variant="secondary" onClick={() => { setStep('select'); setDiscovery(null); setReportUrl(null); }}>
                Start New Report
              </Button>
              <Button variant="secondary" onClick={() => setStep('discover')}>
                Back to Results
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
