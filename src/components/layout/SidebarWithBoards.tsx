import { createServerSupabaseClient } from '@/lib/supabase/server';
import Sidebar from './Sidebar';

/**
 * Server component wrapper that fetches boards server-side
 * and passes them to the client Sidebar component.
 * Use this on all authenticated pages instead of <Sidebar />.
 */
export default async function SidebarWithBoards() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  let boards: any[] = [];
  if (user) {
    const { data } = await supabase
      .from('boards')
      .select('id, name, type, is_starred, is_archived, created_at')
      .order('created_at', { ascending: true });
    boards = data || [];
  }

  return <Sidebar initialBoards={boards} />;
}
