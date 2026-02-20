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
  const router = useRouter();
  const supabase = createClient();

  // On mount, let the Supabase client detect and exchange the recovery token from the URL hash
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setReady(true);
      }
    });

    // Also check if user already has a session (e.g. navigated here directly)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });

    return () => subscription.unsubscribe();
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
