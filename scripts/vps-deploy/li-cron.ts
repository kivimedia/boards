import { supabase } from '../lib/supabase.js';
import { Queue } from 'bullmq';
import { createRedisConnection } from '../lib/redis.js';

// Schedule LinkedIn outreach cron jobs
export function startLiCronJobs(liQueue: Queue): void {
  // Daily batch generation: 9 AM EST (14:00 UTC) on weekdays
  setInterval(async () => {
    const now = new Date();
    const estHour = getESTHour(now);
    const day = now.getUTCDay(); // 0=Sun, 6=Sat

    // Only at 14:00 UTC (9 AM EST), weekdays only
    if (estHour !== 9 || day === 0 || day === 6) return;
    // Only run in the first minute of the hour
    if (now.getUTCMinutes() > 0) return;

    console.log('[li-cron] Triggering daily batch generation');
    await createLiCronJob(liQueue, 'li:generate_outreach', { auto: true });
  }, 60 * 1000); // Check every minute

  // 6-hourly recovery
  setInterval(async () => {
    const now = new Date();
    if (now.getUTCMinutes() > 0) return;
    if (now.getUTCHours() % 6 !== 0) return;

    console.log('[li-cron] Triggering recovery job');
    await createLiCronJob(liQueue, 'li:recovery', {});
  }, 60 * 1000);

  // Weekly Monday jobs: A/B evaluate + feedback collect (10 AM EST = 15:00 UTC)
  setInterval(async () => {
    const now = new Date();
    const estHour = getESTHour(now);
    const day = now.getUTCDay();

    if (day !== 1 || estHour !== 10 || now.getUTCMinutes() > 0) return;

    console.log('[li-cron] Triggering weekly A/B evaluation');
    await createLiCronJob(liQueue, 'li:ab_evaluate', {});

    console.log('[li-cron] Triggering weekly feedback collection');
    await createLiCronJob(liQueue, 'li:feedback_collect', { days_period: 7 });
  }, 60 * 1000);

  // Daily 2 AM EST (07:00 UTC) trash purge
  setInterval(async () => {
    const now = new Date();
    const estHour = getESTHour(now);
    if (estHour !== 2 || now.getUTCMinutes() > 0) return;

    console.log('[li-cron] Triggering trash purge');
    await createLiCronJob(liQueue, 'li:purge_trash', { days_old: 30 });
  }, 60 * 1000);

  // Daily follow-up check at 8 AM EST (13:00 UTC) weekdays
  setInterval(async () => {
    const now = new Date();
    const estHour = getESTHour(now);
    const day = now.getUTCDay();

    if (estHour !== 8 || day === 0 || day === 6 || now.getUTCMinutes() > 0) return;

    console.log('[li-cron] Triggering follow-up check');
    await createLiCronJob(liQueue, 'li:follow_up_check', {});
  }, 60 * 1000);

  // Browser response detection: every 4 hours on weekdays (8, 12, 16, 20 EST)
  setInterval(async () => {
    const now = new Date();
    const estHour = getESTHour(now);
    const day = now.getUTCDay();

    if (day === 0 || day === 6) return;
    if (![8, 12, 16, 20].includes(estHour)) return;
    if (now.getUTCMinutes() > 0) return;

    // Check if response detection is enabled
    const { data: settings } = await supabase
      .from('li_settings')
      .select('enable_response_detection')
      .limit(1)
      .single();

    if (!settings?.enable_response_detection) return;

    console.log('[li-cron] Triggering response detection check');
    await createLiCronJob(liQueue, 'li:check_responses', {});
  }, 60 * 1000);

  // Browser session health check: every 30 minutes
  setInterval(async () => {
    const now = new Date();
    if (now.getUTCMinutes() !== 0 && now.getUTCMinutes() !== 30) return;

    console.log('[li-cron] Triggering session health check');
    await createLiCronJob(liQueue, 'li:session_health', {});
  }, 60 * 1000);

  console.log('[li-cron] LinkedIn outreach cron jobs scheduled (including browser automation)');
}

function getESTHour(date: Date): number {
  // EST = UTC - 5 (not accounting for DST for simplicity)
  return (date.getUTCHours() - 5 + 24) % 24;
}

async function createLiCronJob(
  liQueue: Queue,
  jobType: string,
  extraPayload: Record<string, unknown>
): Promise<void> {
  // Check settings - is outreach paused?
  const { data: settings } = await supabase
    .from('li_settings')
    .select('pause_outreach, auto_generate_batches')
    .limit(1)
    .single();

  if (settings?.pause_outreach) {
    console.log(`[li-cron] Outreach paused, skipping ${jobType}`);
    return;
  }

  // For generate_outreach, check auto_generate_batches setting
  if (jobType === 'li:generate_outreach' && !settings?.auto_generate_batches) {
    console.log('[li-cron] Auto-generate batches disabled, skipping');
    return;
  }

  // Get the first user with li_settings (single-tenant for now)
  const { data: settingsRow } = await supabase
    .from('li_settings')
    .select('user_id')
    .limit(1)
    .single();

  const userId = settingsRow?.user_id;
  if (!userId) {
    console.log(`[li-cron] No user found for ${jobType}`);
    return;
  }

  // Insert li_jobs row
  const { data: liJob } = await supabase
    .from('li_jobs')
    .insert({
      user_id: userId,
      job_type: jobType,
      status: 'pending',
      payload: { user_id: userId, ...extraPayload },
      priority: jobType === 'li:recovery' ? 5 : 10,
    })
    .select('id')
    .single();

  if (!liJob) {
    console.error(`[li-cron] Failed to create li_job for ${jobType}`);
    return;
  }

  // Insert vps_jobs row (triggers realtime -> BullMQ)
  await supabase.from('vps_jobs').insert({
    job_type: 'li_outreach',
    status: 'pending',
    user_id: userId,
    payload: {
      li_job_id: liJob.id,
      job_type: jobType,
      user_id: userId,
      ...extraPayload,
    },
  });

  console.log(`[li-cron] Created ${jobType} job: ${liJob.id}`);
}
