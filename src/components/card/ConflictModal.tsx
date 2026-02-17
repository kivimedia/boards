'use client';

import { useState } from 'react';

interface ConflictModalProps {
  isOpen: boolean;
  onClose: () => void;
  conflictUser: string;
  onReload: () => void;
  onOverwrite: () => void;
}

export default function ConflictModal({
  isOpen,
  onClose,
  conflictUser,
  onReload,
  onOverwrite,
}: ConflictModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-navy/60 backdrop-blur-sm dark:bg-black/70" onClick={onClose} />
      <div className="relative bg-white dark:bg-dark-surface rounded-xl shadow-modal p-6 max-w-md w-full mx-4 animate-in slide-in-from-bottom-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-warning/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-navy dark:text-white">Edit Conflict</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              This card was edited by <strong>{conflictUser}</strong> while you were making changes.
            </p>
          </div>
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">
          Choose how to resolve this conflict:
        </p>

        <div className="flex flex-col gap-2">
          <button
            onClick={onReload}
            className="w-full px-4 py-2.5 bg-electric text-white rounded-lg hover:bg-electric-bright transition-colors text-sm font-medium"
          >
            Load their version
          </button>
          <button
            onClick={onOverwrite}
            className="w-full px-4 py-2.5 bg-white dark:bg-dark-bg border border-slate-200 dark:border-slate-600 text-navy dark:text-white rounded-lg hover:bg-slate-50 dark:hover:bg-navy-light transition-colors text-sm font-medium"
          >
            Keep my changes
          </button>
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
