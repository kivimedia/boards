'use client';

import { useState, useEffect, useRef } from 'react';
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
  const supabase = useRef(createClient()).current;

  useEffect(() => {
    // 1. Check URL for error params (e.g. expired token redirect from Supabase)
    const params = new URLSearchParams(window.location.search);
    const hashStr = window.location.hash.substring(1); // remove #
    const hashParams = new URLSearchParams(hashStr);
    const errorCode = params.get('error_code') || hashParams.get('error_code');
    const errorDesc = params.get('error_description') || hashParams.get('error_description');

    if (errorCode) {
      const msg = errorCode === 'otp_expired'
        ? 'This reset link has expired. Please request a new one.'
        : errorDesc?.replace(/\+/g, ' ') || 'This reset link is invalid.';
      setLinkError(msg);
      return;
    }

    // 2. Check if hash contains access_token (Supabase recovery redirect)
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');

    if (accessToken && refreshToken) {
      // Explicitly set the session from hash tokens
      supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      }).then(({ error: sessionErr }) => {
        if (sessionErr) {
          setLinkError('This reset link is invalid or has expired. Please request a new one.');
        } else {
          setReady(true);
        }
      });
      return;
    }

    // 3. Listen for auth state changes (fallback for other flows)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setReady(true);
      }
    });

    // 4. Check if user already has a session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });

    // 5. Timeout - if nothing worked after 8 seconds, show error
    const timeout = setTimeout(() => {
      setLinkError('Could not verify your reset link. It may have expired or already been used. Please request a new one.');
    }, 8000);

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
