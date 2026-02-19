'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Profile, UserRole } from '@/lib/types';
import { ALL_ROLES, getRoleLabel, getRoleDescription } from '@/lib/permissions';
import Avatar from '@/components/ui/Avatar';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

interface ProfileWithRole extends Omit<Profile, 'email'> {
  user_role: UserRole;
  email?: string | null;
}

interface UserManagementProps {
  currentUserId: string;
}

interface Toast {
  type: 'success' | 'error';
  message: string;
}

export default function UserManagement({ currentUserId }: UserManagementProps) {
  const [profiles, setProfiles] = useState<ProfileWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  // Invite state
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviting, setInviting] = useState(false);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<ProfileWithRole | null>(null);
  const [reassignTo, setReassignTo] = useState('');
  const [deleting, setDeleting] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/users');
      const json = await res.json();
      if (json.data) {
        setProfiles(json.data);
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const filteredProfiles = useMemo(() => {
    if (!searchQuery.trim()) return profiles;
    const query = searchQuery.toLowerCase();
    return profiles.filter(
      (p) =>
        p.display_name.toLowerCase().includes(query) ||
        p.role.toLowerCase().includes(query) ||
        (p.email && p.email.toLowerCase().includes(query))
    );
  }, [profiles, searchQuery]);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    setSavingUserId(userId);
    try {
      const response = await fetch('/api/settings/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, user_role: newRole }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to update role');
      }

      setProfiles((prev) =>
        prev.map((p) =>
          p.id === userId ? { ...p, user_role: newRole } : p
        )
      );
      showToast('success', 'User role updated successfully.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to update role.');
    } finally {
      setSavingUserId(null);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !inviteName.trim()) return;
    setInviting(true);
    try {
      const response = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), display_name: inviteName.trim() }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to invite user');
      }

      showToast('success', `Invited ${inviteName.trim()} (${inviteEmail.trim()}) successfully.`);
      setInviteEmail('');
      setInviteName('');
      setShowInviteForm(false);
      // Refresh user list
      await fetchUsers();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to invite user.');
    } finally {
      setInviting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !reassignTo) return;
    setDeleting(true);
    try {
      const response = await fetch('/api/settings/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: deleteTarget.id, reassign_to: reassignTo }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to delete user');
      }

      const result = await response.json();
      showToast(
        'success',
        `Deleted ${result.data.deleted}. ${result.data.cards_reassigned} cards reassigned to ${result.data.reassigned_to}.`
      );
      setDeleteTarget(null);
      setReassignTo('');
      // Refresh user list
      await fetchUsers();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to delete user.');
    } finally {
      setDeleting(false);
    }
  };

  const otherUsers = profiles.filter((p) => p.id !== deleteTarget?.id && p.id !== currentUserId);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-cream dark:bg-dark-bg">
        <div className="animate-spin h-8 w-8 border-2 border-electric border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-cream dark:bg-dark-bg p-6">
      <div className="max-w-5xl mx-auto">
        {/* Toast Notification */}
        {toast && (
          <div
            className={`
              fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg font-body text-sm max-w-md
              animate-in fade-in slide-in-from-top-2 duration-200
              ${toast.type === 'success'
                ? 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200'
                : 'bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
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

        {/* Header Section */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-navy/60 dark:text-slate-400 font-body text-sm">
              Manage user roles across the workspace. Changes apply globally.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-navy/40 dark:text-slate-500 font-body">
              {profiles.length} user{profiles.length !== 1 ? 's' : ''} total
            </span>
            <Button
              onClick={() => setShowInviteForm(!showInviteForm)}
              className="text-sm"
            >
              + Invite User
            </Button>
          </div>
        </div>

        {/* Invite Form */}
        {showInviteForm && (
          <div className="mb-6 bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-5">
            <h3 className="text-sm font-semibold text-navy dark:text-white mb-3 font-heading">
              Invite New User
            </h3>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs text-navy/50 dark:text-slate-400 mb-1 font-body">Display Name</label>
                <Input
                  placeholder="e.g. John Smith"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-navy/50 dark:text-slate-400 mb-1 font-body">Email</label>
                <Input
                  type="email"
                  placeholder="john@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>
              <Button
                onClick={handleInvite}
                disabled={inviting || !inviteEmail.trim() || !inviteName.trim()}
              >
                {inviting ? 'Inviting...' : 'Send Invite'}
              </Button>
              <button
                onClick={() => { setShowInviteForm(false); setInviteEmail(''); setInviteName(''); }}
                className="text-sm text-navy/40 dark:text-slate-500 hover:text-navy dark:hover:text-slate-200 px-2 py-2"
              >
                Cancel
              </button>
            </div>
            <p className="text-xs text-navy/40 dark:text-slate-500 mt-2 font-body">
              Creates an account with the given email. The user can log in with this email.
            </p>
          </div>
        )}

        {/* Search */}
        <div className="mb-6 max-w-sm">
          <Input
            placeholder="Search users by name, role, or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Users Table */}
        <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-cream-dark dark:border-slate-700 bg-cream/50 dark:bg-navy/50">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-navy/40 dark:text-slate-400 uppercase tracking-wider font-body">
                    User
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-navy/40 dark:text-slate-400 uppercase tracking-wider font-body">
                    Email
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-navy/40 dark:text-slate-400 uppercase tracking-wider font-body">
                    Profile Role
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-navy/40 dark:text-slate-400 uppercase tracking-wider font-body">
                    System Role
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-navy/40 dark:text-slate-400 uppercase tracking-wider font-body">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-dark dark:divide-slate-700">
                {filteredProfiles.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-navy/40 dark:text-slate-500 font-body text-sm">
                      {searchQuery ? 'No users match your search.' : 'No users found.'}
                    </td>
                  </tr>
                ) : (
                  filteredProfiles.map((profile) => {
                    const isCurrentUser = profile.id === currentUserId;
                    const isSaving = savingUserId === profile.id;

                    return (
                      <tr
                        key={profile.id}
                        className="hover:bg-cream/30 dark:hover:bg-slate-800/30 transition-colors"
                      >
                        {/* User Info */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <Avatar
                              name={profile.display_name}
                              src={profile.avatar_url}
                              size="md"
                            />
                            <div>
                              <p className="text-sm font-medium text-navy dark:text-slate-100 font-body">
                                {profile.display_name}
                                {isCurrentUser && (
                                  <span className="ml-2 text-xs text-electric font-normal">(you)</span>
                                )}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Email */}
                        <td className="px-6 py-4">
                          <span className="text-sm text-navy/60 dark:text-slate-400 font-body">
                            {profile.email || '-'}
                          </span>
                        </td>

                        {/* Profile Role (text from profiles.role) */}
                        <td className="px-6 py-4">
                          <span className="text-sm text-navy/60 dark:text-slate-400 font-body">
                            {profile.role}
                          </span>
                        </td>

                        {/* System Role Dropdown */}
                        <td className="px-6 py-4">
                          <div className="relative">
                            <select
                              value={profile.user_role}
                              disabled={isCurrentUser || isSaving}
                              onChange={(e) =>
                                handleRoleChange(profile.id, e.target.value as UserRole)
                              }
                              className={`
                                appearance-none w-full max-w-[180px] px-3 py-1.5 pr-8 rounded-lg
                                bg-white dark:bg-dark-surface border-2 border-navy/10 dark:border-slate-700 text-sm font-body text-navy dark:text-slate-100
                                focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric
                                transition-all duration-200
                                ${isCurrentUser ? 'opacity-50 cursor-not-allowed bg-cream/50' : 'cursor-pointer hover:border-navy/20'}
                              `}
                              title={isCurrentUser ? 'You cannot change your own role' : getRoleDescription(profile.user_role)}
                            >
                              {ALL_ROLES.map((role) => (
                                <option key={role} value={role}>
                                  {getRoleLabel(role)}
                                </option>
                              ))}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-navy/30">
                                <polyline points="6 9 12 15 18 9" />
                              </svg>
                            </div>
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {isSaving ? (
                              <span className="text-xs text-electric font-body flex items-center gap-1.5">
                                <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                Saving...
                              </span>
                            ) : isCurrentUser ? (
                              <span className="text-xs text-navy/30 dark:text-slate-500 font-body">--</span>
                            ) : (
                              <button
                                onClick={() => { setDeleteTarget(profile); setReassignTo(''); }}
                                className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-body transition-colors"
                                title="Delete user and reassign cards"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 shadow-xl p-6 w-full max-w-md mx-4">
              <h3 className="text-lg font-semibold text-navy dark:text-white font-heading mb-2">
                Delete User
              </h3>
              <p className="text-sm text-navy/60 dark:text-slate-400 font-body mb-4">
                You are about to delete <strong className="text-navy dark:text-white">{deleteTarget.display_name}</strong>
                {deleteTarget.email && (
                  <span className="text-navy/40 dark:text-slate-500"> ({deleteTarget.email})</span>
                )}. All their assigned cards will be reassigned to another user.
              </p>

              <label className="block text-sm font-medium text-navy dark:text-slate-200 mb-2 font-body">
                Reassign cards to:
              </label>
              <select
                value={reassignTo}
                onChange={(e) => setReassignTo(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-bg border-2 border-navy/10 dark:border-slate-700 text-sm font-body text-navy dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric mb-4"
              >
                <option value="">Select a user...</option>
                {otherUsers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name} {p.email ? `(${p.email})` : ''}
                  </option>
                ))}
              </select>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => { setDeleteTarget(null); setReassignTo(''); }}
                  className="px-4 py-2 text-sm text-navy/60 dark:text-slate-400 hover:text-navy dark:hover:text-slate-200 font-body transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting || !reassignTo}
                  className={`
                    px-4 py-2 text-sm font-medium rounded-lg transition-colors font-body
                    ${deleting || !reassignTo
                      ? 'bg-red-200 dark:bg-red-900/30 text-red-400 cursor-not-allowed'
                      : 'bg-red-500 hover:bg-red-600 text-white'
                    }
                  `}
                >
                  {deleting ? 'Deleting...' : 'Delete & Reassign'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
