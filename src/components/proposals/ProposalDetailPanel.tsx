'use client';

import { useState } from 'react';
import { ProposalDraft } from './ProposalQueueView';
import ConfidenceBadge from './ConfidenceBadge';
import ProposalEditor from './ProposalEditor';
import SimilarProposalsPanel from './SimilarProposalsPanel';

interface Props {
  proposal: ProposalDraft;
  onApprove: () => void;
  onReject: () => void;
  onClose: () => void;
  onUpdate: () => void;
}

export default function ProposalDetailPanel({ proposal, onApprove, onReject, onClose, onUpdate }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [showSimilar, setShowSimilar] = useState(false);
  const card = proposal.card;
  const isDraft = proposal.status === 'draft';

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {card?.title || 'Proposal Detail'}
          </h2>
          <div className="flex items-center gap-2 mt-1">
            <ConfidenceBadge tier={proposal.confidence_tier} size="md" />
            {proposal.pattern && (
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Matched: {proposal.pattern.name}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Lead Info */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        {card?.event_type && (
          <div>
            <span className="text-gray-500 dark:text-gray-400">Event Type</span>
            <p className="font-medium text-gray-900 dark:text-gray-100">{card.event_type}</p>
          </div>
        )}
        {card?.event_date && (
          <div>
            <span className="text-gray-500 dark:text-gray-400">Event Date</span>
            <p className="font-medium text-gray-900 dark:text-gray-100">
              {new Date(card.event_date).toLocaleDateString()}
            </p>
          </div>
        )}
        {card?.venue_name && (
          <div>
            <span className="text-gray-500 dark:text-gray-400">Venue</span>
            <p className="font-medium text-gray-900 dark:text-gray-100">
              {card.venue_name}{card.venue_city ? `, ${card.venue_city}` : ''}
            </p>
          </div>
        )}
        {card?.client_email && (
          <div>
            <span className="text-gray-500 dark:text-gray-400">Client Email</span>
            <p className="font-medium text-gray-900 dark:text-gray-100">{card.client_email}</p>
          </div>
        )}
      </div>

      {/* Line Items */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Line Items</h3>
          {isDraft && !isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="text-xs text-pink-600 hover:text-pink-700 dark:text-pink-400"
            >
              Edit
            </button>
          )}
        </div>

        {isEditing ? (
          <ProposalEditor
            proposal={proposal}
            onSave={async (updates) => {
              try {
                await fetch(`/api/proposals/${proposal.id}/approve`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    modifications: updates,
                    send_via: 'manual',
                  }),
                });
                onUpdate();
                setIsEditing(false);
              } catch (err) {
                console.error('Save failed:', err);
              }
            }}
            onCancel={() => setIsEditing(false)}
          />
        ) : (
          <div className="border rounded-lg overflow-hidden dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Product</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Category</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Qty</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Price</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {proposal.line_items.map((item, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-gray-900 dark:text-gray-100">
                      {item.product}
                      {item.notes && (
                        <span className="block text-xs text-gray-400">{item.notes}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-500 dark:text-gray-400 capitalize">{item.category}</td>
                    <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100">{item.quantity}</td>
                    <td className="px-3 py-2 text-right text-gray-900 dark:text-gray-100">
                      ${item.unitPrice?.toLocaleString() || '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-gray-100">
                      ${item.totalPrice?.toLocaleString() || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 dark:bg-gray-800">
                  <td colSpan={4} className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-gray-100">
                    Total
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-gray-900 dark:text-gray-100">
                    ${proposal.total_amount?.toLocaleString() || '0'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Email Preview */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Email Preview</h3>
        <div className="border rounded-lg p-4 dark:border-gray-700 bg-white dark:bg-gray-800/50">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Subject:</div>
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
            {proposal.email_subject}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Body:</div>
          <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
            {proposal.email_body}
          </div>
        </div>
      </div>

      {/* Similar Proposals Toggle */}
      {proposal.pattern_id && (
        <div>
          <button
            onClick={() => setShowSimilar(!showSimilar)}
            className="text-sm text-pink-600 hover:text-pink-700 dark:text-pink-400 dark:hover:text-pink-300"
          >
            {showSimilar ? 'Hide' : 'Show'} Similar Proposals
          </button>
          {showSimilar && <SimilarProposalsPanel patternId={proposal.pattern_id} currentId={proposal.id} />}
        </div>
      )}

      {/* AI Reasoning */}
      {!!proposal.modifications?.reasoning && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">AI Reasoning</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 italic">
            {String(proposal.modifications.reasoning)}
          </p>
        </div>
      )}

      {/* Actions */}
      {isDraft && (
        <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onApprove}
            className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm transition-colors"
          >
            Approve Proposal
          </button>
          <button
            onClick={onReject}
            className="flex-1 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 font-medium text-sm transition-colors dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}
