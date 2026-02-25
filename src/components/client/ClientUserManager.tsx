'use client';

import { useState, useEffect, useCallback } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

interface ClientUser {
  id: string;
  display_name: string;
  email: string | null;
  user_role: string;
  account_status: string;
  created_at: string;
}

interface ClientUserManagerProps {
  clientId: string;
}

export default function ClientUserManager({ clientId }: ClientUserManagerProps) {
  const [users, setUsers] = useState<ClientUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ displayName: '', email: '', password: '' });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [resetModal, setResetModal] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  const fetchUsers = useCallback(async () => {
    const res = await fetch(`/api/admin/client-users?clientId=${clientId}`);
    if (res.ok) {
      const json = await res.json();
      setUsers(json.data || []);
    }
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCreating(true);

    const res = await fetch('/api/admin/client-users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId,
        email: formData.email,
        password: formData.password,
        displayName: formData.displayName,
      }),
    });

    if (res.ok) {
      setShowForm(false);
      setFormData({ displayName: '', email: '', password: '' });
      fetchUsers();
    } else {
      const json = await res.json();
      setError(json.error || 'Failed to create user');
    }
    setCreating(false);
  };

  const handleDelete = async (userId: string) => {
    if (!confirm('Delete this client login? This cannot be undone.')) return;

    await fetch(`/api/admin/client-users/${userId}`, { method: 'DELETE' });
    fetchUsers();
  };

  const handleResetPassword = async () => {
    if (!resetModal || !newPassword) return;
    setResetting(true);

    const res = await fetch(`/api/admin/client-users/${resetModal}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword }),
    });

    if (res.ok) {
      setResetModal(null);
      setNewPassword('');
    }
    setResetting(false);
  };

  return (
    <div className="bg-surface-raised rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-heading font-semibold text-white">Client Logins</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-sm text-electric hover:text-electric-bright transition-colors"
        >
          {showForm ? 'Cancel' : '+ Create Login'}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="space-y-3 mb-4 p-4 bg-white/5 rounded-lg">
          <Input
            label="Display Name"
            value={formData.displayName}
            onChange={(e) => setFormData((p) => ({ ...p, displayName: e.target.value }))}
            placeholder="Client user name"
            required
          />
          <Input
            label="Email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
            placeholder="client@company.com"
            required
          />
          <Input
            label="Password"
            type="password"
            value={formData.password}
            onChange={(e) => setFormData((p) => ({ ...p, password: e.target.value }))}
            placeholder="Min 6 characters"
            required
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" loading={creating}>
            Create Login
          </Button>
        </form>
      )}

      {/* User list */}
      {loading ? (
        <p className="text-sm text-muted">Loading...</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-muted">No client logins created yet.</p>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between p-3 bg-white/5 rounded-lg"
            >
              <div>
                <p className="text-sm font-medium text-white">{u.display_name}</p>
                <p className="text-xs text-muted">{u.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setResetModal(u.id);
                    setNewPassword('');
                  }}
                  className="text-xs text-muted hover:text-white transition-colors"
                >
                  Reset Password
                </button>
                <button
                  onClick={() => handleDelete(u.id)}
                  className="text-xs text-danger/60 hover:text-danger transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reset password modal */}
      {resetModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-sm font-semibold text-white mb-4">Reset Password</h3>
            <Input
              label="New Password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min 6 characters"
            />
            <div className="flex gap-2 mt-4">
              <Button onClick={handleResetPassword} loading={resetting}>
                Reset
              </Button>
              <button
                onClick={() => setResetModal(null)}
                className="px-4 py-2 text-sm text-muted hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
