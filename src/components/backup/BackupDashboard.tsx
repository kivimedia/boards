'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Backup } from '@/lib/types';
import { formatBytes } from '@/lib/backup-engine';
import RestoreWizard from './RestoreWizard';

export default function BackupDashboard() {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [restoreBackupId, setRestoreBackupId] = useState<string | null>(null);

  const fetchBackups = useCallback(async () => {
    try {
      const res = await fetch('/api/backups');
      const json = await res.json();
      if (json.data) {
        setBackups(json.data);
      }
    } catch {
      // silently fail, will retry
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBackups();
  }, [fetchBackups]);

  // Poll for running backups
  useEffect(() => {
    const hasRunning = backups.some((b) => b.status === 'running' || b.status === 'pending');
    if (!hasRunning) return;

    const interval = setInterval(fetchBackups, 3000);
    return () => clearInterval(interval);
  }, [backups, fetchBackups]);

  const handleCreateBackup = async () => {
    setCreating(true);
    setError('');

    try {
      // Create the backup job
      const createRes = await fetch('/api/backups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'full' }),
      });

      const createJson = await createRes.json();
      if (!createRes.ok) {
        setError(createJson.error || 'Failed to create backup');
        return;
      }

      const backup = createJson.data as Backup;

      // Start the backup
      const runRes = await fetch(`/api/backups/${backup.id}/run`, {
        method: 'POST',
      });

      if (!runRes.ok) {
        const runJson = await runRes.json();
        setError(runJson.error || 'Failed to start backup');
        return;
      }

      // Refresh the list
      await fetchBackups();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (backupId: string) => {
    try {
      const res = await fetch(`/api/backups/${backupId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setBackups((prev) => prev.filter((b) => b.id !== backupId));
      }
    } catch {
      // silently fail
    }
  };

  const handleDownload = (backupId: string) => {
    window.open(`/api/backups/${backupId}/download`, '_blank');
  };

  const statusBadge = (status: Backup['status']) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
            Pending
          </span>
        );
      case 'running':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-600">
            <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Running
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-600">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            Completed
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-600">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            Failed
          </span>
        );
    }
  };

  const typeBadge = (type: Backup['type']) => {
    return (
      <span
        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
          type === 'full'
            ? 'bg-electric/10 text-electric'
            : 'bg-amber-50 text-amber-600'
        }`}
      >
        {type === 'full' ? 'Full' : 'Incremental'}
      </span>
    );
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const manifestSummary = (manifest: Backup['manifest']) => {
    if (!manifest?.tables) return null;
    const totalRecords = Object.values(manifest.tables).reduce(
      (sum, count) => sum + (count > 0 ? count : 0),
      0
    );
    const tableCount = Object.keys(manifest.tables).length;
    return `${tableCount} tables, ${totalRecords.toLocaleString()} records`;
  };

  return (
    <div className="flex-1 overflow-y-auto bg-cream dark:bg-dark-bg p-4 sm:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header Section */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-navy/60 dark:text-slate-400 font-body text-sm">
              Create and manage database backups. Download or restore from previous backups.
            </p>
          </div>
          <button
            onClick={handleCreateBackup}
            disabled={creating}
            className="px-5 py-2.5 bg-electric text-white rounded-xl font-heading font-semibold text-sm hover:bg-electric/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 shrink-0"
          >
            {creating ? (
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
            )}
            {creating ? 'Creating...' : 'Create Backup'}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <p className="text-sm text-red-600 font-body">{error}</p>
          </div>
        )}

        {/* Backup List */}
        {loading ? (
          <div className="flex justify-center py-12">
            <svg className="animate-spin h-8 w-8 text-electric" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : backups.length === 0 ? (
          <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-cream dark:bg-navy flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-navy/30 dark:text-slate-600">
                <ellipse cx="12" cy="5" rx="9" ry="3" />
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
              </svg>
            </div>
            <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-base mb-1">
              No backups yet
            </h3>
            <p className="text-navy/50 dark:text-slate-400 font-body text-sm">
              Create your first backup to protect your data.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {backups.map((backup) => (
              <div
                key={backup.id}
                className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-5 transition-all duration-200 hover:shadow-sm"
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    backup.status === 'completed' ? 'bg-green-50' :
                    backup.status === 'running' ? 'bg-blue-50' :
                    backup.status === 'failed' ? 'bg-red-50' :
                    'bg-gray-50'
                  }`}>
                    {backup.status === 'running' ? (
                      <svg className="animate-spin h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={
                        backup.status === 'completed' ? 'text-green-500' :
                        backup.status === 'failed' ? 'text-red-500' :
                        'text-gray-400'
                      }>
                        <ellipse cx="12" cy="5" rx="9" ry="3" />
                        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                      </svg>
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-medium text-navy dark:text-slate-100 font-body">
                        {formatDate(backup.created_at)}
                      </span>
                      {typeBadge(backup.type)}
                      {statusBadge(backup.status)}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-navy/40 dark:text-slate-500 font-body">
                      {backup.size_bytes > 0 && (
                        <span>{formatBytes(backup.size_bytes)}</span>
                      )}
                      {backup.manifest && manifestSummary(backup.manifest) && (
                        <span>{manifestSummary(backup.manifest)}</span>
                      )}
                      {backup.completed_at && (
                        <span>Completed {formatDate(backup.completed_at)}</span>
                      )}
                    </div>

                    {/* Error message for failed backups */}
                    {backup.status === 'failed' && backup.error_message && (
                      <div className="mt-2 bg-red-50 border border-red-100 rounded-lg p-2.5">
                        <p className="text-xs text-red-600 font-body">{backup.error_message}</p>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {backup.status === 'completed' && (
                      <>
                        <button
                          onClick={() => handleDownload(backup.id)}
                          title="Download backup"
                          className="p-2 text-navy/40 dark:text-slate-500 hover:text-electric hover:bg-electric/10 rounded-lg transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setRestoreBackupId(backup.id)}
                          title="Restore from backup"
                          className="p-2 text-navy/40 dark:text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="1 4 1 10 7 10" />
                            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                          </svg>
                        </button>
                      </>
                    )}
                    {(backup.status === 'completed' || backup.status === 'failed') && (
                      <button
                        onClick={() => handleDelete(backup.id)}
                        title="Delete backup"
                        className="p-2 text-navy/40 dark:text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Restore Wizard Modal */}
        {restoreBackupId && (
          <RestoreWizard
            backupId={restoreBackupId}
            onClose={() => setRestoreBackupId(null)}
            onComplete={() => {
              setRestoreBackupId(null);
              fetchBackups();
            }}
          />
        )}
      </div>
    </div>
  );
}
