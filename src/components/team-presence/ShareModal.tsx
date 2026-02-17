'use client';

import { useState, useEffect, useCallback } from 'react';
import Avatar from '@/components/ui/Avatar';
import type { Profile, UserRole } from '@/lib/types';

interface BoardMemberRow {
  id: string;
  board_id: string;
  user_id: string;
  role: string;
  created_at: string;
  profile: Profile | null;
}

interface ShareModalProps {
  boardId: string;
  boardName: string;
  onClose: () => void;
}

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'admin', label: 'Owner' },
  { value: 'department_lead', label: 'Lead' },
  { value: 'member', label: 'Editor' },
  { value: 'guest', label: 'Viewer' },
];

function getRoleLabel(role: string) {
  return ROLE_OPTIONS.find((o) => o.value === role)?.label || role;
}

function getRoleBadgeColor(role: string) {
  switch (role) {
    case 'admin': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
    case 'department_lead': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    case 'member': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    case 'guest': return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
    default: return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
  }
}

export default function ShareModal({ boardId, boardName, onClose }: ShareModalProps) {
  const [members, setMembers] = useState<BoardMemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('member');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [copied, setCopied] = useState(false);

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch(`/api/boards/${boardId}/members`);
      const json = await res.json();
      const data = json.data || json;
      if (Array.isArray(data)) setMembers(data);
    } catch {
      // silent
    }
    setLoading(false);
  }, [boardId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteError('');
    setInviteSuccess('');

    try {
      // First find user by email from profiles
      const searchRes = await fetch(`/api/profiles?email=${encodeURIComponent(inviteEmail.trim())}`);
      const searchJson = await searchRes.json();
      const profiles = searchJson.data || searchJson;

      if (!Array.isArray(profiles) || profiles.length === 0) {
        setInviteError('No user found with that email. They need to sign up first.');
        setInviting(false);
        return;
      }

      const targetUserId = profiles[0].id;

      const res = await fetch(`/api/boards/${boardId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: targetUserId, role: inviteRole }),
      });

      const json = await res.json();

      if (!res.ok) {
        setInviteError(json.error || json.message || 'Failed to add member');
      } else {
        setInviteSuccess(`${inviteEmail} added as ${getRoleLabel(inviteRole)}`);
        setInviteEmail('');
        fetchMembers();
      }
    } catch (err: any) {
      setInviteError(err.message || 'Failed to invite');
    }
    setInviting(false);
  };

  const handleRoleChange = async (memberId: string, newRole: string) => {
    try {
      await fetch(`/api/boards/${boardId}/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      fetchMembers();
    } catch {
      // silent
    }
  };

  const handleRemove = async (memberId: string) => {
    try {
      await fetch(`/api/boards/${boardId}/members/${memberId}`, {
        method: 'DELETE',
      });
      fetchMembers();
    } catch {
      // silent
    }
  };

  const copyShareLink = () => {
    const url = `${window.location.origin}/board/${boardId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md mx-4 bg-white dark:bg-dark-surface border border-cream-dark dark:border-slate-700 rounded-2xl shadow-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-cream-dark dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold font-headline text-navy dark:text-white">Share Board</h2>
              <p className="text-xs text-navy/40 dark:text-slate-500 font-body mt-0.5">{boardName}</p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-cream-dark dark:hover:bg-slate-800 text-navy/40 dark:text-slate-500 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Invite section */}
          <div className="mt-4 flex gap-2">
            <input
              type="email"
              placeholder="Add people by email..."
              value={inviteEmail}
              onChange={(e) => { setInviteEmail(e.target.value); setInviteError(''); setInviteSuccess(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleInvite(); }}
              className="flex-1 px-3 py-2 text-sm bg-cream dark:bg-dark-bg border border-cream-dark dark:border-slate-700 rounded-lg text-navy dark:text-white placeholder:text-navy/30 dark:placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-electric/30 font-body"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="px-2 py-2 text-xs bg-cream dark:bg-dark-bg border border-cream-dark dark:border-slate-700 rounded-lg text-navy dark:text-white font-body outline-none"
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <button
              onClick={handleInvite}
              disabled={inviting || !inviteEmail.trim()}
              className="px-4 py-2 bg-electric text-white text-xs font-medium rounded-lg hover:bg-electric/90 disabled:opacity-50 transition-colors font-body"
            >
              {inviting ? 'Adding...' : 'Invite'}
            </button>
          </div>
          {inviteError && <p className="text-xs text-red-500 mt-1.5 font-body">{inviteError}</p>}
          {inviteSuccess && <p className="text-xs text-green-600 dark:text-green-400 mt-1.5 font-body">{inviteSuccess}</p>}
        </div>

        {/* Member list */}
        <div className="flex-1 overflow-y-auto px-6 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <svg className="animate-spin h-5 w-5 text-electric" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          ) : members.length === 0 ? (
            <p className="text-sm text-navy/40 dark:text-slate-500 text-center py-6 font-body">
              No members yet. Invite someone above.
            </p>
          ) : (
            <div className="space-y-1">
              {members.map((member) => (
                <div key={member.id} className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-cream-dark/30 dark:hover:bg-slate-800/30 group">
                  <Avatar
                    name={member.profile?.display_name || 'User'}
                    src={member.profile?.avatar_url}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-navy dark:text-white truncate font-body">
                      {member.profile?.display_name || 'Unknown User'}
                    </p>
                    <p className="text-xs text-navy/40 dark:text-slate-500 truncate font-body">
                      {member.profile?.email || ''}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-body ${getRoleBadgeColor(member.role)}`}>
                    {getRoleLabel(member.role)}
                  </span>
                  {/* Role change / remove */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <select
                      value={member.role}
                      onChange={(e) => handleRoleChange(member.id, e.target.value)}
                      className="text-xs bg-transparent border border-cream-dark dark:border-slate-700 rounded px-1 py-0.5 text-navy/60 dark:text-slate-400 outline-none font-body"
                    >
                      {ROLE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleRemove(member.id)}
                      className="p-1 text-red-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                      title="Remove member"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer with copy link */}
        <div className="px-6 py-4 border-t border-cream-dark dark:border-slate-700">
          <button
            onClick={copyShareLink}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-navy/60 dark:text-slate-400 hover:text-navy dark:hover:text-white bg-cream dark:bg-dark-bg border border-cream-dark dark:border-slate-700 rounded-lg hover:border-electric/30 transition-all font-body"
          >
            {copied ? (
              <>
                <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                Copy board link
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
