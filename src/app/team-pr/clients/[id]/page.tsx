'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import type {
  PRClient,
  PRTerritory,
  PRRun,
  PRRunStatus,
  PRFeedback,
  PRFeedbackType,
} from '@/lib/types';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function StatusBadge({ status }: { status: PRRunStatus }) {
  const styles: Record<string, string> = {
    PENDING: 'bg-gray-500/20 text-gray-400',
    RESEARCH: 'bg-blue-500/20 text-blue-400',
    VERIFICATION: 'bg-blue-500/20 text-blue-400',
    QA_LOOP: 'bg-blue-500/20 text-blue-400',
    EMAIL_GEN: 'bg-blue-500/20 text-blue-400',
    GATE_A: 'bg-amber-500/20 text-amber-400',
    GATE_B: 'bg-amber-500/20 text-amber-400',
    GATE_C: 'bg-amber-500/20 text-amber-400',
    COMPLETED: 'bg-green-500/20 text-green-400',
    FAILED: 'bg-red-500/20 text-red-400',
    CANCELLED: 'bg-gray-500/20 text-gray-500',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] || 'bg-gray-500/20 text-gray-400'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function TagInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState('');
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const tag = input.trim();
      if (tag && !value.includes(tag)) onChange([...value, tag]);
      setInput('');
    }
    if (e.key === 'Backspace' && !input && value.length > 0) onChange(value.slice(0, -1));
  }
  return (
    <div className="flex flex-wrap gap-1.5 p-2 rounded-lg bg-gray-500/10 border border-gray-500/20 min-h-[38px]">
      {value.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 text-xs">
          {tag}
          <button onClick={() => onChange(value.filter((t) => t !== tag))} className="hover:text-white">x</button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={value.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[100px] bg-transparent text-sm text-white outline-none placeholder:text-gray-500"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Profile Tab                                                        */
/* ------------------------------------------------------------------ */

function ProfileTab({ client }: { client: PRClient }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(client.name);
  const [company, setCompany] = useState(client.company || '');
  const [industry, setIndustry] = useState(client.industry || '');
  const [website, setWebsite] = useState(client.website || '');
  const [bio, setBio] = useState(client.bio || '');
  const [brandVoice, setBrandVoice] = useState(JSON.stringify(client.brand_voice || {}, null, 2));
  const [toneRules, setToneRules] = useState(JSON.stringify(client.tone_rules || {}, null, 2));
  const [targetMarkets, setTargetMarkets] = useState<string[]>(client.target_markets || []);
  const [exclusionList, setExclusionList] = useState<string[]>(client.exclusion_list || []);

  const updateMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/team-pr/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to update client');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pr-client', client.id] });
    },
  });

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    let parsedBV = {};
    let parsedTR = {};
    try { parsedBV = JSON.parse(brandVoice); } catch { /* keep */ }
    try { parsedTR = JSON.parse(toneRules); } catch { /* keep */ }
    updateMutation.mutate({
      name,
      company: company || null,
      industry: industry || null,
      website: website || null,
      bio: bio || null,
      brand_voice: parsedBV,
      tone_rules: parsedTR,
      target_markets: targetMarkets,
      exclusion_list: exclusionList,
    });
  }

  return (
    <form onSubmit={handleSave} className="space-y-4 max-w-2xl">
      <div>
        <label className="block text-sm text-gray-400 mb-1">Name *</label>
        <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-gray-500/10 border border-gray-500/20 text-white text-sm outline-none focus:border-purple-500/50" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Company</label>
          <input value={company} onChange={(e) => setCompany(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-gray-500/10 border border-gray-500/20 text-white text-sm outline-none focus:border-purple-500/50" />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Industry</label>
          <input value={industry} onChange={(e) => setIndustry(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-gray-500/10 border border-gray-500/20 text-white text-sm outline-none focus:border-purple-500/50" />
        </div>
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-1">Website</label>
        <input value={website} onChange={(e) => setWebsite(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-gray-500/10 border border-gray-500/20 text-white text-sm outline-none focus:border-purple-500/50" />
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-1">Bio</label>
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-lg bg-gray-500/10 border border-gray-500/20 text-white text-sm outline-none focus:border-purple-500/50 resize-none" />
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-1">Brand Voice (JSON)</label>
        <textarea value={brandVoice} onChange={(e) => setBrandVoice(e.target.value)} rows={4} className="w-full px-3 py-2 rounded-lg bg-gray-500/10 border border-gray-500/20 text-white text-sm font-mono outline-none focus:border-purple-500/50 resize-none" />
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-1">Tone Rules (JSON)</label>
        <textarea value={toneRules} onChange={(e) => setToneRules(e.target.value)} rows={4} className="w-full px-3 py-2 rounded-lg bg-gray-500/10 border border-gray-500/20 text-white text-sm font-mono outline-none focus:border-purple-500/50 resize-none" />
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-1">Target Markets</label>
        <TagInput value={targetMarkets} onChange={setTargetMarkets} placeholder="Type and press Enter..." />
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-1">Exclusion List</label>
        <TagInput value={exclusionList} onChange={setExclusionList} placeholder="Outlets to exclude..." />
      </div>
      <div className="pt-2">
        <button
          type="submit"
          disabled={updateMutation.isPending}
          className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
        >
          {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
        </button>
        {updateMutation.isSuccess && <span className="ml-3 text-sm text-green-400">Saved!</span>}
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/*  Territories Tab                                                    */
/* ------------------------------------------------------------------ */

interface SeedOutlet {
  name: string;
  url: string;
  type: string;
}

function TerritoryForm({
  initial,
  clientId,
  onDone,
}: {
  initial?: PRTerritory;
  clientId: string;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(initial?.name || '');
  const [countryCode, setCountryCode] = useState(initial?.country_code || '');
  const [language, setLanguage] = useState(initial?.language || 'en');
  const [signalKeywords, setSignalKeywords] = useState<string[]>(initial?.signal_keywords || []);
  const [pitchNorms, setPitchNorms] = useState(initial?.pitch_norms || '');
  const [seasonalCalendar, setSeasonalCalendar] = useState(JSON.stringify(initial?.seasonal_calendar || {}, null, 2));
  const [seedOutlets, setSeedOutlets] = useState<SeedOutlet[]>(initial?.seed_outlets || []);

  const mutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const url = initial
        ? `/api/team-pr/territories/${initial.id}`
        : `/api/team-pr/territories`;
      const res = await fetch(url, {
        method: initial ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to save territory');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pr-territories', clientId] });
      onDone();
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    let parsedCal = {};
    try { parsedCal = JSON.parse(seasonalCalendar); } catch { /* keep */ }
    mutation.mutate({
      client_id: clientId,
      name,
      country_code: countryCode || null,
      language,
      signal_keywords: signalKeywords,
      pitch_norms: pitchNorms || null,
      seasonal_calendar: parsedCal,
      seed_outlets: seedOutlets.filter((s) => s.name.trim()),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-4 rounded-lg border border-gray-500/20 bg-[#141420]/50">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Name *</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full px-2 py-1.5 rounded bg-gray-500/10 border border-gray-500/20 text-white text-sm outline-none focus:border-purple-500/50" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Country Code</label>
          <input value={countryCode} onChange={(e) => setCountryCode(e.target.value)} placeholder="US" className="w-full px-2 py-1.5 rounded bg-gray-500/10 border border-gray-500/20 text-white text-sm outline-none focus:border-purple-500/50" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Language</label>
          <input value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full px-2 py-1.5 rounded bg-gray-500/10 border border-gray-500/20 text-white text-sm outline-none focus:border-purple-500/50" />
        </div>
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Signal Keywords</label>
        <TagInput value={signalKeywords} onChange={setSignalKeywords} placeholder="Keywords..." />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Pitch Norms</label>
        <textarea value={pitchNorms} onChange={(e) => setPitchNorms(e.target.value)} rows={2} className="w-full px-2 py-1.5 rounded bg-gray-500/10 border border-gray-500/20 text-white text-sm outline-none focus:border-purple-500/50 resize-none" />
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Seasonal Calendar (JSON)</label>
        <textarea value={seasonalCalendar} onChange={(e) => setSeasonalCalendar(e.target.value)} rows={3} className="w-full px-2 py-1.5 rounded bg-gray-500/10 border border-gray-500/20 text-white text-sm font-mono outline-none focus:border-purple-500/50 resize-none" />
      </div>
      {/* Seed Outlets */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs text-gray-400">Seed Outlets</label>
          <button type="button" onClick={() => setSeedOutlets([...seedOutlets, { name: '', url: '', type: 'blog' }])} className="text-xs text-purple-400 hover:text-purple-300">+ Add</button>
        </div>
        {seedOutlets.map((s, i) => (
          <div key={i} className="flex flex-col sm:flex-row gap-2 mb-1">
            <input value={s.name} onChange={(e) => { const u = [...seedOutlets]; u[i] = { ...u[i], name: e.target.value }; setSeedOutlets(u); }} placeholder="Name" className="flex-1 px-2 py-1 rounded bg-gray-500/10 border border-gray-500/20 text-white text-xs outline-none" />
            <input value={s.url} onChange={(e) => { const u = [...seedOutlets]; u[i] = { ...u[i], url: e.target.value }; setSeedOutlets(u); }} placeholder="URL" className="flex-[2] px-2 py-1 rounded bg-gray-500/10 border border-gray-500/20 text-white text-xs outline-none" />
            <select value={s.type} onChange={(e) => { const u = [...seedOutlets]; u[i] = { ...u[i], type: e.target.value }; setSeedOutlets(u); }} className="px-2 py-1 rounded bg-gray-500/10 border border-gray-500/20 text-white text-xs outline-none">
              <option value="blog">Blog</option>
              <option value="podcast">Podcast</option>
              <option value="newspaper">Newspaper</option>
              <option value="magazine">Magazine</option>
              <option value="tv">TV</option>
              <option value="radio">Radio</option>
              <option value="online_media">Online</option>
            </select>
            <button type="button" onClick={() => setSeedOutlets(seedOutlets.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300 text-xs px-1">x</button>
          </div>
        ))}
      </div>
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={mutation.isPending} className="px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-medium transition-colors">
          {mutation.isPending ? 'Saving...' : initial ? 'Update' : 'Add Territory'}
        </button>
        <button type="button" onClick={onDone} className="px-3 py-1.5 rounded text-gray-400 hover:text-white text-xs transition-colors">Cancel</button>
      </div>
    </form>
  );
}

function TerritoriesTab({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['pr-territories', clientId],
    queryFn: async () => {
      const res = await fetch(`/api/team-pr/territories?client_id=${clientId}`, { credentials: 'include' });
      const json = await res.json();
      return json.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/team-pr/territories/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to delete');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pr-territories', clientId] }),
  });

  const territories: PRTerritory[] = data?.items || [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => { setShowForm(true); setEditingId(null); }}
          className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium transition-colors"
        >
          + Add Territory
        </button>
      </div>

      {showForm && !editingId && (
        <TerritoryForm clientId={clientId} onDone={() => setShowForm(false)} />
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-24 rounded-lg bg-gray-500/10 animate-pulse" />)}
        </div>
      ) : territories.length === 0 && !showForm ? (
        <p className="text-gray-400 text-sm text-center py-8">No territories. Add one to define a PR market.</p>
      ) : (
        territories.map((t) =>
          editingId === t.id ? (
            <TerritoryForm key={t.id} initial={t} clientId={clientId} onDone={() => setEditingId(null)} />
          ) : (
            <div key={t.id} className="p-4 rounded-lg border border-gray-500/20 bg-[#141420]/50">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-white font-medium">{t.name}</h4>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {t.country_code || 'Global'} - {t.language}
                    {t.signal_keywords.length > 0 && ` - ${t.signal_keywords.length} keywords`}
                    {t.seed_outlets.length > 0 && ` - ${t.seed_outlets.length} seed outlets`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditingId(t.id)} className="text-xs text-gray-400 hover:text-white transition-colors">Edit</button>
                  <button
                    onClick={() => { if (confirm('Delete this territory?')) deleteMutation.mutate(t.id); }}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
              {t.signal_keywords.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {t.signal_keywords.map((kw) => (
                    <span key={kw} className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[10px]">{kw}</span>
                  ))}
                </div>
              )}
            </div>
          )
        )
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Seasonal Calendar Warning helpers                                  */
/* ------------------------------------------------------------------ */

type SeasonalPeriodKey = 'jan_feb' | 'mar_apr' | 'may' | 'jun_jul' | 'aug' | 'sep_oct' | 'nov_dec';

function getCurrentPeriodKey(): SeasonalPeriodKey {
  const month = new Date().getMonth(); // 0-indexed
  if (month <= 1) return 'jan_feb';
  if (month <= 3) return 'mar_apr';
  if (month === 4) return 'may';
  if (month <= 6) return 'jun_jul';
  if (month === 7) return 'aug';
  if (month <= 9) return 'sep_oct';
  return 'nov_dec';
}

const PERIOD_LABELS: Record<SeasonalPeriodKey, string> = {
  jan_feb: 'Jan-Feb',
  mar_apr: 'Mar-Apr',
  may: 'May',
  jun_jul: 'Jun-Jul',
  aug: 'August',
  sep_oct: 'Sep-Oct',
  nov_dec: 'Nov-Dec',
};

function isDeadZone(strategyText: string): boolean {
  const lower = strategyText.toLowerCase();
  return lower.includes('do not pitch') || lower.includes('dead zone');
}

/* ------------------------------------------------------------------ */
/*  Runs Tab                                                           */
/* ------------------------------------------------------------------ */

interface CostEstimate {
  research: { subtotal: number };
  verification: { subtotal: number };
  qa: { subtotal: number };
  email_gen: { subtotal: number };
  total: number;
}

function RunsTab({ clientId }: { clientId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showStartModal, setShowStartModal] = useState(false);
  const [selectedTerritoryId, setSelectedTerritoryId] = useState('');
  const [costEstimate, setCostEstimate] = useState<CostEstimate | null>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [deadZoneWarning, setDeadZoneWarning] = useState<{
    periodLabel: string;
    territoryName: string;
    strategyText: string;
  } | null>(null);

  // Fetch cost estimate when modal opens
  useEffect(() => {
    if (!showStartModal) {
      setCostEstimate(null);
      return;
    }
    setEstimateLoading(true);
    fetch('/api/team-pr/runs/estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ max_outlets: 50 }),
    })
      .then((res) => res.json())
      .then((json) => setCostEstimate(json.data))
      .catch(() => setCostEstimate(null))
      .finally(() => setEstimateLoading(false));
  }, [showStartModal]);

  const { data, isLoading } = useQuery({
    queryKey: ['pr-runs', 'client', clientId],
    queryFn: async () => {
      const res = await fetch(`/api/team-pr/runs?client_id=${clientId}`, { credentials: 'include' });
      const json = await res.json();
      return json.data;
    },
  });

  const { data: territoriesData } = useQuery({
    queryKey: ['pr-territories', clientId],
    queryFn: async () => {
      const res = await fetch(`/api/team-pr/territories?client_id=${clientId}`, { credentials: 'include' });
      const json = await res.json();
      return json.data;
    },
  });

  const startRunMutation = useMutation({
    mutationFn: async (territoryId: string) => {
      const res = await fetch('/api/team-pr/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ client_id: clientId, territory_id: territoryId || null }),
      });
      if (!res.ok) throw new Error('Failed to start run');
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['pr-runs', 'client', clientId] });
      setShowStartModal(false);
      setDeadZoneWarning(null);
      if (result.data?.id) router.push(`/team-pr/runs/${result.data.id}`);
    },
  });

  const territories: PRTerritory[] = territoriesData?.items || [];
  const runs: PRRun[] = data?.items || [];

  function handleStartRunClick(territoryId: string) {
    if (!territoryId) {
      startRunMutation.mutate('');
      return;
    }
    const territory = territories.find((t) => t.id === territoryId);
    if (!territory) {
      startRunMutation.mutate(territoryId);
      return;
    }
    const periodKey = getCurrentPeriodKey();
    const cal = territory.seasonal_calendar as Record<string, string> | undefined;
    const strategyText = cal?.[periodKey] || '';
    if (strategyText && isDeadZone(strategyText)) {
      setDeadZoneWarning({
        periodLabel: PERIOD_LABELS[periodKey],
        territoryName: territory.name,
        strategyText,
      });
    } else {
      startRunMutation.mutate(territoryId);
      setShowStartModal(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Start Run button */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowStartModal(true)}
          className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium transition-colors"
        >
          + Start New Run
        </button>
      </div>

      {/* Dead zone warning banner */}
      {deadZoneWarning && (
        <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 space-y-3">
          <div className="flex gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400 mt-0.5 shrink-0"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <div>
              <p className="text-sm font-medium text-amber-300">
                Warning: {deadZoneWarning.periodLabel} is typically a dead zone for {deadZoneWarning.territoryName}.
              </p>
              <p className="text-xs text-amber-400/80 mt-1">
                Strategy note: {deadZoneWarning.strategyText}
              </p>
              <p className="text-xs text-amber-400/60 mt-1">Are you sure you want to proceed?</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { startRunMutation.mutate(selectedTerritoryId); }}
              disabled={startRunMutation.isPending}
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-medium transition-colors"
            >
              {startRunMutation.isPending ? 'Starting...' : 'Proceed Anyway'}
            </button>
            <button
              onClick={() => setDeadZoneWarning(null)}
              className="px-3 py-1.5 text-gray-400 hover:text-white text-xs transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Start Run modal */}
      {showStartModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#141420] border border-gray-500/20 rounded-2xl w-full max-w-sm sm:max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Start New Run</h3>
              <button onClick={() => setShowStartModal(false)} className="text-gray-400 hover:text-white">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Territory (optional)</label>
                <select
                  value={selectedTerritoryId}
                  onChange={(e) => setSelectedTerritoryId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-gray-500/10 border border-gray-500/20 text-white text-sm outline-none focus:border-purple-500/50"
                >
                  <option value="">No specific territory</option>
                  {territories.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              {/* Cost Estimate */}
              <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                <p className="text-xs font-medium text-blue-400 mb-2">Estimated Cost Breakdown</p>
                {estimateLoading ? (
                  <div className="h-12 rounded bg-gray-500/10 animate-pulse" />
                ) : costEstimate ? (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">Research</span>
                      <span className="text-gray-300">~${costEstimate.research.subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">Verification</span>
                      <span className="text-gray-300">~${costEstimate.verification.subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">QA</span>
                      <span className="text-gray-300">~${costEstimate.qa.subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">Email Gen</span>
                      <span className="text-gray-300">~${costEstimate.email_gen.subtotal.toFixed(2)}</span>
                    </div>
                    <hr className="border-blue-500/20 my-1" />
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-blue-400">Total</span>
                      <span className="text-blue-300">~${costEstimate.total.toFixed(2)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">Could not load estimate</p>
                )}
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { setShowStartModal(false); handleStartRunClick(selectedTerritoryId); }}
                  disabled={startRunMutation.isPending}
                  className="flex-1 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                >
                  {startRunMutation.isPending ? 'Starting...' : 'Start Run'}
                </button>
                <button
                  onClick={() => setShowStartModal(false)}
                  className="px-4 py-2 rounded-lg text-gray-400 hover:text-white text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="h-32 rounded-lg bg-gray-500/10 animate-pulse" />
      ) : runs.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-8">No runs for this client yet.</p>
      ) : (
        <div className="rounded-xl border border-gray-500/20 overflow-x-auto overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-500/5 border-b border-gray-500/20">
                <th className="text-left px-4 py-3 font-medium text-gray-400">Territory</th>
                <th className="text-left px-4 py-3 font-medium text-gray-400">Status</th>
                <th className="text-right px-4 py-3 font-medium text-gray-400">Outlets</th>
                <th className="text-right px-4 py-3 font-medium text-gray-400">Emails</th>
                <th className="text-right px-4 py-3 font-medium text-gray-400">Cost</th>
                <th className="text-left px-4 py-3 font-medium text-gray-400">Created</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr
                  key={run.id}
                  onClick={() => router.push(`/team-pr/runs/${run.id}`)}
                  className="border-b border-gray-500/10 hover:bg-gray-500/5 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 text-gray-300">{run.territory?.name || '-'}</td>
                  <td className="px-4 py-3"><StatusBadge status={run.status} /></td>
                  <td className="px-4 py-3 text-right text-gray-300">{run.outlets_discovered}</td>
                  <td className="px-4 py-3 text-right text-gray-300">{run.emails_generated}</td>
                  <td className="px-4 py-3 text-right text-gray-300">${run.total_cost_usd.toFixed(2)}</td>
                  <td className="px-4 py-3 text-gray-400">{new Date(run.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Feedback Tab                                                       */
/* ------------------------------------------------------------------ */

function FeedbackTab({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [feedbackType, setFeedbackType] = useState<PRFeedbackType>('general');
  const [feedbackText, setFeedbackText] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['pr-feedback', clientId],
    queryFn: async () => {
      const res = await fetch(`/api/team-pr/feedback?client_id=${clientId}`, { credentials: 'include' });
      const json = await res.json();
      return json.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch('/api/team-pr/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to add feedback');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pr-feedback', clientId] });
      setShowForm(false);
      setFeedbackText('');
    },
  });

  const feedbackItems: PRFeedback[] = data?.items || [];
  const feedbackTypes: PRFeedbackType[] = ['outlet_quality', 'email_tone', 'angle_effectiveness', 'contact_accuracy', 'market_insight', 'general'];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowForm(!showForm)} className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium transition-colors">
          + Add Feedback
        </button>
      </div>

      {showForm && (
        <div className="p-4 rounded-lg border border-gray-500/20 bg-[#141420]/50 space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Type</label>
            <select value={feedbackType} onChange={(e) => setFeedbackType(e.target.value as PRFeedbackType)} className="w-full px-2 py-1.5 rounded bg-gray-500/10 border border-gray-500/20 text-white text-sm outline-none">
              {feedbackTypes.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Feedback</label>
            <textarea value={feedbackText} onChange={(e) => setFeedbackText(e.target.value)} rows={3} className="w-full px-2 py-1.5 rounded bg-gray-500/10 border border-gray-500/20 text-white text-sm outline-none resize-none" placeholder="Your feedback..." />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => createMutation.mutate({ client_id: clientId, feedback_type: feedbackType, feedback_text: feedbackText })}
              disabled={createMutation.isPending || !feedbackText.trim()}
              className="px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-medium transition-colors"
            >
              {createMutation.isPending ? 'Saving...' : 'Submit'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-gray-400 hover:text-white text-xs transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-16 rounded-lg bg-gray-500/10 animate-pulse" />)}</div>
      ) : feedbackItems.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-8">No feedback yet.</p>
      ) : (
        feedbackItems.map((fb) => (
          <div key={fb.id} className="p-3 rounded-lg border border-gray-500/20 bg-[#141420]/50">
            <div className="flex items-center gap-2 mb-1">
              <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-blue-500/20 text-blue-400">{fb.feedback_type.replace(/_/g, ' ')}</span>
              {fb.sentiment && (
                <span className={`text-[10px] ${fb.sentiment === 'positive' ? 'text-green-400' : fb.sentiment === 'negative' ? 'text-red-400' : 'text-gray-400'}`}>
                  {fb.sentiment}
                </span>
              )}
              <span className="text-[10px] text-gray-500 ml-auto">{new Date(fb.created_at).toLocaleDateString()}</span>
            </div>
            <p className="text-sm text-gray-300">{fb.feedback_text}</p>
          </div>
        ))
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const clientId = params.id as string;
  const [activeTab, setActiveTab] = useState<'profile' | 'territories' | 'runs' | 'feedback'>('profile');

  const { data, isLoading } = useQuery({
    queryKey: ['pr-client', clientId],
    queryFn: async () => {
      const res = await fetch(`/api/team-pr/clients/${clientId}`, { credentials: 'include' });
      const json = await res.json();
      return json.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/team-pr/clients/${clientId}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to delete');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pr-clients'] });
      router.push('/team-pr/clients');
    },
  });

  const client: PRClient | null = data || null;

  if (isLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="h-8 w-48 rounded bg-gray-500/10 animate-pulse mb-6" />
        <div className="h-64 rounded-xl bg-gray-500/10 animate-pulse" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="p-6 max-w-5xl mx-auto text-center py-20">
        <p className="text-gray-400 mb-4">Client not found.</p>
        <Link href="/team-pr/clients" className="text-purple-400 hover:text-purple-300 text-sm">Back to clients</Link>
      </div>
    );
  }

  const tabs = [
    { key: 'profile' as const, label: 'Profile' },
    { key: 'territories' as const, label: 'Territories' },
    { key: 'runs' as const, label: 'Runs' },
    { key: 'feedback' as const, label: 'Feedback' },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Back link */}
      <Link href="/team-pr/clients" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Back to Clients
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy dark:text-white">{client.name}</h1>
          {client.company && <p className="text-sm text-gray-400 mt-0.5">{client.company}</p>}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { if (confirm('Delete this client? This cannot be undone.')) deleteMutation.mutate(); }}
            className="px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 text-sm transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-500/20">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.key
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'profile' && <ProfileTab client={client} />}
      {activeTab === 'territories' && <TerritoriesTab clientId={clientId} />}
      {activeTab === 'runs' && <RunsTab clientId={clientId} />}
      {activeTab === 'feedback' && <FeedbackTab clientId={clientId} />}
    </div>
  );
}
