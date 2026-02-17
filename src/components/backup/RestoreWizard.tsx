'use client';

import { useState } from 'react';

interface RestoreWizardProps {
  backupId: string;
  onClose: () => void;
  onComplete: () => void;
}

type RestoreStep = 1 | 2 | 3;

interface RestoreResult {
  restored: boolean;
  tablesRestored: number;
  errors: string[];
}

export default function RestoreWizard({ backupId, onClose, onComplete }: RestoreWizardProps) {
  const [step, setStep] = useState<RestoreStep>(1);
  const [confirmed, setConfirmed] = useState(false);
  const [createPreRestoreBackup, setCreatePreRestoreBackup] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [result, setResult] = useState<RestoreResult | null>(null);
  const [error, setError] = useState('');
  const [preBackupStatus, setPreBackupStatus] = useState('');

  const handleRestore = async () => {
    setStep(2);
    setRestoring(true);
    setError('');

    try {
      // Optionally create a pre-restore backup
      if (createPreRestoreBackup) {
        setPreBackupStatus('Creating pre-restore backup...');

        const createRes = await fetch('/api/backups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'full' }),
        });

        const createJson = await createRes.json();

        if (createRes.ok && createJson.data) {
          const preBackupId = createJson.data.id;

          // Start the pre-restore backup
          const runRes = await fetch(`/api/backups/${preBackupId}/run`, {
            method: 'POST',
          });

          if (runRes.ok) {
            // Poll for completion
            setPreBackupStatus('Running pre-restore backup...');
            let attempts = 0;
            const maxAttempts = 60; // 2 minutes max

            while (attempts < maxAttempts) {
              await new Promise((resolve) => setTimeout(resolve, 2000));
              const pollRes = await fetch(`/api/backups/${preBackupId}`);
              const pollJson = await pollRes.json();

              if (pollJson.data) {
                const status = pollJson.data.status;
                if (status === 'completed') {
                  setPreBackupStatus('Pre-restore backup completed.');
                  break;
                }
                if (status === 'failed') {
                  setPreBackupStatus('Pre-restore backup failed. Continuing with restore...');
                  break;
                }
              }
              attempts++;
            }

            if (attempts >= maxAttempts) {
              setPreBackupStatus('Pre-restore backup timed out. Continuing with restore...');
            }
          }
        }
      }

      // Perform the restore
      setPreBackupStatus(createPreRestoreBackup ? 'Restoring data...' : '');

      const restoreRes = await fetch(`/api/backups/${backupId}/restore`, {
        method: 'POST',
      });

      const restoreJson = await restoreRes.json();

      if (!restoreRes.ok) {
        setError(restoreJson.error || 'Restore failed');
        setStep(3);
        return;
      }

      setResult(restoreJson.data as RestoreResult);
      setStep(3);
    } catch {
      setError('Network error. Please try again.');
      setStep(3);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-navy/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-cream-dark dark:border-slate-700">
          <h2 className="text-lg font-heading font-semibold text-navy dark:text-slate-100">
            Restore from Backup
          </h2>
          {step !== 2 && (
            <button
              onClick={onClose}
              className="p-1.5 text-navy/40 dark:text-slate-500 hover:text-navy dark:hover:text-slate-100 rounded-lg transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-5 space-y-5">
          {/* Step 1: Confirmation */}
          {step === 1 && (
            <>
              {/* Warning */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="flex gap-3">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500 shrink-0 mt-0.5">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <div>
                    <h3 className="text-sm font-semibold text-amber-800 font-heading mb-1">
                      Warning: Data Overwrite
                    </h3>
                    <p className="text-xs text-amber-700 font-body leading-relaxed">
                      Restoring from a backup will delete all current data and replace it with the backup contents. This action cannot be undone unless you create a pre-restore backup.
                    </p>
                  </div>
                </div>
              </div>

              {/* Confirmation checkbox */}
              <label className="flex items-start gap-3 cursor-pointer">
                <div
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                    confirmed ? 'bg-electric border-electric' : 'border-cream-dark dark:border-slate-700'
                  }`}
                  onClick={() => setConfirmed(!confirmed)}
                >
                  {confirmed && (
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
                <span className="text-sm text-navy dark:text-slate-100 font-body">
                  I understand this will replace all current data
                </span>
              </label>

              {/* Pre-restore backup checkbox */}
              <label className="flex items-start gap-3 cursor-pointer">
                <div
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                    createPreRestoreBackup ? 'bg-electric border-electric' : 'border-cream-dark dark:border-slate-700'
                  }`}
                  onClick={() => setCreatePreRestoreBackup(!createPreRestoreBackup)}
                >
                  {createPreRestoreBackup && (
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
                <div>
                  <span className="text-sm text-navy dark:text-slate-100 font-body">
                    Create pre-restore backup first
                  </span>
                  <p className="text-xs text-navy/40 dark:text-slate-500 font-body mt-0.5">
                    Recommended. Creates a safety backup of your current data before restoring.
                  </p>
                </div>
              </label>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={onClose}
                  className="px-5 py-2.5 text-navy/60 dark:text-slate-400 hover:text-navy dark:hover:text-slate-100 rounded-xl font-heading font-semibold text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRestore}
                  disabled={!confirmed}
                  className="px-6 py-2.5 bg-amber-500 text-white rounded-xl font-heading font-semibold text-sm hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Restore
                </button>
              </div>
            </>
          )}

          {/* Step 2: Processing */}
          {step === 2 && (
            <div className="text-center py-6">
              <div className="flex justify-center mb-4">
                <svg className="animate-spin h-10 w-10 text-electric" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
              <h3 className="text-base font-heading font-semibold text-navy dark:text-slate-100 mb-1">
                Restoring Data
              </h3>
              <p className="text-sm text-navy/50 dark:text-slate-400 font-body">
                Please do not close this window or navigate away.
              </p>
              {preBackupStatus && (
                <p className="text-xs text-navy/40 dark:text-slate-500 font-body mt-3">
                  {preBackupStatus}
                </p>
              )}
            </div>
          )}

          {/* Step 3: Result */}
          {step === 3 && (
            <>
              {result && result.restored ? (
                <div className="text-center py-4">
                  <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-500">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <h3 className="text-base font-heading font-semibold text-navy dark:text-slate-100 mb-1">
                    Restore Complete
                  </h3>
                  <p className="text-sm text-navy/50 dark:text-slate-400 font-body mb-4">
                    Successfully restored {result.tablesRestored} table{result.tablesRestored !== 1 ? 's' : ''}.
                  </p>

                  {result.errors.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-left mb-4">
                      <p className="text-xs font-medium text-amber-800 font-body mb-1">
                        {result.errors.length} warning{result.errors.length !== 1 ? 's' : ''} during restore:
                      </p>
                      <ul className="text-xs text-amber-700 font-body space-y-0.5">
                        {result.errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <button
                    onClick={onComplete}
                    className="px-6 py-2.5 bg-electric text-white rounded-xl font-heading font-semibold text-sm hover:bg-electric/90 transition-colors"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <div className="text-center py-4">
                  <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="15" y1="9" x2="9" y2="15" />
                      <line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                  </div>
                  <h3 className="text-base font-heading font-semibold text-navy dark:text-slate-100 mb-1">
                    Restore Failed
                  </h3>
                  <p className="text-sm text-red-600 font-body mb-4">
                    {error || 'An unexpected error occurred during the restore process.'}
                  </p>

                  {result && result.errors.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-left mb-4">
                      <ul className="text-xs text-red-600 font-body space-y-0.5">
                        {result.errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex justify-center gap-3">
                    <button
                      onClick={onClose}
                      className="px-5 py-2.5 text-navy/60 dark:text-slate-400 hover:text-navy dark:hover:text-slate-100 rounded-xl font-heading font-semibold text-sm transition-colors"
                    >
                      Close
                    </button>
                    <button
                      onClick={() => {
                        setStep(1);
                        setConfirmed(false);
                        setError('');
                        setResult(null);
                        setPreBackupStatus('');
                      }}
                      className="px-6 py-2.5 bg-electric text-white rounded-xl font-heading font-semibold text-sm hover:bg-electric/90 transition-colors"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
