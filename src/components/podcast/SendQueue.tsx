'use client';

import { useState, useEffect, useCallback } from 'react';
import type { PGACandidate, PGACandidateStatus } from '@/lib/types';
import OutreachEmailPanel from './OutreachEmailPanel';

const STATUS_COLORS: Record<string, string> = {
    researched: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300',
    qualified: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
    outreach_draft: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    outreach_active: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
    replied: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    scheduled: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
    interviewed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
};

export default function SendQueue() {
    const [candidates, setCandidates] = useState<PGACandidate[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<PGACandidateStatus | ''>('');
    const [selectedCandidate, setSelectedCandidate] = useState<PGACandidate | null>(null);

    const fetchCandidates = useCallback(async () => {
        setLoading(true);
        const params = new URLSearchParams();
        if (statusFilter) {
            params.set('status', statusFilter);
        } else {
            params.set('status', 'researched,qualified,outreach_draft,outreach_active,replied,scheduled,interviewed');
        }
        if (search) params.set('search', search);
        params.set('limit', '50');

        try {
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
    }, [statusFilter, search]);

    useEffect(() => {
        fetchCandidates();
    }, [fetchCandidates]);

    return (
        <div className="flex-1 overflow-auto p-6 bg-cream dark:bg-slate-900 flex flex-col h-full">
            {/* Header Controls */}
            <div className="flex flex-wrap items-center gap-3 mb-6 shrink-0">
                <input
                    type="text"
                    placeholder="Search outreach candidates..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="flex-1 min-w-[200px] max-w-sm px-3 py-2 text-sm rounded-lg border border-navy/10 dark:border-slate-700 bg-white dark:bg-slate-800 text-navy dark:text-slate-100 outline-none focus:ring-2 focus:ring-electric/30"
                />

                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as PGACandidateStatus | '')}
                    className="px-3 py-2 text-sm rounded-lg border border-navy/10 dark:border-slate-700 bg-white dark:bg-slate-800 text-navy dark:text-slate-100"
                >
                    <option value="">All Outreach Statuses</option>
                    <option value="outreach_draft">Drafting / Pending Send</option>
                    <option value="outreach_active">Active Outreach</option>
                    <option value="replied">Replied</option>
                    <option value="scheduled">Scheduled</option>
                </select>
            </div>

            {/* Two Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
                {/* Left: Candidate List */}
                <div className="lg:col-span-1 bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 overflow-hidden flex flex-col">
                    <div className="p-3 bg-cream/50 dark:bg-slate-800/80 border-b border-navy/5 dark:border-slate-700 flex justify-between items-center shrink-0">
                        <h3 className="font-semibold text-navy dark:text-slate-200 text-sm">Send Queue</h3>
                        <span className="text-xs text-navy/50 dark:text-slate-500">{candidates.length} total</span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {loading ? (
                            <div className="flex justify-center py-10">
                                <div className="w-5 h-5 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
                            </div>
                        ) : candidates.length === 0 ? (
                            <div className="text-center py-10 text-navy/40 dark:text-slate-500 text-sm">
                                No candidates found
                            </div>
                        ) : (
                            candidates.map(candidate => (
                                <button
                                    key={candidate.id}
                                    onClick={() => setSelectedCandidate(candidate)}
                                    className={`w-full text-left p-3 rounded-lg transition-colors border ${selectedCandidate?.id === candidate.id
                                        ? 'bg-electric/5 border-electric/30 dark:bg-electric/10'
                                        : 'border-transparent hover:bg-cream/50 dark:hover:bg-slate-700/50'
                                        }`}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="font-semibold text-sm text-navy dark:text-slate-100 truncate pr-2">
                                            {candidate.name}
                                        </span>
                                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase shrink-0 ${STATUS_COLORS[candidate.status] || 'bg-slate-100 text-slate-600'}`}>
                                            {candidate.status.replace(/_/g, ' ')}
                                        </span>
                                    </div>
                                    <p className="text-xs text-navy/50 dark:text-slate-400 truncate">
                                        {candidate.email || 'No email available'}
                                    </p>
                                </button>
                            ))
                        )}
                    </div>
                </div>

                {/* Right: Email Panel */}
                <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl border border-navy/5 dark:border-slate-700 overflow-hidden flex flex-col">
                    <div className="p-3 bg-cream/50 dark:bg-slate-800/80 border-b border-navy/5 dark:border-slate-700 flex items-center gap-3 shrink-0">
                        <h3 className="font-semibold text-navy dark:text-slate-200 text-sm">
                            {selectedCandidate ? selectedCandidate.name : 'Outreach Workspace'}
                        </h3>
                        {selectedCandidate && selectedCandidate.status === 'outreach_draft' && (
                            <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                                Drafts in progress
                            </span>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 shrink-0 min-h-[400px]">
                        {selectedCandidate ? (
                            <OutreachEmailPanel
                                candidateId={selectedCandidate.id}
                                candidateName={selectedCandidate.name}
                                hasDossier={true}
                                onRefresh={fetchCandidates}
                            />
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-navy/40 dark:text-slate-500 min-h-[400px]">
                                <span className="text-4xl mb-3">✉️</span>
                                <p className="text-sm">Select a candidate to view their outreach campaigns</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
