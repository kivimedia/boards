'use client';

import { useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

type Mode = 'password' | 'magic';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>('password');
  const [magicSent, setMagicSent] = useState(false);
  const [magicEmailSent, setMagicEmailSent] = useState(false);
  const [magicActionLink, setMagicActionLink] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || 'Login failed');
        setLoading(false);
        return;
      }

      if (json.userRole === 'client' && json.clientId) {
        window.location.href = '/client-board';
      } else {
        window.location.href = '/';
      }
    } catch {
      setError('Could not connect to the server. Please check your internet connection and try again.');
      setLoading(false);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to send magic link');
      } else {
        setMagicSent(true);
        setMagicEmailSent(data.email_sent || false);
        setMagicActionLink(data.action_link || null);
      }
    } catch {
      setError('Network error. Please try again.');
    }

    setLoading(false);
  };

  if (magicSent) {
    return (
      <div className="text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-mint/20 flex items-center justify-center mx-auto">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-mint-dark">
            <path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8L19 13"/><path d="M15 9h0"/><path d="M17.8 6.2L19 5"/><path d="m3 21 9-9"/><path d="M12.2 6.2L11 5"/>
          </svg>
        </div>
        <div>
          <h3 className="text-navy dark:text-white font-heading font-semibold mb-1">
            {magicEmailSent ? 'Check your email' : 'Link generated'}
          </h3>
          <p className="text-navy/60 text-sm font-body">
            {magicEmailSent
              ? 'We sent a sign-in link to your email. Click it to log in instantly.'
              : 'A sign-in link has been generated.'}
          </p>
        </div>
        {magicEmailSent && (
          <p className="text-navy/40 text-xs font-body">
            Don&apos;t see it? Check your spam folder.
          </p>
        )}
        {!magicEmailSent && magicActionLink && (
          <a
            href={magicActionLink}
            className="block w-full px-4 py-2.5 bg-electric hover:bg-electric-bright text-white text-sm font-semibold rounded-xl text-center transition-colors"
          >
            Sign In Now
          </a>
        )}
        <button
          type="button"
          onClick={() => { setMagicSent(false); setMode('password'); }}
          className="text-sm text-electric hover:text-electric-bright transition-colors font-body"
        >
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Mode toggle */}
      <div className="flex bg-cream dark:bg-dark-bg rounded-xl p-1 gap-1">
        <button
          type="button"
          onClick={() => { setMode('password'); setError(''); }}
          className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
            mode === 'password'
              ? 'bg-white dark:bg-dark-surface text-navy dark:text-white shadow-sm'
              : 'text-navy/50 dark:text-white/50 hover:text-navy dark:hover:text-white'
          }`}
        >
          Password
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

      {mode === 'password' ? (
        <form onSubmit={handleLogin} className="space-y-4">
          <Input
            label="Email"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <div>
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <div className="mt-1 text-right">
              <Link href="/forgot-password" className="text-sm text-electric hover:text-electric-bright transition-colors font-body">
                Forgot password?
              </Link>
            </div>
          </div>
          {error && (
            <div className="p-3 rounded-xl bg-danger/10 text-danger text-sm font-body">
              {error}
            </div>
          )}
          <Button type="submit" loading={loading} className="w-full">
            Sign In
          </Button>
        </form>
      ) : (
        <form onSubmit={handleMagicLink} className="space-y-4">
          <p className="text-navy/50 dark:text-white/50 text-xs font-body text-center">
            Enter your email and we&apos;ll send you a sign-in link. No password needed.
          </p>
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
            Send Magic Link
          </Button>
        </form>
      )}
    </div>
  );
}
