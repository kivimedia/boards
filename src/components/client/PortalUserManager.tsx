'use client';

import { useState, useEffect, useCallback } from 'react';
import { ClientPortalUser } from '@/lib/types';
import Button from '@/components/ui/Button';

interface PortalUserManagerProps {
  clientId: string;
}

interface Toast {
  type: 'success' | 'error';
  message: string;
}

export default function PortalUserManager({ clientId }: PortalUserManagerProps) {
  const [users, setUsers] = useState<ClientPortalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newIsPrimary, setNewIsPrimary] = useState(false);
  const [addingUser, setAddingUser] = useState(false);
  const [sendingLinkId, setSendingLinkId] = useState<string | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/portal-users`);
      if (!res.ok) throw new Error('Failed to load portal users');
      const json = await res.json();
      setUsers(json.data || []);
    } catch {
      showToast('error', 'Failed to load portal users.');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newEmail.trim() || !newName.trim()) {
      showToast('error', 'Please fill in both name and email.');
      return;
    }

    setAddingUser(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/portal-users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail.trim(),
          name: newName.trim(),
          is_primary_contact: newIsPrimary,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to add user');
      }

      showToast('success', 'Portal user added successfully.');
      setNewEmail('');
      setNewName('');
      setNewIsPrimary(false);
      setShowAddForm(false);
      fetchUsers();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to add user.');
    } finally {
      setAddingUser(false);
    }
  };

  const handleSendMagicLink = async (userId: string) => {
    setSendingLinkId(userId);
    try {
      const res = await fetch(`/api/clients/${clientId}/portal-users/${userId}/magic-link`, {
        method: 'POST',
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to send magic link');
      }

      showToast('success', 'Magic link sent successfully.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to send magic link.');
    } finally {
      setSendingLinkId(null);
    }
  };

  const handleDeactivate = async (userId: string) => {
    setDeactivatingId(userId);
    try {
      const res = await fetch(`/api/clients/${clientId}/portal-users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: false }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to deactivate user');
      }

      showToast('success', 'User deactivated.');
      fetchUsers();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to deactivate user.');
    } finally {
      setDeactivatingId(null);
    }
  };

  return (
    <div className="bg-white dark:bg-dark-surface rounded-2xl border border-cream-dark dark:border-slate-700 shadow-card">
      {/* Toast */}
      {toast && (
        <div
          className={`
            fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg font-body text-sm
            ${toast.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
            }
          `}
        >
          <div className="flex items-center gap-2">
            {toast.type === 'success' ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-cream-dark dark:border-slate-700">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-electric" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
          </svg>
          <h3 className="text-base font-semibold text-navy dark:text-slate-100 font-heading">Portal Users</h3>
          <span className="ml-2 px-2 py-0.5 text-xs font-medium text-navy/50 dark:text-slate-400 bg-cream-dark dark:bg-slate-800 rounded-full font-body">
            {users.filter((u) => u.is_active).length} active
          </span>
        </div>
        <Button
          size="sm"
          variant={showAddForm ? 'ghost' : 'primary'}
          onClick={() => setShowAddForm(!showAddForm)}
        >
          {showAddForm ? 'Cancel' : '+ Add User'}
        </Button>
      </div>

      {/* Add User Form */}
      {showAddForm && (
        <div className="p-5 bg-cream/50 dark:bg-navy/50 border-b border-cream-dark dark:border-slate-700">
          <form onSubmit={handleAddUser} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1.5 uppercase tracking-wider font-heading">
                  Name
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Full name"
                  className="
                    w-full px-3 py-2.5 rounded-xl bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100
                    placeholder:text-navy/30 dark:text-slate-600 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30
                    focus:border-electric font-body
                  "
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 mb-1.5 uppercase tracking-wider font-heading">
                  Email
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="user@company.com"
                  className="
                    w-full px-3 py-2.5 rounded-xl bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 text-sm text-navy dark:text-slate-100
                    placeholder:text-navy/30 dark:text-slate-600 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30
                    focus:border-electric font-body
                  "
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newIsPrimary}
                  onChange={(e) => setNewIsPrimary(e.target.checked)}
                  className="w-4 h-4 rounded border-cream-dark dark:border-slate-600 text-electric focus:ring-electric/30"
                />
                <span className="text-sm text-navy/60 dark:text-slate-400 font-body">Primary contact</span>
              </label>

              <Button type="submit" size="sm" loading={addingUser} disabled={!newEmail.trim() || !newName.trim()}>
                Add User
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Users List */}
      <div className="divide-y divide-cream-dark dark:divide-slate-700">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <svg className="animate-spin h-6 w-6 text-electric" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <div className="w-12 h-12 rounded-full bg-cream-dark dark:bg-slate-800 flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-navy/30 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <p className="text-sm text-navy/40 dark:text-slate-500 font-body text-center">
              No portal users yet. Add a user to give them access to the client portal.
            </p>
          </div>
        ) : (
          users.map((user) => (
            <div
              key={user.id}
              className={`flex items-center gap-4 p-4 ${!user.is_active ? 'opacity-50' : ''}`}
            >
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-electric/10 flex items-center justify-center shrink-0">
                <span className="text-sm font-semibold text-electric font-heading">
                  {user.name.charAt(0).toUpperCase()}
                </span>
              </div>

              {/* User Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-navy dark:text-slate-100 font-body truncate">
                    {user.name}
                  </p>
                  {user.is_primary_contact && (
                    <span className="px-1.5 py-0.5 text-[10px] font-semibold text-electric bg-electric/10 rounded font-heading uppercase tracking-wider">
                      Primary
                    </span>
                  )}
                  {!user.is_active && (
                    <span className="px-1.5 py-0.5 text-[10px] font-semibold text-red-600 bg-red-50 rounded font-heading uppercase tracking-wider">
                      Inactive
                    </span>
                  )}
                </div>
                <p className="text-xs text-navy/40 dark:text-slate-500 font-body truncate">{user.email}</p>
                {user.last_login_at && (
                  <p className="text-[11px] text-navy/30 dark:text-slate-600 font-body mt-0.5">
                    Last login: {new Date(user.last_login_at).toLocaleDateString()}
                  </p>
                )}
              </div>

              {/* Actions */}
              {user.is_active && (
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleSendMagicLink(user.id)}
                    loading={sendingLinkId === user.id}
                    disabled={sendingLinkId === user.id}
                  >
                    <span className="flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      Send Link
                    </span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeactivate(user.id)}
                    loading={deactivatingId === user.id}
                    disabled={deactivatingId === user.id}
                    className="text-red-500 hover:text-red-600 hover:bg-red-50"
                  >
                    Deactivate
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
