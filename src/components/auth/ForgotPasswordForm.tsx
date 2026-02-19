'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [actionLink, setActionLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Use server-side endpoint to bypass Supabase email rate limits
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to send reset link');
      } else {
        setSuccess(true);
        setEmailSent(data.email_sent || false);
        setActionLink(data.action_link || null);
      }
    } catch {
      setError('Network error. Please try again.');
    }

    setLoading(false);
  };

  if (success) {
    return (
      <div className="text-center space-y-4">
        <div className="p-3 rounded-xl bg-mint/20 text-mint-dark text-sm font-body">
          {emailSent
            ? 'A password reset link has been sent to your email.'
            : 'A password reset link has been generated.'}
        </div>
        {emailSent ? (
          <p className="text-navy/70 text-sm font-body">
            Check your inbox (and spam folder) for an email from Kivi Media Boards with a reset link.
          </p>
        ) : actionLink ? (
          <div className="space-y-3">
            <p className="text-navy/70 text-sm font-body">
              Click the button below to reset your password:
            </p>
            <a
              href={actionLink}
              className="block w-full px-4 py-2.5 bg-electric hover:bg-electric-bright text-white text-sm font-semibold rounded-xl text-center transition-colors"
            >
              Reset Password Now
            </a>
          </div>
        ) : (
          <p className="text-navy/70 text-sm font-body">
            Check your email for a password reset link. If you don&apos;t see it, check your spam folder.
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Email"
        type="email"
        placeholder="you@agency.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      {error && (
        <div className="p-3 rounded-xl bg-danger/10 text-danger text-sm font-body">
          {error}
        </div>
      )}
      <Button type="submit" loading={loading} className="w-full">
        Send Reset Link
      </Button>
    </form>
  );
}
