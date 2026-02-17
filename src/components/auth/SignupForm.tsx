'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

export default function SignupForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
        },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push('/');
      router.refresh();
    }
  };

  return (
    <form onSubmit={handleSignup} className="space-y-4">
      <Input
        label="Display Name"
        type="text"
        placeholder="Your Name"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        required
      />
      <Input
        label="Email"
        type="email"
        placeholder="you@agency.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <Input
        label="Password"
        type="password"
        placeholder="••••••••"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={6}
      />
      {error && (
        <div className="p-3 rounded-xl bg-danger/10 text-danger text-sm font-body">
          {error}
        </div>
      )}
      <Button type="submit" loading={loading} className="w-full">
        Create Account
      </Button>
    </form>
  );
}
