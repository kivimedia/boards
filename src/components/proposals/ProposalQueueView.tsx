'use client';

import { useState, useEffect, useCallback } from 'react';
import ProposalQueueList from './ProposalQueueList';
import ProposalDetailPanel from './ProposalDetailPanel';

type ConfidenceTier = 'no_brainer' | 'suggested' | 'needs_human';
type ProposalStatus = 'draft' | 'approved' | 'rejected' | 'sent' | 'modified';

export interface ProposalDraft {
  id: string;
  card_id: string;
  pattern_id: string | null;
  confidence_tier: ConfidenceTier;
  line_items: LineItem[];
  total_amount: number;
  email_subject: string;
  email_body: string;
  status: ProposalStatus;
  approved_by: string | null;
  modifications: Record<string, unknown> | null;
  sent_via: string | null;
  sent_at: string | null;
  created_at: string;
  card: {
    id: string;
    title: string;
    event_type: string | null;
    event_date: string | null;
    venue_name: string | null;
    venue_city: string | null;
    client_email: string | null;
    estimated_value: number | null;
  } | null;
  pattern: {
    id: string;
    name: string;
    is_no_brainer: boolean;
  } | null;
}

export interface LineItem {
  product: string;
  category: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  notes: string | null;
}

type FilterTab = 'all' | 'no_brainer' | 'suggested' | 'needs_human' | 'approved' | 'rejected';

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: 'all', label: 'All Drafts' },
  { value: 'no_brainer', label: 'No-Brainer' },
  { value: 'suggested', label: 'Suggested' },
  { value: 'needs_human', label: 'Needs Human' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

export default function ProposalQueueView() {
  const [proposals, setProposals] = useState<ProposalDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchProposals = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeTab === 'approved' || activeTab === 'rejected') {
        params.set('status', activeTab);
      } else if (activeTab !== 'all') {
        params.set('tier', activeTab);
        params.set('status', 'draft');
      }

      const res = await fetch(`/api/proposals/queue?${params}`);
      const json = await res.json();
      if (json.ok) {
        setProposals(json.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch proposals:', err);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchProposals();
  }, [fetchProposals]);

  const selectedProposal = proposals.find((p) => p.id === selectedId) || null;

  const handleAction = async (action: 'approve' | 'reject', proposalId: string) => {
    try {
      const endpoint = action === 'approve'
        ? `/api/proposals/${proposalId}/approve`
        : `/api/proposals/${proposalId}/reject`;

      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'approve' ? { send_via: 'manual' } : {}),
      });

      if (res.ok) {
        fetchProposals();
        if (selectedId === proposalId) setSelectedId(null);
      }
    } catch (err) {
      console.error(`Failed to ${action} proposal:`, err);
    }
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Filter Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6">
        <nav className="flex space-x-4 overflow-x-auto py-2" aria-label="Tabs">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => {
                setActiveTab(tab.value);
                setSelectedId(null);
              }}
              className={`whitespace-nowrap px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === tab.value
                  ? 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {tab.label}
              {!loading && (
                <span className="ml-1.5 text-xs">
                  ({proposals.filter((p) => {
                    if (tab.value === 'all') return true;
                    if (tab.value === 'approved' || tab.value === 'rejected') return p.status === tab.value;
                    return p.confidence_tier === tab.value && p.status === 'draft';
                  }).length})
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Left: List */}
        <div className={`${selectedProposal ? 'w-1/2 xl:w-2/5' : 'w-full'} overflow-y-auto border-r border-gray-200 dark:border-gray-700`}>
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500" />
            </div>
          ) : proposals.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-500 dark:text-gray-400">
              <p className="text-lg font-medium">No proposals found</p>
              <p className="text-sm mt-1">Generate proposals from the board view or card modal</p>
            </div>
          ) : (
            <ProposalQueueList
              proposals={proposals}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onApprove={(id) => handleAction('approve', id)}
              onReject={(id) => handleAction('reject', id)}
            />
          )}
        </div>

        {/* Right: Detail */}
        {selectedProposal && (
          <div className="flex-1 overflow-y-auto">
            <ProposalDetailPanel
              proposal={selectedProposal}
              onApprove={() => handleAction('approve', selectedProposal.id)}
              onReject={() => handleAction('reject', selectedProposal.id)}
              onClose={() => setSelectedId(null)}
              onUpdate={fetchProposals}
            />
          </div>
        )}
      </div>
    </div>
  );
}
