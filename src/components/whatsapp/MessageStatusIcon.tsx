'use client';

import type { WhatsAppMessageStatus } from '@/lib/types';

interface Props {
  status: WhatsAppMessageStatus;
  size?: 'sm' | 'md';
}

const STATUS_CONFIG: Record<WhatsAppMessageStatus, { icon: string; color: string; label: string }> = {
  pending: { icon: '⏳', color: 'text-gray-400', label: 'Pending' },
  sent: { icon: '✓', color: 'text-gray-400 dark:text-gray-500', label: 'Sent' },
  delivered: { icon: '✓✓', color: 'text-gray-500 dark:text-gray-400', label: 'Delivered' },
  read: { icon: '✓✓', color: 'text-blue-500', label: 'Read' },
  failed: { icon: '✕', color: 'text-red-500', label: 'Failed' },
};

export default function MessageStatusIcon({ status, size = 'sm' }: Props) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const sizeClass = size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <span
      className={`inline-flex items-center ${config.color} ${sizeClass}`}
      title={config.label}
    >
      {config.icon}
    </span>
  );
}

/**
 * Get a human-readable status label.
 */
export function getStatusLabel(status: WhatsAppMessageStatus): string {
  return STATUS_CONFIG[status]?.label ?? 'Unknown';
}

/**
 * Get the CSS color class for a status.
 */
export function getStatusColor(status: WhatsAppMessageStatus): string {
  return STATUS_CONFIG[status]?.color ?? 'text-gray-400';
}
