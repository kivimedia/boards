'use client';

import { useState, useEffect } from 'react';
import type { Profile, BusinessRole } from '@/lib/types';
import { BUSINESS_ROLES, getBusinessRoleLabel } from '@/lib/permissions';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';

export default function PendingApprovals() {
  const [pendingUsers, setPendingUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoles, setSelectedRoles] = useState<Record<string, BusinessRole>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const assignableRoles = BUSINESS_ROLES.filter((r) => r !== 'owner');

  useEffect(() => {
    fetchPending();
  }, []);

  const fetchPending = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/team/pending');
      const json = await res.json();
      if (json.data) {
        setPendingUsers(json.data);
      }
    } catch (err) {
      console.error('Failed to fetch pending users:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (userId: string) => {
    const role = selectedRoles[userId];
    if (!role) return;

    setActionLoading(userId);
    try {
      const res = await fetch('/api/team/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, businessRole: role }),
      });
      if (res.ok) {
        setPendingUsers((prev) => prev.filter((u) => u.id !== userId));
      }
    } catch (err) {
      console.error('Failed to approve user:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (userId: string) => {
    setActionLoading(userId);
    try {
      const res = await fetch('/api/team/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        setPendingUsers((prev) => prev.filter((u) => u.id !== userId));
      }
    } catch (err) {
      console.error('Failed to reject user:', err);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-electric border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (pendingUsers.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-14 h-14 rounded-2xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>
        <h3 className="text-navy dark:text-white font-heading font-semibold mb-1">No pending requests</h3>
        <p className="text-navy/50 dark:text-white/50 text-sm">All signup requests have been handled.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {pendingUsers.map((user) => (
        <div
          key={user.id}
          className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-5 flex items-center gap-4"
        >
          <Avatar name={user.display_name} src={user.avatar_url} size="md" />
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-navy dark:text-white truncate">
              {user.display_name}
            </h4>
            {user.created_at && (
              <p className="text-xs text-navy/40 dark:text-slate-500 mt-0.5">
                Signed up {new Date(user.created_at).toLocaleDateString()}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="relative">
              <select
                value={selectedRoles[user.id] || ''}
                onChange={(e) =>
                  setSelectedRoles((prev) => ({ ...prev, [user.id]: e.target.value as BusinessRole }))
                }
                className="appearance-none px-3 py-2 pr-8 rounded-xl bg-white dark:bg-dark-surface border-2 border-navy/20 dark:border-slate-700 text-navy dark:text-slate-100 text-xs font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-all"
              >
                <option value="">Select role...</option>
                {assignableRoles.map((role) => (
                  <option key={role} value={role}>
                    {getBusinessRoleLabel(role)}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-navy/30">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>
            <Button
              variant="primary"
              size="sm"
              disabled={!selectedRoles[user.id] || actionLoading === user.id}
              loading={actionLoading === user.id}
              onClick={() => handleApprove(user.id)}
            >
              Approve
            </Button>
            <button
              onClick={() => handleReject(user.id)}
              disabled={actionLoading === user.id}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-navy/30 dark:text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
              title="Reject"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
