'use client';

import { useState, useEffect, useCallback } from 'react';
import { BoardMember, ColumnMoveRule, Profile, UserRole, List } from '@/lib/types';
import {
  ALL_ROLES,
  getRoleLabel,
  getRoleDescription,
  canManageMembers,
} from '@/lib/permissions';
import { createClient } from '@/lib/supabase/client';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';

interface BoardPermissionsProps {
  boardId: string;
  currentUserRole: UserRole;
}

interface Toast {
  type: 'success' | 'error';
  message: string;
}

const ROLE_BADGE_COLORS: Record<UserRole, string> = {
  admin: 'bg-electric/10 text-electric border-electric/20',
  department_lead: 'bg-purple-50 text-purple-700 border-purple-200',
  member: 'bg-green-50 text-green-700 border-green-200',
  guest: 'bg-amber-50 text-amber-700 border-amber-200',
  client: 'bg-sky-50 text-sky-700 border-sky-200',
  observer: 'bg-gray-50 text-gray-600 border-gray-200',
};

export default function BoardPermissions({ boardId, currentUserRole }: BoardPermissionsProps) {
  const supabase = createClient();
  const canManage = canManageMembers(currentUserRole);

  // State
  const [members, setMembers] = useState<BoardMember[]>([]);
  const [moveRules, setMoveRules] = useState<ColumnMoveRule[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);

  // Add member state
  const [showAddMember, setShowAddMember] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [selectedRole, setSelectedRole] = useState<UserRole>('member');
  const [addingMember, setAddingMember] = useState(false);

  // Move rule state
  const [showAddRule, setShowAddRule] = useState(false);
  const [ruleFromList, setRuleFromList] = useState('');
  const [ruleToList, setRuleToList] = useState('');
  const [ruleAllowedRoles, setRuleAllowedRoles] = useState<UserRole[]>([]);
  const [addingRule, setAddingRule] = useState(false);

  // Saving states
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [membersRes, rulesRes, listsRes] = await Promise.all([
        fetch(`/api/boards/${boardId}/members`),
        fetch(`/api/boards/${boardId}/move-rules`),
        supabase
          .from('lists')
          .select('*')
          .eq('board_id', boardId)
          .order('position', { ascending: true }),
      ]);

      if (membersRes.ok) {
        const membersData = await membersRes.json();
        setMembers(membersData.data || []);
      }

      if (rulesRes.ok) {
        const rulesData = await rulesRes.json();
        setMoveRules(rulesData.data || []);
      }

      if (listsRes.data) {
        setLists(listsRes.data);
      }
    } catch {
      showToast('error', 'Failed to load board permissions data.');
    } finally {
      setLoading(false);
    }
  }, [boardId, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Search users for adding
  const searchUsers = async (query: string) => {
    setUserSearchQuery(query);
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    setSearchLoading(true);
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .ilike('display_name', `%${query}%`)
        .limit(10);

      // Filter out users already members of this board
      const memberUserIds = new Set(members.map((m) => m.user_id));
      setSearchResults((data || []).filter((p) => !memberUserIds.has(p.id)));
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  // Add member
  const handleAddMember = async () => {
    if (!selectedUser) return;

    setAddingMember(true);
    try {
      const response = await fetch(`/api/boards/${boardId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: selectedUser.id, role: selectedRole }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to add member');
      }

      showToast('success', `${selectedUser.display_name} added as ${getRoleLabel(selectedRole)}.`);
      setShowAddMember(false);
      setSelectedUser(null);
      setUserSearchQuery('');
      setSearchResults([]);
      setSelectedRole('member');
      await fetchData();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to add member.');
    } finally {
      setAddingMember(false);
    }
  };

  // Change member role
  const handleChangeMemberRole = async (memberId: string, newRole: UserRole) => {
    setSavingMemberId(memberId);
    try {
      const response = await fetch(`/api/boards/${boardId}/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to update role');
      }

      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m))
      );
      showToast('success', 'Member role updated.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to update role.');
    } finally {
      setSavingMemberId(null);
    }
  };

  // Remove member
  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!confirm(`Remove ${memberName} from this board?`)) return;

    setRemovingMemberId(memberId);
    try {
      const response = await fetch(`/api/boards/${boardId}/members/${memberId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to remove member');
      }

      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      showToast('success', `${memberName} removed from board.`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to remove member.');
    } finally {
      setRemovingMemberId(null);
    }
  };

  // Add move rule
  const handleAddRule = async () => {
    if (!ruleFromList || !ruleToList || ruleAllowedRoles.length === 0) return;

    setAddingRule(true);
    try {
      const response = await fetch(`/api/boards/${boardId}/move-rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_list_id: ruleFromList,
          to_list_id: ruleToList,
          allowed_roles: ruleAllowedRoles,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to create rule');
      }

      showToast('success', 'Column move rule added.');
      setShowAddRule(false);
      setRuleFromList('');
      setRuleToList('');
      setRuleAllowedRoles([]);
      await fetchData();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to create rule.');
    } finally {
      setAddingRule(false);
    }
  };

  // Toggle role in allowed roles
  const toggleRuleRole = (role: UserRole) => {
    setRuleAllowedRoles((prev) =>
      prev.includes(role)
        ? prev.filter((r) => r !== role)
        : [...prev, role]
    );
  };

  // Delete move rule
  const handleDeleteRule = async (ruleId: string) => {
    try {
      const { error } = await supabase
        .from('column_move_rules')
        .delete()
        .eq('id', ruleId);

      if (error) throw error;

      setMoveRules((prev) => prev.filter((r) => r.id !== ruleId));
      showToast('success', 'Move rule removed.');
    } catch {
      showToast('error', 'Failed to remove move rule.');
    }
  };

  const getListName = (listId: string) => {
    return lists.find((l) => l.id === listId)?.name || 'Unknown';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-3 text-navy/40 dark:text-slate-500 font-body text-sm">
          <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Loading permissions...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Toast */}
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

      {/* ========== SECTION: Board Members ========== */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-base">Board Members</h3>
            <p className="text-navy/50 dark:text-slate-400 font-body text-sm mt-0.5">
              {members.length} member{members.length !== 1 ? 's' : ''} on this board
            </p>
          </div>
          {canManage && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowAddMember(true)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <line x1="19" y1="8" x2="19" y2="14" />
                <line x1="22" y1="11" x2="16" y2="11" />
              </svg>
              Add Member
            </Button>
          )}
        </div>

        <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 overflow-hidden">
          {members.length === 0 ? (
            <div className="px-6 py-12 text-center text-navy/40 dark:text-slate-500 font-body text-sm">
              No members have been added to this board yet.
            </div>
          ) : (
            <div className="divide-y divide-cream-dark dark:divide-slate-700">
              {members.map((member) => {
                const profile = member.profile;
                const displayName = profile?.display_name || 'Unknown User';
                const isSaving = savingMemberId === member.id;
                const isRemoving = removingMemberId === member.id;

                return (
                  <div
                    key={member.id}
                    className="flex items-center gap-4 px-6 py-4 hover:bg-cream/30 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    <Avatar
                      name={displayName}
                      src={profile?.avatar_url}
                      size="md"
                    />

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-navy dark:text-slate-100 font-body truncate">
                        {displayName}
                      </p>
                      {profile?.role && (
                        <p className="text-xs text-navy/40 dark:text-slate-500 font-body">{profile.role}</p>
                      )}
                    </div>

                    {canManage ? (
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <select
                            value={member.role}
                            disabled={isSaving}
                            onChange={(e) =>
                              handleChangeMemberRole(member.id, e.target.value as UserRole)
                            }
                            className="appearance-none px-3 py-1.5 pr-8 rounded-lg bg-white dark:bg-dark-surface border-2 border-navy/10 dark:border-slate-700 text-sm font-body text-navy dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-all duration-200 cursor-pointer hover:border-navy/20"
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

                        {isSaving ? (
                          <div className="w-8 h-8 flex items-center justify-center">
                            <svg className="animate-spin h-4 w-4 text-electric" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleRemoveMember(member.id, displayName)}
                            disabled={isRemoving}
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-navy/30 dark:text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50"
                            title="Remove member"
                          >
                            {isRemoving ? (
                              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            )}
                          </button>
                        )}
                      </div>
                    ) : (
                      <span
                        className={`
                          inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium border
                          ${ROLE_BADGE_COLORS[member.role]}
                        `}
                      >
                        {getRoleLabel(member.role)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ========== Add Member Modal ========== */}
      <Modal
        isOpen={showAddMember}
        onClose={() => {
          setShowAddMember(false);
          setSelectedUser(null);
          setUserSearchQuery('');
          setSearchResults([]);
          setSelectedRole('member');
        }}
        size="md"
      >
        <div className="p-6">
          <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-lg mb-4">
            Add Board Member
          </h3>

          {/* User Search */}
          <div className="mb-4">
            <Input
              label="Search Users"
              placeholder="Type a name to search..."
              value={userSearchQuery}
              onChange={(e) => searchUsers(e.target.value)}
            />
          </div>

          {/* Search Results */}
          {searchLoading && (
            <p className="text-sm text-navy/40 dark:text-slate-500 font-body mb-4">Searching...</p>
          )}
          {!searchLoading && searchResults.length > 0 && !selectedUser && (
            <div className="mb-4 max-h-48 overflow-y-auto border-2 border-cream-dark dark:border-slate-700 rounded-xl divide-y divide-cream-dark dark:divide-slate-700 dark:divide-slate-700">
              {searchResults.map((user) => (
                <button
                  key={user.id}
                  onClick={() => {
                    setSelectedUser(user);
                    setUserSearchQuery(user.display_name);
                    setSearchResults([]);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-cream/50 dark:hover:bg-slate-800/50 transition-colors text-left"
                >
                  <Avatar name={user.display_name} src={user.avatar_url} size="sm" />
                  <div>
                    <p className="text-sm font-medium text-navy dark:text-slate-100 font-body">{user.display_name}</p>
                    <p className="text-xs text-navy/40 dark:text-slate-500 font-body">{user.role}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
          {!searchLoading && userSearchQuery.trim().length >= 2 && searchResults.length === 0 && !selectedUser && (
            <p className="text-sm text-navy/40 dark:text-slate-500 font-body mb-4">No users found matching your search.</p>
          )}

          {/* Selected User */}
          {selectedUser && (
            <div className="mb-4 flex items-center gap-3 p-3 bg-electric/5 border border-electric/20 rounded-xl">
              <Avatar name={selectedUser.display_name} src={selectedUser.avatar_url} size="md" />
              <div className="flex-1">
                <p className="text-sm font-medium text-navy dark:text-slate-100 font-body">{selectedUser.display_name}</p>
                <p className="text-xs text-navy/40 dark:text-slate-500 font-body">{selectedUser.role}</p>
              </div>
              <button
                onClick={() => {
                  setSelectedUser(null);
                  setUserSearchQuery('');
                }}
                className="text-navy/30 dark:text-slate-500 hover:text-navy dark:hover:text-slate-200 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          )}

          {/* Role Selector */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-navy dark:text-slate-100 mb-1.5 font-body">
              Board Role
            </label>
            <div className="relative">
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as UserRole)}
                className="appearance-none w-full px-3.5 py-2.5 pr-10 rounded-xl bg-white dark:bg-dark-surface border-2 border-navy/20 dark:border-slate-700 text-navy dark:text-slate-100 text-sm font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-all duration-200"
              >
                {ALL_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {getRoleLabel(role)} -- {getRoleDescription(role)}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-navy/30">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <Button
              variant="ghost"
              size="md"
              onClick={() => {
                setShowAddMember(false);
                setSelectedUser(null);
                setUserSearchQuery('');
                setSearchResults([]);
                setSelectedRole('member');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              loading={addingMember}
              disabled={!selectedUser}
              onClick={handleAddMember}
            >
              Add Member
            </Button>
          </div>
        </div>
      </Modal>

      {/* ========== SECTION: Column Move Rules ========== */}
      {canManage && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-base">Column Move Rules</h3>
              <p className="text-navy/50 dark:text-slate-400 font-body text-sm mt-0.5">
                Define which roles can move cards between specific columns. If no rule exists for a transition, all roles with basic move permissions can move cards.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowAddRule(true)}
              disabled={lists.length < 2}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add Rule
            </Button>
          </div>

          <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 overflow-hidden">
            {moveRules.length === 0 ? (
              <div className="px-6 py-12 text-center text-navy/40 dark:text-slate-500 font-body text-sm">
                No column move rules defined. All users with move permissions can move cards between any columns.
              </div>
            ) : (
              <div className="divide-y divide-cream-dark dark:divide-slate-700">
                {moveRules.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex items-center gap-4 px-6 py-4 hover:bg-cream/30 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm font-body">
                        <span className="font-medium text-navy dark:text-slate-100 px-2 py-0.5 bg-cream dark:bg-slate-800 rounded-lg">
                          {getListName(rule.from_list_id)}
                        </span>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-navy/30 shrink-0">
                          <line x1="5" y1="12" x2="19" y2="12" />
                          <polyline points="12 5 19 12 12 19" />
                        </svg>
                        <span className="font-medium text-navy dark:text-slate-100 px-2 py-0.5 bg-cream dark:bg-slate-800 rounded-lg">
                          {getListName(rule.to_list_id)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        {rule.allowed_roles.map((role) => (
                          <span
                            key={role}
                            className={`
                              inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border
                              ${ROLE_BADGE_COLORS[role]}
                            `}
                          >
                            {getRoleLabel(role)}
                          </span>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-navy/30 dark:text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors shrink-0"
                      title="Remove rule"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ========== Add Rule Modal ========== */}
      <Modal
        isOpen={showAddRule}
        onClose={() => {
          setShowAddRule(false);
          setRuleFromList('');
          setRuleToList('');
          setRuleAllowedRoles([]);
        }}
        size="md"
      >
        <div className="p-6">
          <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-lg mb-4">
            Add Column Move Rule
          </h3>

          <p className="text-navy/50 dark:text-slate-400 font-body text-sm mb-6">
            Restrict which roles can move cards from one column to another. Only the selected roles will be able to perform this move.
          </p>

          {/* From Column */}
          <div className="mb-4">
            <label className="block text-sm font-semibold text-navy dark:text-slate-100 mb-1.5 font-body">
              From Column
            </label>
            <div className="relative">
              <select
                value={ruleFromList}
                onChange={(e) => setRuleFromList(e.target.value)}
                className="appearance-none w-full px-3.5 py-2.5 pr-10 rounded-xl bg-white dark:bg-dark-surface border-2 border-navy/20 dark:border-slate-700 text-navy dark:text-slate-100 text-sm font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-all duration-200"
              >
                <option value="">Select a column...</option>
                {lists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-navy/30">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>
          </div>

          {/* To Column */}
          <div className="mb-4">
            <label className="block text-sm font-semibold text-navy dark:text-slate-100 mb-1.5 font-body">
              To Column
            </label>
            <div className="relative">
              <select
                value={ruleToList}
                onChange={(e) => setRuleToList(e.target.value)}
                className="appearance-none w-full px-3.5 py-2.5 pr-10 rounded-xl bg-white dark:bg-dark-surface border-2 border-navy/20 dark:border-slate-700 text-navy dark:text-slate-100 text-sm font-body focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-all duration-200"
              >
                <option value="">Select a column...</option>
                {lists
                  .filter((l) => l.id !== ruleFromList)
                  .map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.name}
                    </option>
                  ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-navy/30">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>
          </div>

          {/* Allowed Roles */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-navy dark:text-slate-100 mb-2 font-body">
              Allowed Roles
            </label>
            <div className="grid grid-cols-2 gap-2">
              {ALL_ROLES.map((role) => (
                <label
                  key={role}
                  className={`
                    flex items-center gap-2.5 px-3 py-2 rounded-xl border-2 cursor-pointer transition-all duration-200
                    ${ruleAllowedRoles.includes(role)
                      ? 'border-electric bg-electric/5'
                      : 'border-cream-dark dark:border-slate-700 hover:border-navy/20 dark:hover:border-slate-600'
                    }
                  `}
                >
                  <input
                    type="checkbox"
                    checked={ruleAllowedRoles.includes(role)}
                    onChange={() => toggleRuleRole(role)}
                    className="w-4 h-4 rounded border-navy/20 dark:border-slate-600 text-electric focus:ring-electric/30"
                  />
                  <div>
                    <p className="text-sm font-medium text-navy dark:text-slate-100 font-body">
                      {getRoleLabel(role)}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <Button
              variant="ghost"
              size="md"
              onClick={() => {
                setShowAddRule(false);
                setRuleFromList('');
                setRuleToList('');
                setRuleAllowedRoles([]);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              loading={addingRule}
              disabled={!ruleFromList || !ruleToList || ruleAllowedRoles.length === 0}
              onClick={handleAddRule}
            >
              Add Rule
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
