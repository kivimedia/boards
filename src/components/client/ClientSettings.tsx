'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

interface ClientSettingsProps {
  clientId: string;
}

type SettingsTab = 'account' | 'team' | 'api-keys';

export default function ClientSettings({ clientId }: ClientSettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('account');
  const router = useRouter();

  const tabs: { key: SettingsTab; label: string }[] = [
    { key: 'account', label: 'Account' },
    { key: 'team', label: 'Team Members' },
    { key: 'api-keys', label: 'API Keys' },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-heading font-semibold text-white">Settings</h1>
          <button
            onClick={() => router.push('/client-board')}
            className="text-sm text-muted hover:text-white transition-colors"
          >
            Back to Board
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white/5 rounded-lg p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === tab.key
                  ? 'bg-electric text-white'
                  : 'text-muted hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'account' && <AccountSection />}
        {activeTab === 'team' && <TeamSection clientId={clientId} />}
        {activeTab === 'api-keys' && <ApiKeysSection clientId={clientId} />}
      </div>
    </div>
  );
}

// ============================================================================
// Account Section - Change email & password
// ============================================================================

function AccountSection() {
  const { user } = useAuth();
  const supabase = createClient();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match' });
      return;
    }

    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setMessage({ type: 'success', text: 'Password updated successfully' });
      setNewPassword('');
      setConfirmPassword('');
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <div className="bg-surface-raised rounded-xl p-5">
        <h3 className="text-sm font-medium text-white mb-1">Email</h3>
        <p className="text-sm text-muted">{user?.email || 'Not set'}</p>
      </div>

      <form onSubmit={handlePasswordChange} className="bg-surface-raised rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-medium text-white">Change Password</h3>
        <Input
          label="New Password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="At least 6 characters"
        />
        <Input
          label="Confirm Password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirm new password"
        />
        {message && (
          <p className={`text-sm ${message.type === 'error' ? 'text-danger' : 'text-green-400'}`}>
            {message.text}
          </p>
        )}
        <Button type="submit" loading={saving}>
          Update Password
        </Button>
      </form>
    </div>
  );
}

// ============================================================================
// Team Members Section - Manage contacts (name, phone, email, role)
// ============================================================================

interface Contact {
  name: string;
  email: string;
  phone?: string;
  role?: string;
}

function TeamSection({ clientId }: { clientId: string }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  const fetchContacts = useCallback(async () => {
    const { data } = await supabase
      .from('clients')
      .select('contacts')
      .eq('id', clientId)
      .single();
    setContacts(data?.contacts || []);
    setLoading(false);
  }, [clientId, supabase]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const handleSave = async () => {
    setSaving(true);
    await supabase
      .from('clients')
      .update({ contacts })
      .eq('id', clientId);
    setSaving(false);
  };

  const updateContact = (index: number, field: keyof Contact, value: string) => {
    setContacts((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const addContact = () => {
    setContacts((prev) => [...prev, { name: '', email: '', phone: '', role: '' }]);
  };

  const removeContact = (index: number) => {
    setContacts((prev) => prev.filter((_, i) => i !== index));
  };

  if (loading) return <div className="text-muted text-sm">Loading...</div>;

  return (
    <div className="space-y-4">
      {contacts.map((contact, index) => (
        <div key={index} className="bg-surface-raised rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white">Member {index + 1}</span>
            <button
              onClick={() => removeContact(index)}
              className="text-danger/60 hover:text-danger text-sm transition-colors"
            >
              Remove
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Name"
              value={contact.name}
              onChange={(e) => updateContact(index, 'name', e.target.value)}
              placeholder="Full name"
            />
            <Input
              label="Role"
              value={contact.role || ''}
              onChange={(e) => updateContact(index, 'role', e.target.value)}
              placeholder="e.g. Marketing Lead"
            />
            <Input
              label="Email"
              type="email"
              value={contact.email}
              onChange={(e) => updateContact(index, 'email', e.target.value)}
              placeholder="email@company.com"
            />
            <Input
              label="Phone"
              value={contact.phone || ''}
              onChange={(e) => updateContact(index, 'phone', e.target.value)}
              placeholder="+1 555-0123"
            />
          </div>
        </div>
      ))}

      <div className="flex gap-3">
        <button
          onClick={addContact}
          className="px-4 py-2 border border-white/10 text-white/60 hover:text-white hover:border-white/20 rounded-lg text-sm transition-colors"
        >
          + Add Team Member
        </button>
        <Button onClick={handleSave} loading={saving}>
          Save Team
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// API Keys Section - Store client's own AI provider keys
// ============================================================================

const PROVIDERS = [
  { key: 'openai', label: 'OpenAI', placeholder: 'sk-...' },
  { key: 'anthropic', label: 'Anthropic', placeholder: 'sk-ant-...' },
  { key: 'gemini', label: 'Google Gemini', placeholder: 'AI...' },
] as const;

function ApiKeysSection({ clientId }: { clientId: string }) {
  const [keys, setKeys] = useState<Record<string, { id?: string; value: string }>>({
    openai: { value: '' },
    anthropic: { value: '' },
    gemini: { value: '' },
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function fetchKeys() {
      const { data } = await supabase
        .from('client_api_keys')
        .select('id, provider, api_key_encrypted')
        .eq('client_id', clientId);

      if (data) {
        const newKeys = { ...keys };
        for (const k of data) {
          newKeys[k.provider] = { id: k.id, value: '••••••••' };
        }
        setKeys(newKeys);
      }
      setLoading(false);
    }
    fetchKeys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const handleSave = async (provider: string) => {
    const current = keys[provider];
    if (!current.value || current.value === '••••••••') return;

    setSaving(provider);
    setMessage(null);

    const { error } = await supabase.from('client_api_keys').upsert(
      {
        client_id: clientId,
        provider,
        api_key_encrypted: current.value,
        ...(current.id ? { id: current.id } : {}),
      },
      { onConflict: 'client_id,provider' }
    );

    if (error) {
      setMessage(`Error saving ${provider} key`);
    } else {
      setMessage(`${provider} key saved`);
      setKeys((prev) => ({
        ...prev,
        [provider]: { ...prev[provider], value: '••••••••' },
      }));
    }
    setSaving(null);
  };

  const handleDelete = async (provider: string) => {
    const current = keys[provider];
    if (!current.id) return;

    await supabase.from('client_api_keys').delete().eq('id', current.id);
    setKeys((prev) => ({
      ...prev,
      [provider]: { value: '' },
    }));
    setMessage(`${provider} key removed`);
  };

  if (loading) return <div className="text-muted text-sm">Loading...</div>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Add your own API keys for AI-powered features. Keys are stored securely.
      </p>

      {PROVIDERS.map((provider) => {
        const current = keys[provider.key];
        return (
          <div key={provider.key} className="bg-surface-raised rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-white">{provider.label}</h3>
              {current.id && (
                <button
                  onClick={() => handleDelete(provider.key)}
                  className="text-xs text-danger/60 hover:text-danger transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                value={current.value}
                onChange={(e) =>
                  setKeys((prev) => ({
                    ...prev,
                    [provider.key]: { ...prev[provider.key], value: e.target.value },
                  }))
                }
                onFocus={() => {
                  if (current.value === '••••••••') {
                    setKeys((prev) => ({
                      ...prev,
                      [provider.key]: { ...prev[provider.key], value: '' },
                    }));
                  }
                }}
                placeholder={provider.placeholder}
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-muted focus:outline-none focus:border-electric transition-colors"
              />
              <Button
                onClick={() => handleSave(provider.key)}
                loading={saving === provider.key}
                className="shrink-0"
              >
                Save
              </Button>
            </div>
          </div>
        );
      })}

      {message && (
        <p className="text-sm text-green-400">{message}</p>
      )}
    </div>
  );
}
