import { createServerSupabaseClient } from '@/lib/supabase/server';
import { processOverdueFollowUps } from '@/lib/follow-up-engine';

export const maxDuration = 120;

/**
 * Daily cron (8am ET) to process overdue follow-ups.
 * Sends notifications to admins about leads needing follow-up.
 */
export async function GET(request: Request) {
  // Verify cron secret for Vercel cron jobs
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = createServerSupabaseClient();

  try {
    const result = await processOverdueFollowUps(supabase);

    return new Response(
      JSON.stringify({
        ok: true,
        ...result,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (err) {
    console.error('[Cron:FollowUps] Error:', err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
