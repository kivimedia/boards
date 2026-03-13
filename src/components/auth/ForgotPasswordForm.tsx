'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

type Mode = 'reset' | 'magic';

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [actionLink, setActionLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>('reset');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const endpoint = mode === 'magic'
      ? '/api/auth/magic-link'
      : '/api/auth/forgot-password';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
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
    const isMagic = mode === 'magic';
    return (
      <div className="text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-mint/20 flex items-center justify-center mx-auto">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-mint-dark">
            {isMagic ? (
              <><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8L19 13"/><path d="M15 9h0"/><path d="M17.8 6.2L19 5"/><path d="m3 21 9-9"/><path d="M12.2 6.2L11 5"/></>
            ) : (
              <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>
            )}
          </svg>
        </div>
        <div>
          <h3 className="text-navy dark:text-white font-heading font-semibold mb-1">
            {emailSent ? 'Check your email' : 'Link generated'}
          </h3>
          <p className="text-navy/60 text-sm font-body">
            {emailSent
              ? isMagic
                ? 'We sent a sign-in link to your email. Click it to log in instantly.'
                : 'We sent a password reset link to your email.'
              : isMagic
                ? 'A sign-in link has been generated.'
                : 'A password reset link has been generated.'}
          </p>
        </div>
        {emailSent && (
          <p className="text-navy/40 text-xs font-body">
            Don&apos;t see it? Check your spam folder. The email is from KM Boards.
          </p>
        )}
        {!emailSent && actionLink && (
          <a
            href={actionLink}
            className="block w-full px-4 py-2.5 bg-electric hover:bg-electric-bright text-white text-sm font-semibold rounded-xl text-center transition-colors"
          >
            {isMagic ? 'Sign In Now' : 'Reset Password Now'}
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Mode toggle */}
      <div className="flex bg-cream dark:bg-dark-bg rounded-xl p-1 gap-1">
        <button
          type="button"
          onClick={() => { setMode('reset'); setError(''); }}
          className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
            mode === 'reset'
              ? 'bg-white dark:bg-dark-surface text-navy dark:text-white shadow-sm'
              : 'text-navy/50 dark:text-white/50 hover:text-navy dark:hover:text-white'
          }`}
        >
          Reset Password
        </button>
        <button
          type="button"
          onClick={() => { setMode('magic'); setError(''); }}
          className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
            mode === 'magic'
              ? 'bg-white dark:bg-dark-surface text-navy dark:text-white shadow-sm'
              : 'text-navy/50 dark:text-white/50 hover:text-navy dark:hover:text-white'
          }`}
        >
          Magic Link
        </button>
      </div>

      <p className="text-navy/50 dark:text-white/50 text-xs font-body text-center">
        {mode === 'magic'
          ? 'Sign in instantly with a link sent to your email. No password needed.'
          : 'We\'ll send you a link to create a new password.'}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Email"
          type="email"
          placeholder="you@company.com"
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
          {mode === 'magic' ? 'Send Magic Link' : 'Send Reset Link'}
        </Button>
      </form>
    </div>
  );
}
