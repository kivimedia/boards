'use client';

import { useState, useEffect } from 'react';
import { CredentialDecrypted } from '@/lib/types';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';

interface CredentialListItem {
  id: string;
  platform: string;
  category: string;
  created_at: string;
  updated_at: string;
}

interface AuditEntry {
  id: string;
  credential_id: string;
  user_id: string;
  action: string;
  ip_address: string | null;
  created_at: string;
  profiles?: { id: string; display_name: string; avatar_url: string | null };
}

interface CredentialsVaultProps {
  clientId: string;
}

export default function CredentialsVault({ clientId }: CredentialsVaultProps) {
  const [credentials, setCredentials] = useState<CredentialListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [creating, setCreating] = useState(false);
  const [viewingCred, setViewingCred] = useState<CredentialDecrypted | null>(null);
  const [loadingCred, setLoadingCred] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [showAudit, setShowAudit] = useState(false);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [formData, setFormData] = useState({
    platform: '',
    username: '',
    password: '',
    notes: '',
    category: 'general',
  });

  const fetchCredentials = async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/credentials`);
      const json = await res.json();
      if (json.data) setCredentials(json.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCredentials();
  }, [clientId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.platform.trim()) return;

    setCreating(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: formData.platform.trim(),
          username: formData.username.trim() || undefined,
          password: formData.password || undefined,
          notes: formData.notes.trim() || undefined,
          category: formData.category || 'general',
        }),
      });
      if (res.ok) {
        setShowAdd(false);
        setFormData({ platform: '', username: '', password: '', notes: '', category: 'general' });
        fetchCredentials();
      }
    } finally {
      setCreating(false);
    }
  };

  const handleView = async (credId: string) => {
    setLoadingCred(true);
    setShowPassword(false);
    try {
      const res = await fetch(`/api/clients/${clientId}/credentials/${credId}`);
      const json = await res.json();
      if (json.data) setViewingCred(json.data);
    } finally {
      setLoadingCred(false);
    }
  };

  const handleViewAudit = async (credId: string) => {
    setLoadingAudit(true);
    setShowAudit(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/credentials/${credId}/audit`);
      const json = await res.json();
      if (json.data) setAuditLog(json.data);
    } finally {
      setLoadingAudit(false);
    }
  };

  const handleDelete = async (credId: string) => {
    if (!confirm('Delete this credential? This cannot be undone.')) return;
    await fetch(`/api/clients/${clientId}/credentials/${credId}`, { method: 'DELETE' });
    setViewingCred(null);
    fetchCredentials();
  };

  return (
    <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-navy/50 dark:text-slate-400">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <h3 className="text-base font-heading font-semibold text-navy dark:text-slate-100">Credentials Vault</h3>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add
        </Button>
      </div>

      {/* Credentials List */}
      {loading ? (
        <p className="text-navy/40 dark:text-slate-500 font-body text-sm py-4">Loading credentials...</p>
      ) : credentials.length === 0 ? (
        <p className="text-navy/40 dark:text-slate-500 font-body text-sm py-4">No credentials stored yet.</p>
      ) : (
        <div className="space-y-2">
          {credentials.map((cred) => (
            <div
              key={cred.id}
              className="flex items-center justify-between bg-cream dark:bg-dark-bg rounded-xl px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-navy/5 dark:bg-slate-800 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-navy/40 dark:text-slate-500">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-navy dark:text-slate-100 font-body">{cred.platform}</p>
                  <p className="text-xs text-navy/40 dark:text-slate-500 font-body">{cred.category}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => handleView(cred.id)}>
                  View
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleViewAudit(cred.id)}>
                  Audit
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View Credential Modal */}
      <Modal isOpen={viewingCred !== null || loadingCred} onClose={() => { setViewingCred(null); setShowPassword(false); }}>
        <div className="p-6">
          <h2 className="text-lg font-heading font-semibold text-navy dark:text-slate-100 mb-4">Credential Details</h2>
          {loadingCred ? (
            <p className="text-navy/40 dark:text-slate-500 font-body text-sm">Decrypting...</p>
          ) : viewingCred ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wide mb-1 font-body">Platform</label>
                <p className="text-sm text-navy dark:text-slate-100 font-body">{viewingCred.platform}</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wide mb-1 font-body">Category</label>
                <p className="text-sm text-navy dark:text-slate-100 font-body">{viewingCred.category}</p>
              </div>
              {viewingCred.username && (
                <div>
                  <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wide mb-1 font-body">Username</label>
                  <p className="text-sm text-navy dark:text-slate-100 font-body bg-cream dark:bg-dark-bg rounded-lg px-3 py-2">{viewingCred.username}</p>
                </div>
              )}
              {viewingCred.password && (
                <div>
                  <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wide mb-1 font-body">Password</label>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-navy dark:text-slate-100 font-body bg-cream dark:bg-dark-bg rounded-lg px-3 py-2 flex-1 font-mono">
                      {showPassword ? viewingCred.password : '\u2022'.repeat(12)}
                    </p>
                    <button
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-navy/40 dark:text-slate-500 hover:text-navy dark:hover:text-slate-100 p-2 rounded-lg hover:bg-cream dark:hover:bg-slate-800 transition-colors"
                    >
                      {showPassword ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              )}
              {viewingCred.notes && (
                <div>
                  <label className="block text-xs font-semibold text-navy/50 dark:text-slate-400 uppercase tracking-wide mb-1 font-body">Notes</label>
                  <p className="text-sm text-navy dark:text-slate-100 font-body bg-cream dark:bg-dark-bg rounded-lg px-3 py-2 whitespace-pre-wrap">{viewingCred.notes}</p>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button size="sm" variant="danger" onClick={() => handleDelete(viewingCred.id)}>
                  Delete
                </Button>
                <Button size="sm" variant="secondary" onClick={() => { setViewingCred(null); setShowPassword(false); }}>
                  Close
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </Modal>

      {/* Add Credential Modal */}
      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)}>
        <form onSubmit={handleCreate} className="p-6">
          <h2 className="text-lg font-heading font-semibold text-navy dark:text-slate-100 mb-4">Add Credential</h2>
          <div className="space-y-4">
            <Input
              label="Platform"
              placeholder="e.g., Instagram, Facebook Ads"
              value={formData.platform}
              onChange={(e) => setFormData({ ...formData, platform: e.target.value })}
              required
            />
            <Input
              label="Username / Email"
              placeholder="Username or email"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            />
            <div className="w-full">
              <label className="block text-sm font-semibold text-navy dark:text-slate-100 mb-1.5 font-body">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-white dark:bg-dark-surface border-2 border-navy/20 dark:border-slate-700 text-navy dark:text-slate-100 placeholder:text-navy/40 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-all duration-200 font-body text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-navy/40 dark:text-slate-500 hover:text-navy dark:hover:text-slate-100"
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <div className="w-full">
              <label className="block text-sm font-semibold text-navy dark:text-slate-100 mb-1.5 font-body">Category</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-dark-surface border-2 border-navy/20 dark:border-slate-700 text-navy dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-all duration-200 font-body text-sm"
              >
                <option value="general">General</option>
                <option value="social_media">Social Media</option>
                <option value="advertising">Advertising</option>
                <option value="analytics">Analytics</option>
                <option value="hosting">Hosting</option>
                <option value="email">Email</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="w-full">
              <label className="block text-sm font-semibold text-navy dark:text-slate-100 mb-1.5 font-body">Notes</label>
              <textarea
                placeholder="Additional notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={2}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-dark-surface border-2 border-navy/20 dark:border-slate-700 text-navy dark:text-slate-100 placeholder:text-navy/40 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-electric/30 focus:border-electric transition-all duration-200 font-body text-sm resize-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button type="button" variant="secondary" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={creating} disabled={!formData.platform.trim()}>
              Add Credential
            </Button>
          </div>
        </form>
      </Modal>

      {/* Audit Log Modal */}
      <Modal isOpen={showAudit} onClose={() => { setShowAudit(false); setAuditLog([]); }} size="lg">
        <div className="p-6">
          <h2 className="text-lg font-heading font-semibold text-navy dark:text-slate-100 mb-4">Access Audit Log</h2>
          {loadingAudit ? (
            <p className="text-navy/40 dark:text-slate-500 font-body text-sm">Loading audit log...</p>
          ) : auditLog.length === 0 ? (
            <p className="text-navy/40 dark:text-slate-500 font-body text-sm">No audit entries found.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {auditLog.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between bg-cream dark:bg-dark-bg rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className={`
                      inline-block w-2 h-2 rounded-full
                      ${entry.action === 'created' ? 'bg-green-400' :
                        entry.action === 'updated' ? 'bg-blue-400' :
                        entry.action === 'deleted' ? 'bg-red-400' :
                        'bg-gray-400'}
                    `} />
                    <span className="text-sm text-navy dark:text-slate-100 font-body">
                      {entry.profiles?.display_name || 'Unknown user'}
                    </span>
                    <span className="text-xs text-navy/40 dark:text-slate-500 font-body">{entry.action}</span>
                  </div>
                  <span className="text-xs text-navy/40 dark:text-slate-500 font-body">
                    {new Date(entry.created_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end mt-4">
            <Button size="sm" variant="secondary" onClick={() => { setShowAudit(false); setAuditLog([]); }}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
