'use client';

import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export default function PendingApprovalPage() {
  const supabase = createClient();
  const router = useRouter();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const handleRefresh = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('account_status')
        .eq('id', user.id)
        .single();

      if (profile?.account_status === 'active') {
        router.push('/');
      }
    }
  };

  return (
    <div className="min-h-screen bg-cream dark:bg-navy flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h1 className="text-navy dark:text-white font-heading font-bold text-xl mb-2">
          Account Pending Approval
        </h1>
        <p className="text-navy/60 dark:text-slate-400 font-body text-sm mb-6">
          Your account has been created successfully. An admin will review your request and assign you a role shortly. You will be able to access the platform once approved.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={handleRefresh}
            className="px-4 py-2 rounded-xl bg-electric text-white font-body text-sm font-medium hover:bg-electric/90 transition-colors"
          >
            Check Status
          </button>
          <button
            onClick={handleSignOut}
            className="px-4 py-2 rounded-xl bg-navy/10 dark:bg-slate-700 text-navy dark:text-slate-200 font-body text-sm font-medium hover:bg-navy/20 dark:hover:bg-slate-600 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
