import { createServerSupabaseClient } from '@/lib/supabase/server';
import Sidebar from './Sidebar';

/**
 * Server component wrapper that fetches boards server-side
 * and passes them to the client Sidebar component.
 * Use this on all authenticated pages instead of <Sidebar />.
 *
 * NOTE: parent pages already gate on auth, so we use getSession()
 * (local JWT parse, no network call) instead of getUser().
 */
export default async function SidebarWithBoards() {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();

  let boards: any[] = [];
  if (session?.user) {
    const { data } = await supabase
      .from('boards')
      .select('id, name, type, is_starred, is_archived, created_at')
      .order('created_at', { ascending: true });
    boards = data || [];
  }

  return <Sidebar initialBoards={boards} />;
}
