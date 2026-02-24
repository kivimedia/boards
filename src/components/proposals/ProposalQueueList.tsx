'use client';

import { ProposalDraft } from './ProposalQueueView';
import ConfidenceBadge from './ConfidenceBadge';

interface Props {
  proposals: ProposalDraft[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

export default function ProposalQueueList({ proposals, selectedId, onSelect, onApprove, onReject }: Props) {
  return (
    <div className="divide-y divide-gray-200 dark:divide-gray-700">
      {proposals.map((proposal) => {
        const card = proposal.card;
        const isSelected = proposal.id === selectedId;

        return (
          <div
            key={proposal.id}
            onClick={() => onSelect(proposal.id)}
            className={`p-4 cursor-pointer transition-colors ${
              isSelected
                ? 'bg-pink-50 dark:bg-pink-900/20'
                : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <ConfidenceBadge tier={proposal.confidence_tier} />
                  {proposal.status !== 'draft' && (
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                        proposal.status === 'approved'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                          : proposal.status === 'rejected'
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                          : proposal.status === 'sent'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                      }`}
                    >
                      {proposal.status}
                    </span>
                  )}
                </div>

                <h3 className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                  {card?.title || 'Unknown Card'}
                </h3>

                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {card?.event_type && <span>{card.event_type}</span>}
                  {card?.event_date && (
                    <span>
                      {new Date(card.event_date).toLocaleDateString()}
                    </span>
                  )}
                  {card?.venue_name && <span>{card.venue_name}</span>}
                </div>

                <div className="flex items-center gap-3 mt-1.5">
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    ${proposal.total_amount?.toLocaleString() || '0'}
                  </span>
                  {proposal.pattern && (
                    <span className="text-xs text-gray-400 dark:text-gray-500 truncate">
                      Pattern: {proposal.pattern.name}
                    </span>
                  )}
                </div>
              </div>

              {/* Quick actions for drafts */}
              {proposal.status === 'draft' && (
                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onApprove(proposal.id);
                    }}
                    className="px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded hover:bg-green-200 dark:text-green-300 dark:bg-green-900/30 dark:hover:bg-green-900/50 transition-colors"
                  >
                    Approve
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onReject(proposal.id);
                    }}
                    className="px-2 py-1 text-xs font-medium text-red-700 bg-red-100 rounded hover:bg-red-200 dark:text-red-300 dark:bg-red-900/30 dark:hover:bg-red-900/50 transition-colors"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
