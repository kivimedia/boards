'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import type { PRClient } from '@/lib/types';

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}

function TagInput({ value, onChange, placeholder }: TagInputProps) {
  const [input, setInput] = useState('');

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const tag = input.trim();
      if (tag && !value.includes(tag)) {
        onChange([...value, tag]);
      }
      setInput('');
    }
    if (e.key === 'Backspace' && !input && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5 p-2 rounded-lg bg-gray-500/10 border border-gray-500/20 min-h-[38px]">
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 text-xs"
        >
          {tag}
          <button onClick={() => onChange(value.filter((t) => t !== tag))} className="hover:text-white">
            x
          </button>
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

interface PitchAngle {
  angle_name: string;
  description: string;
}

function AddClientModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [industry, setIndustry] = useState('');
  const [website, setWebsite] = useState('');
  const [bio, setBio] = useState('');
  const [brandVoice, setBrandVoice] = useState('{}');
  const [toneRules, setToneRules] = useState('{}');
  const [pitchAngles, setPitchAngles] = useState<PitchAngle[]>([]);
  const [targetMarkets, setTargetMarkets] = useState<string[]>([]);
  const [exclusionList, setExclusionList] = useState<string[]>([]);

  const createMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch('/api/team-pr/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to create client');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pr-clients'] });
      onClose();
      resetForm();
    },
  });

  function resetForm() {
    setName('');
    setCompany('');
    setIndustry('');
    setWebsite('');
    setBio('');
    setBrandVoice('{}');
    setToneRules('{}');
    setPitchAngles([]);
    setTargetMarkets([]);
    setExclusionList([]);
  }

  function addPitchAngle() {
    setPitchAngles([...pitchAngles, { angle_name: '', description: '' }]);
  }

  function updatePitchAngle(index: number, field: keyof PitchAngle, value: string) {
    const updated = [...pitchAngles];
    updated[index] = { ...updated[index], [field]: value };
    setPitchAngles(updated);
  }

  function removePitchAngle(index: number) {
    setPitchAngles(pitchAngles.filter((_, i) => i !== index));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    let parsedBrandVoice = {};
    let parsedToneRules = {};
    try { parsedBrandVoice = JSON.parse(brandVoice); } catch { /* keep default */ }
    try { parsedToneRules = JSON.parse(toneRules); } catch { /* keep default */ }

    createMutation.mutate({
      name,
      company: company || null,
      industry: industry || null,
      website: website || null,
      bio: bio || null,
      brand_voice: parsedBrandVoice,
      tone_rules: parsedToneRules,
      pitch_angles: pitchAngles.filter((a) => a.angle_name.trim()),
      target_markets: targetMarkets,
      exclusion_list: exclusionList,
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#141420] border border-gray-500/20 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-white">Add Client</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Name *</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-gray-500/10 border border-gray-500/20 text-white text-sm outline-none focus:border-purple-500/50"
              placeholder="Client name"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Company</label>
              <input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-gray-500/10 border border-gray-500/20 text-white text-sm outline-none focus:border-purple-500/50"
                placeholder="Company name"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Industry</label>
              <input
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-gray-500/10 border border-gray-500/20 text-white text-sm outline-none focus:border-purple-500/50"
                placeholder="e.g. Technology"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Website</label>
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-gray-500/10 border border-gray-500/20 text-white text-sm outline-none focus:border-purple-500/50"
              placeholder="https://example.com"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg bg-gray-500/10 border border-gray-500/20 text-white text-sm outline-none focus:border-purple-500/50 resize-none"
              placeholder="Brief client bio..."
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Brand Voice (JSON)</label>
            <textarea
              value={brandVoice}
              onChange={(e) => setBrandVoice(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg bg-gray-500/10 border border-gray-500/20 text-white text-sm font-mono outline-none focus:border-purple-500/50 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Tone Rules (JSON)</label>
            <textarea
              value={toneRules}
              onChange={(e) => setToneRules(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg bg-gray-500/10 border border-gray-500/20 text-white text-sm font-mono outline-none focus:border-purple-500/50 resize-none"
            />
          </div>

          {/* Pitch Angles */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-gray-400">Pitch Angles</label>
              <button
                type="button"
                onClick={addPitchAngle}
                className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
              >
                + Add Angle
              </button>
            </div>
            {pitchAngles.map((angle, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input
                  value={angle.angle_name}
                  onChange={(e) => updatePitchAngle(i, 'angle_name', e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg bg-gray-500/10 border border-gray-500/20 text-white text-sm outline-none focus:border-purple-500/50"
                  placeholder="Angle name"
                />
                <input
                  value={angle.description}
                  onChange={(e) => updatePitchAngle(i, 'description', e.target.value)}
                  className="flex-[2] px-3 py-2 rounded-lg bg-gray-500/10 border border-gray-500/20 text-white text-sm outline-none focus:border-purple-500/50"
                  placeholder="Description"
                />
                <button
                  type="button"
                  onClick={() => removePitchAngle(i)}
                  className="px-2 text-red-400 hover:text-red-300"
                >
                  x
                </button>
              </div>
            ))}
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Target Markets</label>
            <TagInput value={targetMarkets} onChange={setTargetMarkets} placeholder="Type and press Enter..." />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Exclusion List</label>
            <TagInput value={exclusionList} onChange={setExclusionList} placeholder="Outlets to exclude..." />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || !name.trim()}
              className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PRClientsPage() {
  const router = useRouter();
  const [showAddModal, setShowAddModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['pr-clients'],
    queryFn: async () => {
      const res = await fetch('/api/team-pr/clients', { credentials: 'include' });
      const json = await res.json();
      return json.data;
    },
  });

  const clients: PRClient[] = data?.items || [];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-navy dark:text-white">PR Clients</h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Client
        </button>
      </div>

      {/* Client Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 rounded-xl bg-gray-500/10 animate-pulse" />
          ))}
        </div>
      ) : clients.length === 0 ? (
        <div className="rounded-xl border border-gray-500/20 p-12 text-center">
          <p className="text-gray-400 mb-4">No PR clients yet. Add your first client to get started.</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium transition-colors"
          >
            Add Client
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map((client) => (
            <div
              key={client.id}
              onClick={() => router.push(`/team-pr/clients/${client.id}`)}
              className="rounded-xl border border-gray-500/20 p-5 hover:border-purple-500/40 cursor-pointer transition-all bg-[#141420]/50 hover:bg-[#141420]"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-white font-semibold">{client.name}</h3>
                  {client.company && (
                    <p className="text-sm text-gray-400">{client.company}</p>
                  )}
                </div>
                {client.is_active ? (
                  <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-green-500/20 text-green-400">Active</span>
                ) : (
                  <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-gray-500/20 text-gray-500">Inactive</span>
                )}
              </div>

              {client.industry && (
                <p className="text-xs text-gray-500 mb-3">{client.industry}</p>
              )}

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-1.5 text-gray-400">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                  {client.target_markets?.length || 0} markets
                </div>
                <div className="flex items-center gap-1.5 text-gray-400">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  {client.pitch_angles?.length || 0} angles
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddClientModal open={showAddModal} onClose={() => setShowAddModal(false)} />
    </div>
  );
}
