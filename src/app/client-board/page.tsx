import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import ClientBoardView from '@/components/client/ClientBoardView';
import ClientBoardWrapper from '@/components/client/ClientBoardWrapper';

export default async function ClientBoardPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('user_role, client_id, display_name, needs_onboarding')
    .eq('id', user.id)
    .single();

  if (!profile || profile.user_role !== 'client' || !profile.client_id) {
    redirect('/');
  }

  return (
    <ClientBoardWrapper
      userId={user.id}
      displayName={profile.display_name || ''}
      needsOnboarding={profile.needs_onboarding ?? false}
    >
      <ClientBoardView clientId={profile.client_id} />
    </ClientBoardWrapper>
  );
}
