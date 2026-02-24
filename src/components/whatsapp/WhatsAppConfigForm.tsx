'use client';

import { useState, useEffect, useCallback } from 'react';
import type { WhatsAppConfig } from '@/lib/types';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

interface Props {
  onSave?: () => void;
}

export default function WhatsAppConfigForm({ onSave }: Props) {
  const [config, setConfig] = useState<WhatsAppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [webhookVerifyToken, setWebhookVerifyToken] = useState('');
  const [businessAccountId, setBusinessAccountId] = useState('');

  const fetchConfig = useCallback(async () => {
    try {
      const response = await fetch('/api/whatsapp/config');
      if (response.ok) {
        const data = await response.json();
        if (data.config) {
          setConfig(data.config);
          setPhoneNumberId(data.config.phone_number_id);
          setAccessToken(''); // Don't show token
          setWebhookVerifyToken(data.config.webhook_verify_token);
          setBusinessAccountId(data.config.business_account_id || '');
        }
      }
    } catch {
      // Config doesn't exist yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleSave = async () => {
    setSaving(true);
    setToast(null);

    try {
      const response = await fetch('/api/whatsapp/config', {
        method: config ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number_id: phoneNumberId,
          access_token: accessToken || undefined, // Only send if changed
          webhook_verify_token: webhookVerifyToken,
          business_account_id: businessAccountId || null,
        }),
      });

      if (response.ok) {
        setToast({ type: 'success', message: 'WhatsApp configuration saved' });
        fetchConfig();
        onSave?.();
      } else {
        const data = await response.json();
        setToast({ type: 'error', message: data.error || 'Failed to save' });
      }
    } catch {
      setToast({ type: 'error', message: 'Network error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="animate-pulse h-32 bg-gray-100 dark:bg-gray-800 rounded-lg" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          WhatsApp Business API
        </h3>
        <span className={`text-xs px-2 py-1 rounded-full ${
          config?.is_active
            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
        }`}>
          {config?.is_active ? 'Connected' : 'Not configured'}
        </span>
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400">
        Connect to Meta WhatsApp Business API to send and receive messages.
        Requires a Meta Business Account with a verified phone number.
      </p>

      {toast && (
        <div className={`p-3 rounded-lg text-sm ${
          toast.type === 'success'
            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
            : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
        }`}>
          {toast.message}
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Phone Number ID
          </label>
          <Input
            value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value)}
            placeholder="e.g., 123456789012345"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Found in Meta Business Suite under WhatsApp settings
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Access Token
          </label>
          <Input
            type="password"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder={config ? 'Leave blank to keep existing token' : 'System user access token'}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Long-lived system user token from Meta Business settings
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Webhook Verify Token
          </label>
          <Input
            value={webhookVerifyToken}
            onChange={(e) => setWebhookVerifyToken(e.target.value)}
            placeholder="Your custom verification token"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            A custom string you create - must match what you set in Meta webhook config
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Business Account ID (optional)
          </label>
          <Input
            value={businessAccountId}
            onChange={(e) => setBusinessAccountId(e.target.value)}
            placeholder="e.g., 987654321098765"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button
          onClick={handleSave}
          disabled={saving || !phoneNumberId || (!accessToken && !config) || !webhookVerifyToken}
        >
          {saving ? 'Saving...' : config ? 'Update Configuration' : 'Save Configuration'}
        </Button>

        {config && (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Webhook URL: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">
              {typeof window !== 'undefined' ? window.location.origin : ''}/api/whatsapp/webhook
            </code>
          </div>
        )}
      </div>
    </div>
  );
}
