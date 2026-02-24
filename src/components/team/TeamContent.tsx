'use client';

import { useState, useEffect } from 'react';
import MemberColumn from './MemberColumn';
import PendingApprovals from './PendingApprovals';
import type { TeamMemberWorkload } from '@/lib/team-view';
import { useAuth } from '@/hooks/useAuth';
import { isBusinessOwner } from '@/lib/permissions';

type Tab = 'workload' | 'pending';

export default function TeamContent() {
  const [workloads, setWorkloads] = useState<TeamMemberWorkload[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('workload');
  const [pendingCount, setPendingCount] = useState(0);
  const { profile } = useAuth();

  const showApprovalTab = isBusinessOwner(profile?.business_role ?? null);

  useEffect(() => {
    const fetchTeam = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/team');
        const json = await res.json();
        if (json.data) {
          setWorkloads(json.data);
        }
      } catch (err) {
        console.error('Failed to fetch team workload:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchTeam();
  }, []);

  // Fetch pending count for badge
  useEffect(() => {
    if (!showApprovalTab) return;
    const fetchPendingCount = async () => {
      try {
        const res = await fetch('/api/team/pending');
        const json = await res.json();
        if (json.data) {
          setPendingCount(json.data.length);
        }
      } catch {
        // ignore
      }
    };
    fetchPendingCount();
  }, [showApprovalTab]);

  return (
    <div className="flex-1 overflow-y-auto bg-cream dark:bg-navy p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Tabs */}
        {showApprovalTab && (
          <div className="flex gap-1 mb-6 bg-white dark:bg-dark-surface rounded-xl border-2 border-cream-dark dark:border-slate-700 p-1 w-fit">
            <button
              onClick={() => setActiveTab('workload')}
              className={`px-4 py-2 rounded-lg text-sm font-medium font-body transition-colors ${
                activeTab === 'workload'
                  ? 'bg-electric text-white'
                  : 'text-navy/60 dark:text-slate-400 hover:text-navy dark:hover:text-white'
              }`}
            >
              Team Workload
            </button>
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-4 py-2 rounded-lg text-sm font-medium font-body transition-colors flex items-center gap-2 ${
                activeTab === 'pending'
                  ? 'bg-electric text-white'
                  : 'text-navy/60 dark:text-slate-400 hover:text-navy dark:hover:text-white'
              }`}
            >
              Pending Approvals
              {pendingCount > 0 && (
                <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
                  activeTab === 'pending'
                    ? 'bg-white/20 text-white'
                    : 'bg-red-500 text-white'
                }`}>
                  {pendingCount}
                </span>
              )}
            </button>
          </div>
        )}

        {activeTab === 'workload' && (
          <>
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-electric border-t-transparent rounded-full animate-spin" />
              </div>
            ) : workloads.length === 0 ? (
              <div className="text-center py-20">
                <div className="w-16 h-16 rounded-2xl bg-electric/10 flex items-center justify-center mx-auto mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-electric">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <h3 className="text-navy dark:text-white font-heading font-semibold mb-1">No team members</h3>
                <p className="text-navy/50 dark:text-white/50 text-sm">No team members found in the workspace.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {workloads.map((member) => (
                  <MemberColumn key={member.userId} member={member} />
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'pending' && showApprovalTab && (
          <PendingApprovals />
        )}
      </div>
    </div>
  );
}
