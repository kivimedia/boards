'use client';

import { useState, useMemo } from 'react';
import { Profile, UserRole } from '@/lib/types';
import { ALL_ROLES, getRoleLabel, getRoleDescription } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/client';
import Avatar from '@/components/ui/Avatar';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

interface ProfileWithRole extends Profile {
  user_role: UserRole;
}

interface UserManagementProps {
  initialProfiles: ProfileWithRole[];
  currentUserId: string;
}

interface Toast {
  type: 'success' | 'error';
  message: string;
}

export default function UserManagement({ initialProfiles, currentUserId }: UserManagementProps) {
  const [profiles, setProfiles] = useState<ProfileWithRole[]>(initialProfiles);
  const [searchQuery, setSearchQuery] = useState('');
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const supabase = createClient();

  const filteredProfiles = useMemo(() => {
    if (!searchQuery.trim()) return profiles;
    const query = searchQuery.toLowerCase();
    return profiles.filter(
      (p) =>
        p.display_name.toLowerCase().includes(query) ||
        p.role.toLowerCase().includes(query)
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

  return (
    <div className="flex-1 overflow-y-auto bg-cream dark:bg-dark-bg p-6">
      <div className="max-w-5xl mx-auto">
        {/* Toast Notification */}
        {toast && (
          <div
            className={`
              fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg font-body text-sm
              animate-in fade-in slide-in-from-top-2 duration-200
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

        {/* Header Section */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-navy/60 dark:text-slate-400 font-body text-sm">
              Manage user roles across the workspace. Changes apply globally.
            </p>
          </div>
          <div className="text-sm text-navy/40 dark:text-slate-500 font-body">
            {profiles.length} user{profiles.length !== 1 ? 's' : ''} total
          </div>
        </div>

        {/* Search */}
        <div className="mb-6 max-w-sm">
          <Input
            placeholder="Search users by name or role..."
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
                    <td colSpan={4} className="px-6 py-12 text-center text-navy/40 dark:text-slate-500 font-body text-sm">
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
                            <span className="text-xs text-navy/40 dark:text-slate-500 font-body">
                              {getRoleDescription(profile.user_role)}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
