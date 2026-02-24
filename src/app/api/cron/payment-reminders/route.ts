import { createServerSupabaseClient } from '@/lib/supabase/server';
import { processPaymentReminders } from '@/lib/payment-enforcement';

export const maxDuration = 120;

/**
 * Daily cron (9am ET) to send escalating payment reminders.
 * Checks private client cards in "Invoice Sent" / "Needs to Pay Before Event"
 * and sends reminders at 7, 3, and 1 days before the event.
 */
export async function GET(request: Request) {
  // Verify cron secret for Vercel cron jobs
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = createServerSupabaseClient();

  try {
    const result = await processPaymentReminders(supabase);

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
    console.error('[Cron:PaymentReminders] Error:', err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
