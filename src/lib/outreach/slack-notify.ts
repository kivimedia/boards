import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Send a Slack notification via the configured outreach webhook URL.
 * Silently fails if no webhook is configured or the request fails.
 */
export async function sendSlackNotification(
  supabase: SupabaseClient,
  userId: string,
  message: { text: string; blocks?: unknown[] }
): Promise<boolean> {
  try {
    const { data: settings } = await supabase
      .from('li_settings')
      .select('slack_webhook_url')
      .eq('user_id', userId)
      .single();

    if (!settings?.slack_webhook_url) return false;

    const res = await fetch(settings.slack_webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });

    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Notify about batch generation results
 */
export async function notifyBatchGenerated(
  supabase: SupabaseClient,
  userId: string,
  stats: { date: string; count: number; qualityPassed: number; qualityFailed: number }
): Promise<void> {
  await sendSlackNotification(supabase, userId, {
    text: `LinkedIn Outreach - Daily batch generated for ${stats.date}: ${stats.count} messages (${stats.qualityPassed} passed, ${stats.qualityFailed} failed quality)`,
  });
}

/**
 * Notify about batch approval
 */
export async function notifyBatchApproved(
  supabase: SupabaseClient,
  userId: string,
  stats: { approved: number; rejected: number }
): Promise<void> {
  await sendSlackNotification(supabase, userId, {
    text: `LinkedIn Outreach - Batch approved: ${stats.approved} messages sent, ${stats.rejected} rejected`,
  });
}

/**
 * Notify about safety triggers
 */
export async function notifySafetyTrigger(
  supabase: SupabaseClient,
  userId: string,
  trigger: { name: string; severity: string; reason: string }
): Promise<void> {
  const emoji = trigger.severity === 'critical' ? '🚨' : '⚠️';
  await sendSlackNotification(supabase, userId, {
    text: `${emoji} LinkedIn Safety - ${trigger.name}: ${trigger.reason}`,
  });
}

/**
 * Notify about A/B test results
 */
export async function notifyABTestResult(
  supabase: SupabaseClient,
  userId: string,
  result: { templateNumber: number; winner: string | null; status: string }
): Promise<void> {
  const msg = result.winner
    ? `LinkedIn A/B Test (Template ${result.templateNumber}): Winner is variant ${result.winner}!`
    : `LinkedIn A/B Test (Template ${result.templateNumber}): Status updated to ${result.status}`;
  await sendSlackNotification(supabase, userId, { text: msg });
}
