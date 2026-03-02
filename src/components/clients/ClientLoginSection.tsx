'use client';

import { useState, useEffect, useCallback } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

interface ClientLogin {
  id: string;
  display_name: string;
  email: string | null;
  user_role: string;
  account_status: string;
  created_at: string;
}

interface ClientLoginSectionProps {
  clientId: string;
}

export function ClientLoginSection({ clientId }: ClientLoginSectionProps) {
  const [logins, setLogins] = useState<ClientLogin[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [formData, setFormData] = useState({ displayName: '', email: '', password: '' });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  // Resend credentials state
  const [resending, setResending] = useState<string | null>(null);
  const [resendResult, setResendResult] = useState<{ userId: string; email: string; password: string; emailSent: boolean } | null>(null);

  const fetchLogins = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/client-users?clientId=${clientId}`);
      if (res.ok) {
        const json = await res.json();
        setLogins(json.data || []);
      }
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchLogins();
  }, [fetchLogins]);

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
      setShowCreate(false);
      setFormData({ displayName: '', email: '', password: '' });
      fetchLogins();
    } else {
      const json = await res.json();
      setError(json.error || 'Failed to create login');
    }
    setCreating(false);
  };

  const handleResend = async (userId: string) => {
    setResending(userId);
    setResendResult(null);

    try {
      const res = await fetch(`/api/admin/client-users/${userId}/resend-credentials`, {
        method: 'POST',
      });
      if (res.ok) {
        const json = await res.json();
        setResendResult({
          userId,
          email: json.data.email,
          password: json.data.temp_password,
          emailSent: json.data.email_sent,
        });
      } else {
        const json = await res.json();
        alert(json.error || 'Failed to resend credentials');
      }
    } catch {
      alert('Failed to resend credentials');
    } finally {
      setResending(null);
    }
  };

  const copyCredentials = (email: string, password: string) => {
    const text = `Email: ${email}\nPassword: ${password}\nLogin: https://kmboards.co/login`;
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="mb-3 border border-cream-dark dark:border-slate-700 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-body flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-electric">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          Client Logins
        </h3>
        <button
          type="button"
          onClick={() => setShowCreate(!showCreate)}
          className="text-xs text-electric hover:text-electric/80 font-body font-medium transition-colors"
        >
          {showCreate ? 'Cancel' : '+ Create Login'}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="space-y-2.5 mb-3 p-3 bg-cream/50 dark:bg-slate-800/30 rounded-lg border border-cream-dark dark:border-slate-700">
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
          {error && <p className="text-xs text-red-500">{error}</p>}
          <Button type="submit" size="sm" loading={creating}>
            Create Login
          </Button>
        </form>
      )}

      {/* Login list */}
      {loading ? (
        <p className="text-xs text-navy/40 dark:text-slate-500 font-body">Loading...</p>
      ) : logins.length === 0 ? (
        <p className="text-xs text-navy/40 dark:text-slate-500 font-body">No client logins yet. Create one to give the client access.</p>
      ) : (
        <div className="space-y-2">
          {logins.map((login) => (
            <div key={login.id}>
              <div className="flex items-center justify-between p-2.5 bg-cream/50 dark:bg-slate-800/30 rounded-lg border border-cream-dark dark:border-slate-700">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-navy dark:text-slate-200 font-body truncate">{login.display_name}</p>
                  <p className="text-xs text-navy/50 dark:text-slate-400 font-body truncate">{login.email}</p>
                </div>
                <div className="flex items-center gap-2 ml-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleResend(login.id)}
                    disabled={resending === login.id}
                    className="flex items-center gap-1 text-xs text-electric hover:text-electric/80 font-body font-medium transition-colors disabled:opacity-50"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" />
                    </svg>
                    {resending === login.id ? 'Sending...' : 'Resend'}
                  </button>
                </div>
              </div>

              {/* Credentials result */}
              {resendResult && resendResult.userId === login.id && (
                <div className="mt-1.5 p-2.5 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40 rounded-lg">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-green-800 dark:text-green-300 font-body mb-1">
                        {resendResult.emailSent ? 'Credentials sent via email' : 'New credentials (email sending failed - copy below)'}
                      </p>
                      <div className="font-mono text-xs text-green-700 dark:text-green-400 space-y-0.5">
                        <p>Email: {resendResult.email}</p>
                        <p>Password: {resendResult.password}</p>
                        <p>Login: https://kmboards.co/login</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyCredentials(resendResult.email, resendResult.password)}
                      className="shrink-0 p-1.5 rounded-md hover:bg-green-100 dark:hover:bg-green-800/30 text-green-600 dark:text-green-400 transition-colors"
                      title="Copy credentials"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
