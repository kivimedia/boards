import { Job } from 'bullmq';
import { supabase } from '../lib/supabase.js';
import { markJobRunning, markJobComplete, markJobFailed, updateJobProgress } from '../lib/job-reporter.js';

export interface LiOutreachJobData {
  vps_job_id: string;
  li_job_id: string;
  job_type: string;
  payload: Record<string, unknown>;
}

// === Main processor ===

export async function processLiOutreachJob(job: Job<LiOutreachJobData>): Promise<void> {
  const { vps_job_id, li_job_id, job_type, payload } = job.data;
  console.log(`[li-outreach] Processing ${job_type} (vps=${vps_job_id}, li=${li_job_id})`);

  await markJobRunning(vps_job_id);
  await updateLiJob(li_job_id, 'running');

  try {
    let result: Record<string, unknown> = {};

    switch (job_type) {
      case 'li:scout_import':
        result = await handleScoutImport(li_job_id, payload);
        break;
      case 'li:scout_enrich':
        result = await handleScoutEnrich(li_job_id, payload);
        break;
      case 'li:qualify':
        result = await handleQualify(li_job_id, payload);
        break;
      case 'li:generate_outreach':
        result = await handleGenerateOutreach(li_job_id, payload);
        break;
      case 'li:follow_up_check':
        result = await handleFollowUpCheck(li_job_id, payload);
        break;
      case 'li:recovery':
        result = await handleRecovery(li_job_id, payload);
        break;
      case 'li:feedback_collect':
        result = await handleFeedbackCollect(li_job_id, payload);
        break;
      case 'li:ab_evaluate':
        result = await handleABEvaluate(li_job_id, payload);
        break;
      case 'li:purge_trash':
        result = await handlePurgeTrash(li_job_id, payload);
        break;
      case 'li:send_batch':
        result = await handleSendBatch(li_job_id, payload);
        break;
      case 'li:check_responses':
        result = await handleCheckResponses(li_job_id, payload);
        break;
      case 'li:session_health':
        result = await handleSessionHealth(li_job_id, payload);
        break;
      default:
        throw new Error(`Unknown li job type: ${job_type}`);
    }

    await updateLiJob(li_job_id, 'completed', result);
    await markJobComplete(vps_job_id, result);
    console.log(`[li-outreach] Completed ${job_type} (li=${li_job_id})`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[li-outreach] Failed ${job_type}:`, msg);
    await updateLiJob(li_job_id, 'failed', { error: msg });
    await markJobFailed(vps_job_id, msg);
    throw err;
  }
}

// === li_jobs helper ===

async function updateLiJob(
  liJobId: string,
  status: string,
  result?: Record<string, unknown>
): Promise<void> {
  const update: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === 'running') update.started_at = new Date().toISOString();
  if (status === 'completed' || status === 'failed') {
    update.completed_at = new Date().toISOString();
    if (result) update.result = result;
  }
  await supabase.from('li_jobs').update(update).eq('id', liJobId);
}

// === Cost tracking helper ===

async function logCost(
  userId: string,
  serviceName: string,
  creditsUsed: number,
  costUsd: number,
  leadId?: string,
  batchId?: string
): Promise<void> {
  await supabase.from('li_cost_events').insert({
    user_id: userId,
    service_name: serviceName,
    lead_id: leadId || null,
    batch_id: batchId || null,
    credits_used: creditsUsed,
    cost_usd: costUsd,
  });
}

// === Pipeline transition helper ===

async function transitionStage(
  leadId: string,
  userId: string,
  fromStage: string,
  toStage: string,
  triggeredBy: string
): Promise<void> {
  await supabase.from('li_leads').update({ pipeline_stage: toStage }).eq('id', leadId);
  await supabase.from('li_pipeline_events').insert({
    lead_id: leadId,
    user_id: userId,
    from_stage: fromStage,
    to_stage: toStage,
    triggered_by: triggeredBy,
  });
}

// ============================================================================
// Job Handlers
// ============================================================================

async function handleScoutImport(
  liJobId: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const userId = payload.user_id as string;
  const leads = payload.leads as Array<Record<string, unknown>>;
  const batchId = payload.batch_id as string;

  let imported = 0;
  let duplicates = 0;

  for (const lead of leads) {
    const linkedinUrl = (lead.linkedin_url as string || '').toLowerCase().trim();

    // Dedup check by linkedin_url
    if (linkedinUrl) {
      const { data: existing } = await supabase
        .from('li_leads')
        .select('id')
        .eq('user_id', userId)
        .ilike('linkedin_url', linkedinUrl)
        .limit(1);

      if (existing && existing.length > 0) {
        duplicates++;
        continue;
      }
    }

    await supabase.from('li_leads').insert({
      user_id: userId,
      batch_id: batchId,
      full_name: lead.full_name || null,
      linkedin_url: linkedinUrl || null,
      title: lead.title || null,
      company: lead.company || null,
      location: lead.location || null,
      pipeline_stage: 'imported',
      score: 0,
    });
    imported++;
  }

  // Update batch stats
  await supabase
    .from('li_batches')
    .update({ total_leads: imported + duplicates })
    .eq('id', batchId);

  await updateJobProgress(liJobId, {
    progress_message: `Imported ${imported}, skipped ${duplicates} duplicates`,
  });

  return { imported, duplicates, batch_id: batchId };
}

async function handleScoutEnrich(
  liJobId: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const userId = payload.user_id as string;
  const leadIds = payload.lead_ids as string[];
  const batchId = payload.batch_id as string | undefined;

  let enriched = 0;
  let failed = 0;

  for (let i = 0; i < leadIds.length; i++) {
    const leadId = leadIds[i];
    try {
      const { data: lead } = await supabase
        .from('li_leads')
        .select('*')
        .eq('id', leadId)
        .single();

      if (!lead) {
        failed++;
        continue;
      }

      // Tier 1: Company website from LinkedIn profile data
      // Tier 2: Hunter.io email lookup
      // Tier 3: Snov.io email lookup
      // Tier 4: SerpAPI fallback
      // NOTE: Actual enrichment calls the Next.js API endpoints which handle the external APIs.
      // The VPS worker orchestrates and tracks progress.

      const enrichmentPayload = {
        lead_id: leadId,
        full_name: lead.full_name,
        company: lead.company,
        linkedin_url: lead.linkedin_url,
        website: lead.website,
      };

      // Call the Next.js enrichment API
      const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://kmboards.co';
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      const res = await fetch(`${baseUrl}/api/outreach/leads/bulk-enrich`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-service-key': serviceKey || '',
        },
        body: JSON.stringify({ lead_ids: [leadId] }),
      });

      if (res.ok) {
        enriched++;
        await transitionStage(leadId, userId, 'imported', 'enriched', 'li:scout_enrich');
      } else {
        failed++;
        await supabase.from('li_failed_leads').insert({
          lead_id: leadId,
          user_id: userId,
          error_type: 'ENRICHMENT_FAILED',
          error_message: `API returned ${res.status}`,
          retry_count: 0,
          status: 'PENDING_RETRY',
        });
      }

      // Progress update every 5 leads
      if ((i + 1) % 5 === 0) {
        await updateJobProgress(liJobId, {
          progress_message: `Enriched ${enriched}/${leadIds.length} leads`,
        });
      }
    } catch (err) {
      failed++;
      console.error(`[li-outreach] Enrich failed for lead ${leadId}:`, err);
    }
  }

  return { enriched, failed, total: leadIds.length };
}

async function handleQualify(
  liJobId: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const userId = payload.user_id as string;
  const leadIds = payload.lead_ids as string[];

  let qualified = 0;
  let disqualified = 0;
  let failed = 0;

  for (let i = 0; i < leadIds.length; i++) {
    const leadId = leadIds[i];
    try {
      const { data: lead } = await supabase
        .from('li_leads')
        .select('*')
        .eq('id', leadId)
        .single();

      if (!lead) { failed++; continue; }

      // Call the Next.js qualification API
      const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://kmboards.co';
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      const res = await fetch(`${baseUrl}/api/outreach/leads/bulk-qualify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-service-key': serviceKey || '',
        },
        body: JSON.stringify({ lead_ids: [leadId] }),
      });

      if (res.ok) {
        const result = await res.json();
        if (result.data?.qualified > 0) {
          qualified++;
        } else {
          disqualified++;
        }
      } else {
        failed++;
      }

      if ((i + 1) % 5 === 0) {
        await updateJobProgress(liJobId, {
          progress_message: `Qualified ${qualified}/${leadIds.length} leads`,
        });
      }
    } catch (err) {
      failed++;
      console.error(`[li-outreach] Qualify failed for lead ${leadId}:`, err);
    }
  }

  return { qualified, disqualified, failed, total: leadIds.length };
}

async function handleGenerateOutreach(
  liJobId: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const userId = payload.user_id as string;
  const batchId = payload.batch_id as string;

  // Get the daily batch
  const { data: batch } = await supabase
    .from('li_daily_batches')
    .select('*')
    .eq('id', batchId)
    .single();

  if (!batch) throw new Error(`Batch ${batchId} not found`);

  const leadIds = batch.lead_ids as string[];
  let generated = 0;

  for (const leadId of leadIds) {
    try {
      const { data: lead } = await supabase
        .from('li_leads')
        .select('*')
        .eq('id', leadId)
        .single();

      if (!lead) continue;

      // Determine which template stage this lead is at
      const stage = lead.pipeline_stage as string;
      let templateNumber = 1;
      if (stage === 'connected') templateNumber = 2;
      else if (stage === 'replied') templateNumber = 3;

      // Get active template for this stage
      const { data: templates } = await supabase
        .from('li_templates')
        .select('*')
        .eq('user_id', userId)
        .eq('stage', templateNumber)
        .eq('active', true)
        .limit(2);

      if (!templates || templates.length === 0) continue;

      // Pick template (random variant for A/B testing)
      const template = templates[Math.floor(Math.random() * templates.length)];

      // Simple variable interpolation
      let messageText = template.template_text as string;
      messageText = messageText.replace(/\{\{First Name\}\}/g, (lead.full_name as string || '').split(' ')[0]);
      messageText = messageText.replace(/\{\{Position\}\}/g, lead.title as string || '');
      messageText = messageText.replace(/\{\{Company\}\}/g, lead.company as string || '');

      // For template 1, pick a rotation variant
      let rotationVariant = null;
      if (templateNumber === 1) {
        const { data: variants } = await supabase
          .from('li_rotation_variants')
          .select('*')
          .eq('user_id', userId)
          .order('variant_number');

        if (variants && variants.length > 0) {
          // Round-robin based on lead count
          const { count } = await supabase
            .from('li_outreach_messages')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId);

          const idx = (count || 0) % variants.length;
          rotationVariant = variants[idx].variant_number;
          messageText = variants[idx].template_text as string;
          messageText = messageText.replace(/\{\{First Name\}\}/g, (lead.full_name as string || '').split(' ')[0]);
        }
      }

      // Save generated message
      await supabase.from('li_outreach_messages').insert({
        user_id: userId,
        lead_id: leadId,
        template_id: template.id,
        variant: template.variant || 'A',
        rotation_variant: rotationVariant,
        message_text: messageText,
        batch_id: batchId,
      });

      generated++;
    } catch (err) {
      console.error(`[li-outreach] Message gen failed for lead ${leadId}:`, err);
    }
  }

  // Log cost for Claude usage if any AI-based personalization was used
  await logCost(userId, 'claude', 1, 0.01, undefined, batchId);

  return { generated, total: leadIds.length, batch_id: batchId };
}

async function handleFollowUpCheck(
  liJobId: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const userId = payload.user_id as string;

  // Find leads that were sent messages > 3 days ago without a reply
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  const { data: pendingLeads } = await supabase
    .from('li_leads')
    .select('id, pipeline_stage, full_name')
    .eq('user_id', userId)
    .in('pipeline_stage', ['message_sent', 'connected'])
    .lt('updated_at', threeDaysAgo)
    .limit(50);

  let followUps = 0;
  for (const lead of pendingLeads || []) {
    // Check if they already have a follow-up message queued
    const { data: existing } = await supabase
      .from('li_outreach_messages')
      .select('id')
      .eq('lead_id', lead.id)
      .is('sent_at', null)
      .limit(1);

    if (existing && existing.length > 0) continue;

    // Mark for follow-up in next batch
    await supabase
      .from('li_leads')
      .update({ pipeline_stage: 'follow_up_needed' })
      .eq('id', lead.id);

    followUps++;
  }

  return { follow_ups_flagged: followUps };
}

async function handleRecovery(
  liJobId: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const userId = payload.user_id as string;

  // Get failed leads eligible for retry
  const { data: failedLeads } = await supabase
    .from('li_failed_leads')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'PENDING_RETRY')
    .lt('retry_count', 3)
    .order('created_at')
    .limit(20);

  let recovered = 0;
  let exhausted = 0;

  for (const fl of failedLeads || []) {
    try {
      // Re-attempt enrichment
      const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://kmboards.co';
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      const res = await fetch(`${baseUrl}/api/outreach/leads/bulk-enrich`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-service-key': serviceKey || '',
        },
        body: JSON.stringify({ lead_ids: [fl.lead_id] }),
      });

      if (res.ok) {
        await supabase
          .from('li_failed_leads')
          .update({ status: 'RESOLVED', retry_count: fl.retry_count + 1 })
          .eq('id', fl.id);
        recovered++;
      } else {
        const newRetry = fl.retry_count + 1;
        await supabase
          .from('li_failed_leads')
          .update({
            status: newRetry >= 3 ? 'EXHAUSTED' : 'PENDING_RETRY',
            retry_count: newRetry,
            next_retry_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
          })
          .eq('id', fl.id);

        if (newRetry >= 3) exhausted++;
      }
    } catch (err) {
      console.error(`[li-outreach] Recovery failed for ${fl.lead_id}:`, err);
    }
  }

  return { recovered, exhausted, attempted: failedLeads?.length || 0 };
}

async function handleFeedbackCollect(
  liJobId: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const userId = payload.user_id as string;
  const daysPeriod = (payload.days_period as number) || 7;

  // Analyze overrides from the past week
  const since = new Date(Date.now() - daysPeriod * 24 * 60 * 60 * 1000).toISOString();

  const { data: overrides } = await supabase
    .from('li_qualification_overrides')
    .select('*')
    .eq('user_id', userId)
    .gte('created_at', since);

  if (!overrides || overrides.length < 3) {
    return { proposals: 0, message: 'Not enough overrides for analysis' };
  }

  // Group overrides by pattern
  const patterns: Record<string, number> = {};
  for (const o of overrides) {
    const key = `${o.original_decision}->${o.new_decision}`;
    patterns[key] = (patterns[key] || 0) + 1;
  }

  // Create proposals for patterns with 3+ occurrences
  let proposals = 0;
  for (const [pattern, count] of Object.entries(patterns)) {
    if (count < 3) continue;

    const [from, to] = pattern.split('->');

    // Check if similar proposal already exists
    const { data: existing } = await supabase
      .from('li_learning_log')
      .select('id')
      .eq('user_id', userId)
      .eq('change_type', 'qualification_rule')
      .eq('status', 'pending')
      .eq('before_value', from)
      .eq('after_value', to)
      .limit(1);

    if (existing && existing.length > 0) continue;

    await supabase.from('li_learning_log').insert({
      user_id: userId,
      change_type: 'qualification_rule',
      title: `Auto-adjust: ${from} -> ${to} (${count} overrides)`,
      description: `In the last ${daysPeriod} days, you overrode ${count} leads from "${from}" to "${to}". Consider adjusting the qualification rules.`,
      before_value: from,
      after_value: to,
      evidence: JSON.stringify({ override_count: count, period_days: daysPeriod }),
      status: 'pending',
    });

    proposals++;
  }

  return { proposals, total_overrides: overrides.length };
}

async function handleABEvaluate(
  liJobId: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const userId = payload.user_id as string;

  // Get active A/B tests
  const { data: tests } = await supabase
    .from('li_ab_tests')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'running');

  if (!tests || tests.length === 0) {
    return { evaluated: 0, message: 'No active A/B tests' };
  }

  let evaluated = 0;
  let winners = 0;

  for (const test of tests) {
    // Count responses for each variant
    const { count: sentA } = await supabase
      .from('li_outreach_messages')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('template_id', test.template_a_id)
      .not('sent_at', 'is', null);

    const { count: repliedA } = await supabase
      .from('li_outreach_messages')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('template_id', test.template_a_id)
      .not('sent_at', 'is', null)
      .not('replied_at', 'is', null);

    const { count: sentB } = await supabase
      .from('li_outreach_messages')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('template_id', test.template_b_id)
      .not('sent_at', 'is', null);

    const { count: repliedB } = await supabase
      .from('li_outreach_messages')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('template_id', test.template_b_id)
      .not('sent_at', 'is', null)
      .not('replied_at', 'is', null);

    const totalA = sentA || 0;
    const totalB = sentB || 0;
    const successA = repliedA || 0;
    const successB = repliedB || 0;

    // Update test stats
    await supabase.from('li_ab_tests').update({
      sample_a: totalA,
      sample_b: totalB,
      rate_a: totalA > 0 ? successA / totalA : 0,
      rate_b: totalB > 0 ? successB / totalB : 0,
      last_evaluated_at: new Date().toISOString(),
    }).eq('id', test.id);

    // Check for significance (min 75 per variant)
    if (totalA >= 75 && totalB >= 75) {
      const rateA = successA / totalA;
      const rateB = successB / totalB;
      const pooledRate = (successA + successB) / (totalA + totalB);
      const se = Math.sqrt(pooledRate * (1 - pooledRate) * (1 / totalA + 1 / totalB));

      if (se > 0) {
        const z = Math.abs(rateA - rateB) / se;
        const pValue = 2 * (1 - normalCDF(z));

        await supabase.from('li_ab_tests').update({
          p_value: pValue,
        }).eq('id', test.id);

        // 90% confidence (p < 0.10)
        if (pValue < 0.10) {
          const winner = rateA > rateB ? 'A' : 'B';
          await supabase.from('li_ab_tests').update({
            status: 'completed',
            winner,
          }).eq('id', test.id);
          winners++;
        }
      }
    }

    evaluated++;
  }

  return { evaluated, winners };
}

// Normal CDF approximation
function normalCDF(z: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

// === Browser Automation Handlers ===

const LINKEDIN_SERVICE_URL = process.env.LINKEDIN_SERVICE_URL || 'http://127.0.0.1:8098';

async function callLinkedInService<T = unknown>(
  path: string,
  body?: Record<string, unknown>,
  timeoutMs = 300000
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${LINKEDIN_SERVICE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`LinkedIn service ${path} returned ${res.status}: ${text}`);
    }
    return await res.json() as T;
  } finally {
    clearTimeout(timer);
  }
}

async function handleSendBatch(
  liJobId: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const userId = payload.user_id as string;
  const batchId = payload.batch_id as string;

  console.log(`[li-outreach] SEND_BATCH: batch=${batchId}, user=${userId}`);

  // 1. Get active browser session
  const { data: session } = await supabase
    .from('li_browser_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  if (!session) {
    throw new Error('No active browser session found. Set up a LinkedIn session first.');
  }

  // 2. Get approved messages for this batch
  const { data: messages, error: msgErr } = await supabase
    .from('li_outreach_messages')
    .select(`
      id, lead_id, template_number, message_text, status,
      li_leads(id, full_name, linkedin_url, pipeline_stage)
    `)
    .eq('batch_id', batchId)
    .eq('status', 'approved')
    .order('created_at', { ascending: true });

  if (msgErr) throw new Error(`Failed to fetch messages: ${msgErr.message}`);
  if (!messages || messages.length === 0) {
    return { sent: 0, skipped: 0, failed: 0, message: 'No approved messages in batch' };
  }

  // 3. Get settings for delay config
  const { data: settings } = await supabase
    .from('li_settings')
    .select('min_delay_between_actions_ms, max_delay_between_actions_ms')
    .eq('user_id', userId)
    .single();

  const minDelay = settings?.min_delay_between_actions_ms || 45000;
  const maxDelay = settings?.max_delay_between_actions_ms || 120000;

  // 4. Update batch status
  await supabase
    .from('li_daily_batches')
    .update({ send_started_at: new Date().toISOString() })
    .eq('id', batchId);

  // 5. Process each message sequentially
  let sent = 0, failed = 0, skipped = 0;
  const results: Array<{ message_id: string; status: string; error?: string }> = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const lead = (msg as any).li_leads;

    if (!lead?.linkedin_url) {
      skipped++;
      results.push({ message_id: msg.id, status: 'skipped', error: 'No LinkedIn URL' });
      continue;
    }

    // Determine action type based on pipeline stage
    const isConnection = ['TO_SEND_CONNECTION', 'SCOUTED', 'ENRICHED', 'QUALIFIED'].includes(lead.pipeline_stage);
    const actionType = isConnection ? 'connect_with_note' : 'send_message';
    const servicePath = isConnection ? '/action/connect' : '/action/message';

    try {
      // Call LinkedIn service
      const actionResult = await callLinkedInService<{ data: { success: boolean; action_id?: string; duration_ms?: number; error?: string } }>(
        servicePath,
        {
          linkedin_url: lead.linkedin_url,
          note_text: isConnection ? msg.message_text : undefined,
          message_text: !isConnection ? msg.message_text : undefined,
        },
        120000 // 2 min timeout per action
      );

      if (actionResult.data?.success) {
        // Log browser action
        const { data: action } = await supabase
          .from('li_browser_actions')
          .insert({
            session_id: session.id,
            user_id: userId,
            lead_id: lead.id,
            message_id: msg.id,
            batch_id: batchId,
            action_type: actionType,
            status: 'completed',
            input_data: { linkedin_url: lead.linkedin_url, message_length: msg.message_text.length },
            result_data: actionResult.data,
            duration_ms: actionResult.data.duration_ms || 0,
          })
          .select('id')
          .single();

        // Update message status
        await supabase
          .from('li_outreach_messages')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            browser_action_id: action?.id || null,
          })
          .eq('id', msg.id);

        // Transition pipeline stage
        const newStage = isConnection ? 'CONNECTION_SENT' : 'MESSAGE_SENT';
        await supabase
          .from('li_leads')
          .update({ pipeline_stage: newStage, updated_at: new Date().toISOString() })
          .eq('id', lead.id);

        await supabase.from('li_pipeline_events').insert({
          user_id: userId,
          lead_id: lead.id,
          from_stage: lead.pipeline_stage,
          to_stage: newStage,
          triggered_by: 'browser',
          notes: `Sent via LinkedIn browser automation (batch ${batchId})`,
        });

        // Increment session daily actions
        await supabase.rpc('increment_counter', { row_id: session.id, table_name: 'li_browser_sessions', column_name: 'daily_actions_count' }).catch(() => {
          // Fallback: manual increment
          supabase
            .from('li_browser_sessions')
            .update({ daily_actions_count: (session.daily_actions_count || 0) + sent + 1 })
            .eq('id', session.id);
        });

        sent++;
        results.push({ message_id: msg.id, status: 'sent' });
      } else {
        throw new Error(actionResult.data?.error || 'Action failed');
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[li-outreach] SEND_BATCH: Failed to send message ${msg.id}:`, errMsg);

      // Log failed action
      await supabase.from('li_browser_actions').insert({
        session_id: session.id,
        user_id: userId,
        lead_id: lead.id,
        message_id: msg.id,
        batch_id: batchId,
        action_type: actionType,
        status: 'failed',
        input_data: { linkedin_url: lead.linkedin_url },
        error_message: errMsg,
      });

      // Update message with error
      await supabase
        .from('li_outreach_messages')
        .update({ send_error: errMsg })
        .eq('id', msg.id);

      failed++;
      results.push({ message_id: msg.id, status: 'failed', error: errMsg });
    }

    // Delay between actions (not after the last one)
    if (i < messages.length - 1) {
      const delay = minDelay + Math.random() * (maxDelay - minDelay);
      console.log(`[li-outreach] SEND_BATCH: Waiting ${Math.round(delay / 1000)}s before next action`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    // Update job progress
    await updateJobProgress(payload.vps_job_id as string || '', {
      current: i + 1,
      total: messages.length,
      sent,
      failed,
      skipped,
    }).catch(() => {});
  }

  // 6. Update batch status
  await supabase
    .from('li_daily_batches')
    .update({
      status: 'sent',
      send_completed_at: new Date().toISOString(),
      send_result: { sent, failed, skipped, results },
    })
    .eq('id', batchId);

  console.log(`[li-outreach] SEND_BATCH complete: sent=${sent}, failed=${failed}, skipped=${skipped}`);
  return { sent, failed, skipped, results };
}

async function handleCheckResponses(
  liJobId: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const userId = payload.user_id as string;
  console.log(`[li-outreach] CHECK_RESPONSES: user=${userId}`);

  // 1. Get active session
  const { data: session } = await supabase
    .from('li_browser_sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  if (!session) {
    return { checked: false, error: 'No active browser session' };
  }

  let connectionsChecked = 0, repliesChecked = 0;
  let newConnections = 0, newReplies = 0;

  // 2. Check pending connections
  try {
    const pendingResult = await callLinkedInService<{
      data: { connections: Array<{ name: string; linkedin_url: string; status: string }> }
    }>('/action/check-pending', {}, 60000);

    const accepted = (pendingResult.data?.connections || []).filter(c => c.status === 'accepted');
    connectionsChecked = pendingResult.data?.connections?.length || 0;

    // Match accepted connections to leads
    for (const conn of accepted) {
      const { data: lead } = await supabase
        .from('li_leads')
        .select('id, pipeline_stage')
        .eq('user_id', userId)
        .eq('pipeline_stage', 'CONNECTION_SENT')
        .ilike('linkedin_url', `%${conn.linkedin_url.split('/in/')[1]?.replace(/\/$/, '') || ''}%`)
        .single();

      if (lead) {
        await supabase
          .from('li_leads')
          .update({ pipeline_stage: 'CONNECTED', updated_at: new Date().toISOString() })
          .eq('id', lead.id);

        await supabase.from('li_pipeline_events').insert({
          user_id: userId,
          lead_id: lead.id,
          from_stage: 'CONNECTION_SENT',
          to_stage: 'CONNECTED',
          triggered_by: 'browser',
          notes: 'Connection accepted - detected by browser automation',
        });

        newConnections++;
      }
    }

    // Log the action
    await supabase.from('li_browser_actions').insert({
      session_id: session.id,
      user_id: userId,
      action_type: 'check_connections',
      status: 'completed',
      result_data: { total: connectionsChecked, new_connections: newConnections },
    });
  } catch (err) {
    console.error('[li-outreach] CHECK_RESPONSES: Failed to check pending connections:', err);
  }

  // 3. Check inbox for replies
  try {
    const inboxResult = await callLinkedInService<{
      data: { conversations: Array<{ name: string; linkedin_url: string; last_message: string; unread: boolean }> }
    }>('/action/check-inbox', {}, 60000);

    const unread = (inboxResult.data?.conversations || []).filter(c => c.unread);
    repliesChecked = inboxResult.data?.conversations?.length || 0;

    // Match replies to leads with MESSAGE_SENT stage
    for (const conv of unread) {
      const urlPart = conv.linkedin_url?.split('/in/')[1]?.replace(/\/$/, '') || '';
      if (!urlPart) continue;

      const { data: lead } = await supabase
        .from('li_leads')
        .select('id, pipeline_stage')
        .eq('user_id', userId)
        .eq('pipeline_stage', 'MESSAGE_SENT')
        .ilike('linkedin_url', `%${urlPart}%`)
        .single();

      if (lead) {
        await supabase
          .from('li_leads')
          .update({ pipeline_stage: 'REPLIED', updated_at: new Date().toISOString() })
          .eq('id', lead.id);

        await supabase.from('li_pipeline_events').insert({
          user_id: userId,
          lead_id: lead.id,
          from_stage: 'MESSAGE_SENT',
          to_stage: 'REPLIED',
          triggered_by: 'browser',
          notes: `Reply detected: "${conv.last_message?.substring(0, 100)}..."`,
        });

        newReplies++;
      }
    }

    // Log the action
    await supabase.from('li_browser_actions').insert({
      session_id: session.id,
      user_id: userId,
      action_type: 'check_inbox',
      status: 'completed',
      result_data: { total: repliesChecked, new_replies: newReplies },
    });
  } catch (err) {
    console.error('[li-outreach] CHECK_RESPONSES: Failed to check inbox:', err);
  }

  console.log(`[li-outreach] CHECK_RESPONSES complete: connections=${newConnections}, replies=${newReplies}`);
  return {
    connections_checked: connectionsChecked,
    new_connections: newConnections,
    replies_checked: repliesChecked,
    new_replies: newReplies,
  };
}

async function handleSessionHealth(
  liJobId: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const userId = payload.user_id as string;
  console.log(`[li-outreach] SESSION_HEALTH: user=${userId}`);

  // 1. Get active session
  const { data: session } = await supabase
    .from('li_browser_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  if (!session) {
    return { health: 'no_session', logged_in: false };
  }

  try {
    const healthResult = await callLinkedInService<{
      data: { health: string; logged_in: boolean; page_responsive: boolean }
    }>('/session/health', {}, 30000);

    const health = healthResult.data?.health || 'unknown';
    const loggedIn = healthResult.data?.logged_in || false;

    // Update session record
    await supabase
      .from('li_browser_sessions')
      .update({
        health_status: health,
        last_health_check_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', session.id);

    // Auto-pause if logged out or unhealthy
    if (!loggedIn || health === 'logged_out' || health === 'blocked') {
      console.warn(`[li-outreach] SESSION_HEALTH: Unhealthy session (${health}), auto-pausing`);

      await supabase
        .from('li_settings')
        .update({
          pause_outreach: true,
          pause_reason: `Browser session unhealthy: ${health}. Re-authenticate on LinkedIn.`,
        })
        .eq('user_id', userId);

      await supabase
        .from('li_browser_sessions')
        .update({ status: health === 'blocked' ? 'blocked' : 'expired' })
        .eq('id', session.id);

      await supabase.from('li_pipeline_events').insert({
        user_id: userId,
        lead_id: null,
        from_stage: null,
        to_stage: null,
        triggered_by: 'browser',
        notes: `Session health check failed: ${health}. Outreach auto-paused.`,
      });
    }

    // Log the action
    await supabase.from('li_browser_actions').insert({
      session_id: session.id,
      user_id: userId,
      action_type: 'session_health_check',
      status: 'completed',
      result_data: { health, logged_in: loggedIn },
    });

    return { health, logged_in: loggedIn, session_id: session.id };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[li-outreach] SESSION_HEALTH: Service unreachable:', errMsg);

    await supabase
      .from('li_browser_sessions')
      .update({
        health_status: 'unknown',
        last_health_check_at: new Date().toISOString(),
        error_count: (session.error_count || 0) + 1,
        last_error: errMsg,
      })
      .eq('id', session.id);

    return { health: 'unreachable', logged_in: false, error: errMsg };
  }
}

async function handlePurgeTrash(
  liJobId: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const userId = payload.user_id as string;
  const daysOld = (payload.days_old as number) || 30;

  const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();

  // Hard-delete leads that were soft-deleted more than N days ago
  const { data: trashed } = await supabase
    .from('li_leads')
    .select('id')
    .eq('user_id', userId)
    .not('deleted_at', 'is', null)
    .lt('deleted_at', cutoff);

  if (!trashed || trashed.length === 0) {
    return { purged: 0 };
  }

  const ids = trashed.map(l => l.id);

  // Delete related records first
  await supabase.from('li_outreach_messages').delete().in('lead_id', ids);
  await supabase.from('li_pipeline_events').delete().in('lead_id', ids);
  await supabase.from('li_cost_events').delete().in('lead_id', ids);
  await supabase.from('li_failed_leads').delete().in('lead_id', ids);
  await supabase.from('li_leads').delete().in('id', ids);

  return { purged: ids.length };
}
