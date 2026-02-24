'use client';

import { useState, useEffect, useCallback } from 'react';
import type { WhatsAppUser } from '@/lib/types';

export default function PhoneLinkForm() {
  const [waUser, setWaUser] = useState<WhatsAppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [step, setStep] = useState<'idle' | 'linking' | 'verifying'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/me');
      const json = await res.json();
      if (json.data) {
        setWaUser(json.data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleLink = async () => {
    if (!phoneNumber.trim()) return;

    setError(null);
    setSuccess(null);
    setStep('linking');

    try {
      const res = await fetch('/api/whatsapp/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: phoneNumber.trim() }),
      });

      const json = await res.json();

      if (json.error) {
        setError(json.error);
        setStep('idle');
        return;
      }

      if (json.data) {
        setWaUser(json.data);
        setStep('verifying');
        setSuccess('Verification code sent! Check your WhatsApp.');
      }
    } catch {
      setError('Failed to link phone number');
      setStep('idle');
    }
  };

  const handleVerify = async () => {
    if (!verificationCode.trim()) return;

    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/whatsapp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: verificationCode.trim() }),
      });

      const json = await res.json();

      if (json.error) {
        setError(json.error);
        return;
      }

      if (json.data?.verified) {
        setSuccess('Phone number verified successfully!');
        setStep('idle');
        setVerificationCode('');
        await fetchProfile();
      }
    } catch {
      setError('Verification failed');
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-24 rounded-xl bg-cream-dark/40 dark:bg-slate-800/40" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface p-5">
      <h3 className="text-sm font-semibold text-navy dark:text-slate-100 font-heading mb-4">Phone Link</h3>

      {/* Current linked status */}
      {waUser && (
        <div className="mb-4 p-3 rounded-lg bg-cream/50 dark:bg-navy/30 border border-cream-dark/30 dark:border-slate-700/30">
          <div className="flex items-center gap-2 mb-1">
            <div
              className={`w-2 h-2 rounded-full ${
                waUser.phone_verified ? 'bg-green-500' : 'bg-amber-500'
              }`}
            />
            <span className="text-sm font-medium text-navy dark:text-slate-100 font-body">
              {waUser.phone_number}
            </span>
          </div>
          <p className="text-xs text-navy/50 dark:text-slate-400 font-body">
            {waUser.phone_verified ? 'Verified' : 'Pending verification'}
            {waUser.display_name && ` - ${waUser.display_name}`}
          </p>
        </div>
      )}

      {/* Error / Success messages */}
      {error && (
        <div className="mb-3 p-2 rounded-lg bg-red-50 border border-red-200">
          <p className="text-xs text-red-600 font-body">{error}</p>
        </div>
      )}
      {success && (
        <div className="mb-3 p-2 rounded-lg bg-green-50 border border-green-200">
          <p className="text-xs text-green-600 font-body">{success}</p>
        </div>
      )}

      {/* Link form */}
      {(!waUser || !waUser.phone_verified) && step !== 'verifying' && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">
              Phone Number
            </label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+1234567890"
              className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body focus:outline-none focus:ring-2 focus:ring-electric/30"
            />
          </div>
          <button
            onClick={handleLink}
            disabled={!phoneNumber.trim() || step === 'linking'}
            className="w-full px-4 py-2 rounded-lg text-xs font-medium font-body bg-electric text-white hover:bg-electric/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {step === 'linking' ? 'Sending...' : 'Link Phone Number'}
          </button>
        </div>
      )}

      {/* Verification form */}
      {step === 'verifying' && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-navy/60 dark:text-slate-400 font-body mb-1">
              Verification Code
            </label>
            <input
              type="text"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              placeholder="123456"
              maxLength={6}
              className="w-full px-3 py-2 rounded-lg border border-cream-dark dark:border-slate-700 bg-white dark:bg-dark-surface text-sm text-navy dark:text-slate-100 font-body tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-electric/30"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleVerify}
              disabled={verificationCode.length !== 6}
              className="flex-1 px-4 py-2 rounded-lg text-xs font-medium font-body bg-electric text-white hover:bg-electric/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Verify
            </button>
            <button
              onClick={() => {
                setStep('idle');
                setVerificationCode('');
              }}
              className="px-4 py-2 rounded-lg text-xs font-medium font-body bg-cream-dark dark:bg-slate-800 text-navy/60 dark:text-slate-400 hover:bg-cream-dark/80 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
