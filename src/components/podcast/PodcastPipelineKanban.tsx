'use client';

import { useState, useEffect, useCallback } from 'react';
import type { PGACandidate, PGACandidateStatus } from '@/lib/types';
import TierBadge from './TierBadge';

const STAGES: { id: PGACandidateStatus; name: string }[] = [
    { id: 'scouted', name: 'Scouted (Discovery)' },
    { id: 'approved', name: 'Approved (Pending Research)' },
    { id: 'researched', name: 'Researched (Pending Scoring)' },
    { id: 'qualified', name: 'Qualified (Pending Outreach)' },
    { id: 'outreach_draft', name: 'Outreach Draft' },
    { id: 'outreach_active', name: 'Outreach Active' },
    { id: 'replied', name: 'Replied' },
    { id: 'scheduled', name: 'Scheduled' },
    { id: 'interviewed', name: 'Interviewed' },
    { id: 'rejected', name: 'Rejected' },
];

export default function PodcastPipelineKanban() {
    const [candidates, setCandidates] = useState<PGACandidate[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchCandidates = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            params.set('limit', '500'); // Load everything for kanban
            const res = await fetch(`/api/podcast/candidates?${params}`);
            const json = await res.json();
            if (json.data) {
                setCandidates(json.data.candidates || []);
            }
        } catch (err) {
            console.error('Failed to fetch candidates:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCandidates();
    }, [fetchCandidates]);

    const setStatus = async (id: string, status: PGACandidateStatus) => {
        try {
            await fetch(`/api/podcast/candidates/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status })
            });
            fetchCandidates();
        } catch (e) { }
    };

    const getCandidatesByStatus = (status: PGACandidateStatus) => {
        return candidates.filter((c) => c.status === status);
    };

    return (
        <div className="flex-1 overflow-x-auto p-6 bg-cream dark:bg-slate-900 flex flex-col h-full font-body">
            <div className="flex items-center justify-between gap-3 mb-6 shrink-0">
                <h2 className="text-xl font-bold font-heading text-navy dark:text-slate-100">
                    Podcast Outreach Pipeline
                </h2>
                {loading && (
                    <div className="w-5 h-5 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
                )}
            </div>

            <div className="flex gap-4 min-w-max pb-4 flex-1 items-stretch">
                {STAGES.map((stage) => {
                    const colCandidates = getCandidatesByStatus(stage.id);

                    return (
                        <div key={stage.id} className="w-72 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-navy/5 dark:border-slate-700 flex flex-col hide-scrollbar">
                            <div className="p-3 border-b border-navy/5 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-t-xl shrink-0 flex justify-between items-center">
                                <h3 className="font-bold text-sm text-navy dark:text-slate-200 truncate pr-2" title={stage.name}>
                                    {stage.name}
                                </h3>
                                <span className="bg-slate-100 dark:bg-slate-700 text-[10px] font-semibold text-navy/60 dark:text-slate-400 px-2 py-0.5 rounded-full shrink-0">
                                    {colCandidates.length}
                                </span>
                            </div>

                            <div className="p-3 flex-1 overflow-y-auto space-y-3">
                                {colCandidates.map(c => (
                                    <div key={c.id} className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-navy/5 dark:border-slate-700 shadow-sm hover:shadow transition-shadow group cursor-grab active:cursor-grabbing pb-4 relative">
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="font-semibold text-xs text-navy dark:text-slate-100 truncate pr-2" title={c.name}>
                                                {c.name}
                                            </span>
                                        </div>
                                        {c.tier && <div className="mb-2"><TierBadge tier={c.tier} compact /></div>}
                                        <p className="text-[10px] text-navy/50 dark:text-slate-400 truncate mt-1">
                                            {c.one_liner || c.email || 'No details'}
                                        </p>
                                        {c.next_followup_date && new Date(c.next_followup_date) < new Date() && (
                                            <span className="absolute bottom-2 right-2 text-[9px] font-bold text-red-600 bg-red-100 px-1 py-0.5 rounded">
                                                Overdue
                                            </span>
                                        )}
                                        {c.touch_count > 0 && (
                                            <span className="absolute bottom-2 left-3 text-[9px] text-navy/40 dark:text-slate-500 font-medium">
                                                Touch {c.touch_count}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
