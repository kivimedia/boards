'use client';

import { useState, useEffect, useCallback } from 'react';
import type { IPWhitelistEntry } from '@/lib/types';

export default function IPWhitelistManager() {
  const [entries, setEntries] = useState<IPWhitelistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCIDR, setNewCIDR] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [checkIP, setCheckIP] = useState('');
  const [checkResult, setCheckResult] = useState<{ ip: string; allowed: boolean } | null>(null);
  const [checking, setChecking] = useState(false);

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch('/api/enterprise/ip-whitelist');
      const json = await res.json();
      if (json.data) setEntries(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const handleAdd = async () => {
    if (!newCIDR.trim()) return;
    setSaving(true);

    try {
      const res = await fetch('/api/enterprise/ip-whitelist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cidr: newCIDR.trim(),
          description: newDescription.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (json.data) {
        setEntries((prev) => [json.data, ...prev]);
        setNewCIDR('');
        setNewDescription('');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (entry: IPWhitelistEntry) => {
    const res = await fetch(`/api/enterprise/ip-whitelist/${entry.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !entry.is_active }),
    });
    const json = await res.json();
    if (json.data) {
      setEntries((prev) =>
        prev.map((e) => (e.id === entry.id ? { ...e, is_active: json.data.is_active } : e))
      );
    }
  };

  const handleDelete = async (entryId: string) => {
    if (!confirm('Remove this IP whitelist entry?')) return;
    await fetch(`/api/enterprise/ip-whitelist/${entryId}`, { method: 'DELETE' });
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
  };

  const handleCheckIP = async () => {
    if (!checkIP.trim()) return;
    setChecking(true);
    setCheckResult(null);

    try {
      const res = await fetch('/api/enterprise/ip-whitelist/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip_address: checkIP.trim() }),
      });
      const json = await res.json();
      if (json.data) {
        setCheckResult({ ip: json.data.ip_address, allowed: json.data.allowed });
      }
    } finally {
      setChecking(false);
    }
  };

  if (loading) {
    return <div className="text-navy/50 dark:text-slate-400 font-body py-8 text-center">Loading IP whitelist...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-navy dark:text-slate-100 font-heading">IP Whitelist</h3>
        <p className="text-sm text-navy/50 dark:text-slate-400 font-body mt-1">
          Restrict access to specific IP addresses or CIDR ranges. If no entries exist, all IPs are allowed.
        </p>
      </div>

      {/* Add entry form */}
      <div className="bg-cream dark:bg-navy rounded-xl border border-cream-dark dark:border-slate-700 p-4 space-y-3">
        <h4 className="text-sm font-bold text-navy dark:text-slate-100 font-heading">Add IP Range</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-body text-navy/70 dark:text-slate-300 mb-1">CIDR / IP Address</label>
            <input
              type="text"
              value={newCIDR}
              onChange={(e) => setNewCIDR(e.target.value)}
              placeholder="e.g. 192.168.1.0/24 or 10.0.0.1"
              className="w-full px-3 py-2 border border-cream-dark dark:border-slate-700 rounded-lg text-sm font-body text-navy dark:text-slate-100 dark:bg-dark-surface dark:placeholder:text-slate-500"
            />
            <p className="text-xs text-navy/40 dark:text-slate-500 font-body mt-1">
              Use /32 for a single IP, /24 for a /24 subnet, etc.
            </p>
          </div>
          <div>
            <label className="block text-xs font-body text-navy/70 dark:text-slate-300 mb-1">Description</label>
            <input
              type="text"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="e.g. Office network"
              className="w-full px-3 py-2 border border-cream-dark dark:border-slate-700 rounded-lg text-sm font-body text-navy dark:text-slate-100 dark:bg-dark-surface dark:placeholder:text-slate-500"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleAdd}
              disabled={saving || !newCIDR.trim()}
              className="px-4 py-2 bg-electric text-white rounded-lg text-sm font-body hover:bg-electric/90 transition-colors disabled:opacity-50"
            >
              {saving ? 'Adding...' : 'Add Entry'}
            </button>
          </div>
        </div>
      </div>

      {/* IP checker */}
      <div className="bg-cream dark:bg-navy rounded-xl border border-cream-dark dark:border-slate-700 p-4 space-y-3">
        <h4 className="text-sm font-bold text-navy dark:text-slate-100 font-heading">Check IP Address</h4>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <input
              type="text"
              value={checkIP}
              onChange={(e) => setCheckIP(e.target.value)}
              placeholder="Enter an IP to check, e.g. 192.168.1.50"
              className="w-full px-3 py-2 border border-cream-dark dark:border-slate-700 rounded-lg text-sm font-body text-navy dark:text-slate-100 dark:bg-dark-surface dark:placeholder:text-slate-500"
            />
          </div>
          <button
            onClick={handleCheckIP}
            disabled={checking || !checkIP.trim()}
            className="px-4 py-2 bg-navy text-white rounded-lg text-sm font-body hover:bg-navy/90 transition-colors disabled:opacity-50"
          >
            {checking ? 'Checking...' : 'Check'}
          </button>
        </div>
        {checkResult && (
          <div
            className={`text-sm font-body px-3 py-2 rounded-lg ${
              checkResult.allowed
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            {checkResult.ip} is {checkResult.allowed ? 'ALLOWED' : 'BLOCKED'}
          </div>
        )}
      </div>

      {/* Entries list */}
      {entries.length === 0 ? (
        <div className="text-center py-8 text-navy/40 dark:text-slate-500 font-body">
          No IP whitelist entries. All IPs are currently allowed.
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="bg-white dark:bg-dark-surface rounded-xl border border-cream-dark dark:border-slate-700 p-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                <code className="text-sm font-mono text-navy dark:text-slate-100 bg-cream dark:bg-navy px-2 py-1 rounded">
                  {entry.cidr}
                </code>
                <span className="text-sm text-navy/60 dark:text-slate-400 font-body">
                  {entry.description || 'No description'}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleToggle(entry)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    entry.is_active ? 'bg-electric' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      entry.is_active ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <button
                  onClick={() => handleDelete(entry.id)}
                  className="text-xs text-red-500 hover:text-red-700 font-body transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
