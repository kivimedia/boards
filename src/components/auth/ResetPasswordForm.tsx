'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

export default function ResetPasswordForm() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [success, setSuccess] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  // On mount, check for error params in URL and listen for recovery token exchange
  useEffect(() => {
    // Check URL for error_code from Supabase redirect (e.g. expired token)
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace('#', '?'));
    const errorCode = params.get('error_code') || hashParams.get('error_code');
    const errorDesc = params.get('error_description') || hashParams.get('error_description');

    if (errorCode) {
      const msg = errorCode === 'otp_expired'
        ? 'This reset link has expired. Please request a new one.'
        : errorDesc?.replace(/\+/g, ' ') || 'This reset link is invalid.';
      setLinkError(msg);
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setReady(true);
      }
    });

    // Also check if user already has a session (e.g. navigated here directly)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });

    // Timeout after 10 seconds - if no recovery event fired, the link is likely bad
    const timeout = setTimeout(() => {
      setLinkError('Could not verify your reset link. It may have expired or already been used. Please request a new one.');
    }, 10000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
      setTimeout(() => {
        router.push('/');
        router.refresh();
      }, 2000);
    }
  };

  if (success) {
    return (
      <div className="text-center space-y-4">
        <div className="p-3 rounded-xl bg-mint/20 text-mint-dark text-sm font-body">
          Password updated successfully! Redirecting...
        </div>
      </div>
    );
  }

  if (linkError) {
    return (
      <div className="text-center space-y-5">
        <div className="w-14 h-14 rounded-2xl bg-danger/10 flex items-center justify-center mx-auto">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-danger">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <div>
          <h3 className="text-navy dark:text-white font-heading font-semibold mb-1">Link Expired</h3>
          <p className="text-navy/60 dark:text-white/60 text-sm font-body">{linkError}</p>
        </div>
        <a
          href="/forgot-password"
          className="inline-block px-6 py-2.5 bg-electric text-white font-semibold rounded-xl hover:bg-electric/90 transition-colors text-sm"
        >
          Request New Link
        </a>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="text-center space-y-4">
        <div className="animate-spin h-6 w-6 border-2 border-electric border-t-transparent rounded-full mx-auto" />
        <p className="text-navy/60 text-sm font-body">Verifying your reset link...</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="New Password"
        type="password"
        placeholder="••••••••"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      <Input
        label="Confirm Password"
        type="password"
        placeholder="••••••••"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        required
      />
      {error && (
        <div className="p-3 rounded-xl bg-danger/10 text-danger text-sm font-body">
          {error}
        </div>
      )}
      <Button type="submit" loading={loading} className="w-full">
        Update Password
      </Button>
    </form>
  );
}
