'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ClientMeetingConfig, ClientWeeklyUpdate } from '@/lib/types';

export function useMeetingConfig(clientId: string | null) {
  const [config, setConfig] = useState<ClientMeetingConfig | null>(null);
  const [loading, setLoading] = useState(false);

  const fetch_ = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/meeting-config`);
      if (res.ok) {
        const data = await res.json();
        setConfig(data.data || null);
      }
    } catch {} finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const saveConfig = useCallback(async (updates: Partial<ClientMeetingConfig>) => {
    if (!clientId) return;
    const method = config ? 'PATCH' : 'POST';
    const res = await fetch(`/api/clients/${clientId}/meeting-config`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const data = await res.json();
      setConfig(data.data);
    }
    return res.ok;
  }, [clientId, config]);

  return { config, loading, refetch: fetch_, saveConfig };
}

export function useClientUpdates(clientId: string | null) {
  const [updates, setUpdates] = useState<ClientWeeklyUpdate[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch_ = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/weekly-updates?limit=20`);
      if (res.ok) {
        const data = await res.json();
        setUpdates(data.data || []);
      }
    } catch {} finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { fetch_(); }, [fetch_]);

  return { updates, loading, refetch: fetch_ };
}
