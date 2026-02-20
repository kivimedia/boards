'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ADMIN_FEATURES,
  FEATURE_LABELS,
  FEATURE_DESCRIPTIONS,
  DELEGATABLE_ROLES,
  AdminFeatureKey,
} from '@/lib/feature-access';
import { getRoleLabel } from '@/lib/permissions';
import { UserRole, Profile } from '@/lib/types';

interface FeatureGrant {
  id: string;
  feature_key: string;
  granted_role: string | null;
  granted_user_id: string | null;
  granted_by: string;
  created_at: string;
  granted_user_profile?: { id: string; display_name: string; avatar_url: string | null } | null;
  granted_by_profile?: { id: string; display_name: string } | null;
}

interface PermissionDelegationProps {
  currentUserId: string;
}

export default function PermissionDelegation({ currentUserId }: PermissionDelegationProps) {
  const [grants, setGrants] = useState<FeatureGrant[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userPickerFeature, setUserPickerFeature] = useState<AdminFeatureKey | null>(null);
  const [selectedUserId, setSelectedUserId] = useState('');

  const fetchGrants = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/permissions');
      const json = await res.json();
      if (json.data) setGrants(json.data);
    } catch {
      setError('Failed to load permissions');
    }
  }, []);

  const fetchProfiles = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/users');
      const json = await res.json();
      if (json.data) setProfiles(json.data);
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchGrants(), fetchProfiles()]).finally(() => setLoading(false));
  }, [fetchGrants, fetchProfiles]);

  // Check if a role grant exists for a feature
  const hasRoleGrant = (featureKey: AdminFeatureKey, role: UserRole): string | null => {
    const grant = grants.find(
      g => g.feature_key === featureKey && g.granted_role === role
    );
    return grant?.id ?? null;
  };

  // Get user grants for a feature
  const getUserGrants = (featureKey: AdminFeatureKey) => {
    return grants.filter(g => g.feature_key === featureKey && g.granted_user_id);
  };

  // Toggle a role grant
  const toggleRoleGrant = async (featureKey: AdminFeatureKey, role: UserRole) => {
    const existingId = hasRoleGrant(featureKey, role);
    const key = `${featureKey}-${role}`;
    setSaving(key);
    setError(null);

    try {
      if (existingId) {
        // Revoke
        await fetch('/api/settings/permissions', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: existingId }),
        });
      } else {
        // Grant
        const res = await fetch('/api/settings/permissions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feature_key: featureKey, granted_role: role }),
        });
        const json = await res.json();
        if (json.error) {
          setError(json.error);
          return;
        }
      }
      await fetchGrants();
    } catch {
      setError('Failed to update permission');
    } finally {
      setSaving(null);
    }
  };

  // Add a user grant
  const addUserGrant = async (featureKey: AdminFeatureKey) => {
    if (!selectedUserId) return;
    setSaving(`user-${featureKey}`);
    setError(null);

    try {
      const res = await fetch('/api/settings/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feature_key: featureKey, granted_user_id: selectedUserId }),
      });
      const json = await res.json();
      if (json.error) {
        setError(json.error);
        return;
      }
      await fetchGrants();
      setSelectedUserId('');
      setUserPickerFeature(null);
    } catch {
      setError('Failed to add user permission');
    } finally {
      setSaving(null);
    }
  };

  // Remove a user grant
  const removeUserGrant = async (grantId: string) => {
    setSaving(grantId);
    setError(null);

    try {
      await fetch('/api/settings/permissions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: grantId }),
      });
      await fetchGrants();
    } catch {
      setError('Failed to remove permission');
    } finally {
      setSaving(null);
    }
  };

  // Filter out admin users and already-granted users from picker
  const getAvailableUsers = (featureKey: AdminFeatureKey) => {
    const grantedUserIds = new Set(getUserGrants(featureKey).map(g => g.granted_user_id));
    return profiles.filter(p => {
      const role = (p.user_role || p.role || 'member') as string;
      // Don't show admins (they already have access)
      if (role === 'admin') return false;
      if (p.agency_role === 'agency_owner') return false;
      // Don't show already-granted users
      if (grantedUserIds.has(p.id)) return false;
      return true;
    });
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto animate-pulse space-y-4">
        <div className="h-8 bg-cream-dark/30 dark:bg-slate-700/30 rounded w-1/3" />
        <div className="h-64 bg-cream-dark/30 dark:bg-slate-700/30 rounded" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <p className="text-sm text-navy/60 dark:text-slate-400 font-body">
          Delegate access to admin-only features without granting full admin privileges.
          Admin and Agency Owner roles always have full access.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Role-based grants matrix */}
      <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 overflow-hidden mb-8">
        <div className="p-5 border-b border-cream-dark dark:border-slate-700">
          <h2 className="text-navy dark:text-slate-100 font-heading font-semibold text-base">
            Role-based Access
          </h2>
          <p className="text-navy/50 dark:text-slate-400 text-sm mt-1">
            Grant entire roles access to features. All users with that role will gain access.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cream-dark dark:border-slate-700">
                <th className="text-left py-3 px-4 font-medium text-navy/60 dark:text-slate-400 w-48">
                  Feature
                </th>
                {DELEGATABLE_ROLES.map(role => (
                  <th key={role} className="py-3 px-3 font-medium text-navy/60 dark:text-slate-400 text-center whitespace-nowrap">
                    {getRoleLabel(role)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ADMIN_FEATURES.map(featureKey => (
                <tr key={featureKey} className="border-b border-cream-dark/50 dark:border-slate-700/50 last:border-b-0">
                  <td className="py-3 px-4">
                    <div className="font-medium text-navy dark:text-slate-200">
                      {FEATURE_LABELS[featureKey]}
                    </div>
                    <div className="text-xs text-navy/40 dark:text-slate-500 mt-0.5">
                      {FEATURE_DESCRIPTIONS[featureKey]}
                    </div>
                  </td>
                  {DELEGATABLE_ROLES.map(role => {
                    const grantId = hasRoleGrant(featureKey, role);
                    const isSaving = saving === `${featureKey}-${role}`;
                    return (
                      <td key={role} className="py-3 px-3 text-center">
                        <button
                          onClick={() => toggleRoleGrant(featureKey, role)}
                          disabled={!!saving}
                          className={`w-6 h-6 rounded border-2 inline-flex items-center justify-center transition-all ${
                            grantId
                              ? 'bg-electric border-electric text-white'
                              : 'border-cream-dark dark:border-slate-600 hover:border-electric/50'
                          } ${isSaving ? 'opacity-50' : ''}`}
                        >
                          {grantId && (
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Individual user grants */}
      <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 overflow-hidden">
        <div className="p-5 border-b border-cream-dark dark:border-slate-700">
          <h2 className="text-navy dark:text-slate-100 font-heading font-semibold text-base">
            Individual User Access
          </h2>
          <p className="text-navy/50 dark:text-slate-400 text-sm mt-1">
            Grant specific users access to features regardless of their role.
          </p>
        </div>

        <div className="divide-y divide-cream-dark/50 dark:divide-slate-700/50">
          {ADMIN_FEATURES.map(featureKey => {
            const userGrants = getUserGrants(featureKey);
            const availableUsers = getAvailableUsers(featureKey);

            return (
              <div key={featureKey} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-medium text-navy dark:text-slate-200 text-sm">
                      {FEATURE_LABELS[featureKey]}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setUserPickerFeature(userPickerFeature === featureKey ? null : featureKey);
                      setSelectedUserId('');
                    }}
                    className="text-xs text-electric hover:text-electric/80 font-medium"
                  >
                    + Add User
                  </button>
                </div>

                {/* Existing user grants */}
                {userGrants.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {userGrants.map(grant => {
                      const profile = profiles.find(p => p.id === grant.granted_user_id);
                      const name = profile?.display_name
                        || grant.granted_user_profile?.display_name
                        || 'Unknown User';
                      return (
                        <span
                          key={grant.id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-electric/10 text-electric rounded-full text-xs font-medium"
                        >
                          {name}
                          <button
                            onClick={() => removeUserGrant(grant.id)}
                            disabled={saving === grant.id}
                            className="hover:text-red-500 transition-colors"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}

                {userGrants.length === 0 && userPickerFeature !== featureKey && (
                  <p className="text-xs text-navy/30 dark:text-slate-500">No individual users granted</p>
                )}

                {/* User picker */}
                {userPickerFeature === featureKey && (
                  <div className="flex items-center gap-2 mt-2">
                    <select
                      value={selectedUserId}
                      onChange={e => setSelectedUserId(e.target.value)}
                      className="flex-1 text-sm border border-cream-dark dark:border-slate-600 rounded-lg px-3 py-1.5 bg-white dark:bg-dark-bg text-navy dark:text-slate-200"
                    >
                      <option value="">Select a user...</option>
                      {availableUsers.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.display_name} ({p.user_role || p.role || 'member'})
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => addUserGrant(featureKey)}
                      disabled={!selectedUserId || saving === `user-${featureKey}`}
                      className="px-3 py-1.5 bg-electric text-white text-sm rounded-lg hover:bg-electric/90 disabled:opacity-50 transition-colors"
                    >
                      Grant
                    </button>
                    <button
                      onClick={() => {
                        setUserPickerFeature(null);
                        setSelectedUserId('');
                      }}
                      className="px-3 py-1.5 text-navy/50 dark:text-slate-400 text-sm hover:text-navy dark:hover:text-slate-200 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
