'use client';

import { useState, useEffect, useRef } from 'react';

interface TeamMember {
  id: string;
  user_id: string;
  role: string;
  profile?: {
    id: string;
    display_name: string;
    avatar_url: string | null;
    agency_role: string | null;
  };
}

interface AgencyProfile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  agency_role: string | null;
}

export function ClientTeamSection({ clientId }: { clientId: string }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [allProfiles, setAllProfiles] = useState<AgencyProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Fetch team members
  useEffect(() => {
    const fetchTeam = async () => {
      setLoading(true);
      try {
        const [teamRes, profilesRes] = await Promise.all([
          fetch(`/api/clients/${clientId}/team`),
          fetch('/api/team'),
        ]);
        const teamJson = await teamRes.json();
        const profilesJson = await profilesRes.json();

        setMembers(teamJson.data ?? []);

        // Extract profiles from team workload data
        const profiles = (profilesJson.data ?? []).map((m: { userId: string; displayName: string; avatarUrl: string | null; role: string }) => ({
          id: m.userId,
          display_name: m.displayName,
          avatar_url: m.avatarUrl,
          agency_role: m.role,
        }));
        setAllProfiles(profiles);
      } finally {
        setLoading(false);
      }
    };
    fetchTeam();
  }, [clientId]);

  // Close picker on outside click
  useEffect(() => {
    if (!showPicker) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPicker]);

  const addMember = async (userId: string) => {
    const res = await fetch(`/api/clients/${clientId}/team`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    });
    const json = await res.json();
    if (json.data) {
      setMembers(prev => [...prev, json.data]);
    }
    setShowPicker(false);
  };

  const removeMember = async (userId: string) => {
    await fetch(`/api/clients/${clientId}/team`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    });
    setMembers(prev => prev.filter(m => m.user_id !== userId));
  };

  const assignedUserIds = new Set(members.map(m => m.user_id));
  const availableProfiles = allProfiles.filter(p => !assignedUserIds.has(p.id));

  return (
    <div className="mb-3 border border-cream-dark dark:border-slate-700 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-body flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-navy/50 dark:text-slate-400">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 00-3-3.87" />
            <path d="M16 3.13a4 4 0 010 7.75" />
          </svg>
          Assigned Team
        </h3>

        <div className="relative" ref={pickerRef}>
          <button
            type="button"
            onClick={() => setShowPicker(v => !v)}
            className="text-[11px] font-medium text-electric hover:text-electric/80 font-body flex items-center gap-1"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add
          </button>

          {showPicker && (
            <div className="absolute top-full right-0 mt-1 z-30 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-cream-dark dark:border-slate-700 py-1 min-w-[180px] max-h-[200px] overflow-y-auto">
              {availableProfiles.length === 0 ? (
                <p className="px-3 py-2 text-[10px] text-navy/30 dark:text-slate-600 font-body">
                  {loading ? 'Loading...' : 'No available team members'}
                </p>
              ) : (
                availableProfiles.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addMember(p.id)}
                    className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-cream dark:hover:bg-slate-700 font-body flex items-center gap-2 text-navy dark:text-slate-200"
                  >
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                    ) : (
                      <span className="w-5 h-5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 text-[8px] font-bold flex items-center justify-center shrink-0">
                        {p.display_name.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <span className="truncate">{p.display_name}</span>
                    {p.agency_role && (
                      <span className="text-[9px] text-navy/30 dark:text-slate-600 shrink-0">{p.agency_role}</span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-[11px] text-navy/30 dark:text-slate-600 font-body py-2">Loading team...</div>
      ) : members.length === 0 ? (
        <div className="text-[11px] text-navy/30 dark:text-slate-600 font-body py-2">
          No team members assigned yet.
        </div>
      ) : (
        <div className="space-y-1">
          {members.map(m => {
            const name = m.profile?.display_name || 'Unknown';
            return (
              <div key={m.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-cream/50 dark:hover:bg-slate-800/40 group">
                <div className="flex items-center gap-2 min-w-0">
                  {m.profile?.avatar_url ? (
                    <img src={m.profile.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                  ) : (
                    <span className="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 text-[9px] font-bold flex items-center justify-center shrink-0">
                      {name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0">
                    <span className="text-xs font-medium text-navy dark:text-slate-100 font-body truncate block">{name}</span>
                    {m.profile?.agency_role && (
                      <span className="text-[9px] text-navy/40 dark:text-slate-500 font-body">{m.profile.agency_role}</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeMember(m.user_id)}
                  className="p-1 rounded text-navy/10 hover:text-red-500 dark:text-slate-700 dark:hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                  title="Remove from team"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
