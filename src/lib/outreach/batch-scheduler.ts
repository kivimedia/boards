import type { SupabaseClient } from '@supabase/supabase-js';
import type { LILead, LITemplate, LIRotationVariant, LIDailyBatch } from '@/lib/types';
import { selectTemplate, type TemplateSelection } from './template-engine';
import { checkMessageQuality } from './message-quality';

// ============================================================================
// WARM-UP SCHEDULE (PRD Section 6.2)
// ============================================================================

const WARMUP_LIMITS: Record<number, number> = {
  1: 5,    // Week 1: 5/day
  2: 10,   // Week 2: 10/day
  3: 15,   // Week 3: 15/day
  4: 20,   // Week 4: 20/day
  5: 25,   // Week 5+: full volume
};

function getDailyLimit(warmupWeek: number, configuredLimit: number): number {
  if (warmupWeek <= 0) return configuredLimit;
  const warmupLimit = WARMUP_LIMITS[Math.min(warmupWeek, 5)] || configuredLimit;
  return Math.min(warmupLimit, configuredLimit);
}

// ============================================================================
// BATCH GENERATION
// ============================================================================

interface BatchGenerationOptions {
  userId: string;
  targetDate?: string; // YYYY-MM-DD, defaults to today
  isDryRun?: boolean;
}

interface GeneratedBatchResult {
  batch: LIDailyBatch | null;
  messages: {
    lead_id: string;
    lead_name: string;
    template_number: number;
    variant: string;
    rotation_variant: number | null;
    message_text: string;
    quality_passed: boolean;
    quality_check: ReturnType<typeof checkMessageQuality>;
  }[];
  skipped: { lead_id: string; lead_name: string; reason: string }[];
  stats: {
    daily_limit: number;
    warmup_week: number;
    eligible_count: number;
    generated_count: number;
    quality_passed: number;
    quality_failed: number;
  };
}

export async function generateDailyBatch(
  supabase: SupabaseClient,
  options: BatchGenerationOptions
): Promise<GeneratedBatchResult> {
  const { userId, isDryRun = false } = options;
  const targetDate = options.targetDate || new Date().toISOString().split('T')[0];

  // 1. Check if batch already exists for this date
  const { data: existingBatch } = await supabase
    .from('li_daily_batches')
    .select('*')
    .eq('user_id', userId)
    .eq('target_date', targetDate)
    .single();

  if (existingBatch && !isDryRun) {
    return {
      batch: existingBatch,
      messages: [],
      skipped: [],
      stats: { daily_limit: 0, warmup_week: 0, eligible_count: 0, generated_count: 0, quality_passed: 0, quality_failed: 0 },
    };
  }

  // 2. Get settings
  const { data: settings } = await supabase
    .from('li_settings')
    .select('*')
    .eq('user_id', userId)
    .single();

  const warmupWeek = settings?.warmup_week || 1;
  const dailyLimit = getDailyLimit(warmupWeek, settings?.daily_send_limit || 25);
  const isPaused = settings?.pause_outreach || false;

  if (isPaused) {
    return {
      batch: null,
      messages: [],
      skipped: [],
      stats: { daily_limit: dailyLimit, warmup_week: warmupWeek, eligible_count: 0, generated_count: 0, quality_passed: 0, quality_failed: 0 },
    };
  }

  // 3. Check if today is a weekend (no sending on weekends)
  const dayOfWeek = new Date(targetDate).getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return {
      batch: null,
      messages: [],
      skipped: [{ lead_id: '', lead_name: '', reason: 'Weekend - no batch generated' }],
      stats: { daily_limit: dailyLimit, warmup_week: warmupWeek, eligible_count: 0, generated_count: 0, quality_passed: 0, quality_failed: 0 },
    };
  }

  // 4. Get eligible leads (qualified, not in cooldown, at sendable stages)
  const sendableStages = [
    'TO_SEND_CONNECTION', 'CONNECTED', 'MESSAGE_SENT', 'NUDGE_SENT',
    'LOOM_PERMISSION', 'LOOM_SENT', 'REPLIED', 'BOOKED', 'NOT_INTERESTED',
  ];

  const { data: eligibleLeads } = await supabase
    .from('li_leads')
    .select('*')
    .eq('user_id', userId)
    .eq('qualification_status', 'qualified')
    .in('pipeline_stage', sendableStages)
    .is('deleted_at', null)
    .order('lead_score', { ascending: false });

  if (!eligibleLeads || eligibleLeads.length === 0) {
    return {
      batch: null,
      messages: [],
      skipped: [],
      stats: { daily_limit: dailyLimit, warmup_week: warmupWeek, eligible_count: 0, generated_count: 0, quality_passed: 0, quality_failed: 0 },
    };
  }

  // 5. Get templates and rotation variants
  const { data: templates } = await supabase
    .from('li_templates')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true);

  const { data: rotationVariants } = await supabase
    .from('li_rotation_variants')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (!templates || templates.length === 0) {
    return {
      batch: null,
      messages: [],
      skipped: [{ lead_id: '', lead_name: '', reason: 'No active templates found' }],
      stats: { daily_limit: dailyLimit, warmup_week: warmupWeek, eligible_count: eligibleLeads.length, generated_count: 0, quality_passed: 0, quality_failed: 0 },
    };
  }

  // 6. Filter leads with cooldown check and generate messages
  const now = new Date();
  const messages: GeneratedBatchResult['messages'] = [];
  const skipped: GeneratedBatchResult['skipped'] = [];

  for (const lead of eligibleLeads) {
    if (messages.length >= dailyLimit) break;

    // Skip if in cooldown (last contacted within 24h for connection, 4 days for follow-ups)
    if (lead.last_contacted_at) {
      const lastContacted = new Date(lead.last_contacted_at);
      const hoursSince = (now.getTime() - lastContacted.getTime()) / (1000 * 60 * 60);
      const minHours = lead.pipeline_stage === 'TO_SEND_CONNECTION' ? 24 : 96; // 4 days for follow-ups
      if (hoursSince < minHours) {
        skipped.push({ lead_id: lead.id, lead_name: lead.full_name, reason: `In cooldown (${Math.round(hoursSince)}h since last contact)` });
        continue;
      }
    }

    // Skip if next follow-up not yet due
    if (lead.next_followup_at && new Date(lead.next_followup_at) > now) {
      skipped.push({ lead_id: lead.id, lead_name: lead.full_name, reason: `Follow-up not yet due (${lead.next_followup_at})` });
      continue;
    }

    // Calculate days-since context
    const daysSince = (dateStr: string | null) => {
      if (!dateStr) return undefined;
      return Math.floor((now.getTime() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
    };

    const context = {
      days_since_message: daysSince(lead.last_contacted_at),
      days_since_nudge: daysSince(lead.last_contacted_at),
      days_since_loom: daysSince(lead.last_contacted_at),
      days_since_cold: daysSince(lead.last_contacted_at),
      days_since_session: daysSince(lead.last_contacted_at),
    };

    // Try to select a template
    const selection = selectTemplate(
      lead as LILead,
      templates as LITemplate[],
      (rotationVariants || []) as LIRotationVariant[],
      context
    );

    if (!selection) {
      skipped.push({ lead_id: lead.id, lead_name: lead.full_name, reason: `No template available for stage ${lead.pipeline_stage}` });
      continue;
    }

    if (!selection.prerequisitesMet) {
      skipped.push({ lead_id: lead.id, lead_name: lead.full_name, reason: `Prerequisites not met: ${selection.prerequisiteReason}` });
      continue;
    }

    // Quality check
    const quality = checkMessageQuality(selection.renderedMessage, {
      maxLength: selection.template.max_length || 300,
      templateNumber: selection.template.template_number,
      leadName: lead.full_name,
    });

    messages.push({
      lead_id: lead.id,
      lead_name: lead.full_name,
      template_number: selection.template.template_number,
      variant: selection.template.variant,
      rotation_variant: selection.rotationVariant?.variant_number || null,
      message_text: selection.renderedMessage,
      quality_passed: quality.passed,
      quality_check: quality,
    });
  }

  // 7. Create batch record and message records
  let batch: LIDailyBatch | null = null;
  const qualityPassed = messages.filter(m => m.quality_passed).length;

  if (messages.length > 0 && !isDryRun) {
    // Create daily batch
    const { data: batchData } = await supabase
      .from('li_daily_batches')
      .insert({
        user_id: userId,
        target_date: targetDate,
        lead_ids: messages.map(m => m.lead_id),
        batch_size: messages.length,
        approved: false,
        is_dry_run: false,
        warmup_week: warmupWeek,
        status: 'pending',
      })
      .select()
      .single();

    batch = batchData;

    // Create outreach message records
    const messageRecords = messages.map(m => ({
      lead_id: m.lead_id,
      template_id: null, // TODO: link to actual template ID
      template_number: m.template_number,
      variant: m.variant,
      rotation_variant: m.rotation_variant,
      message_text: m.message_text,
      quality_check: m.quality_check,
      quality_passed: m.quality_passed,
      status: 'draft' as const,
    }));

    await supabase.from('li_outreach_messages').insert(messageRecords);
  }

  return {
    batch,
    messages,
    skipped,
    stats: {
      daily_limit: dailyLimit,
      warmup_week: warmupWeek,
      eligible_count: eligibleLeads.length,
      generated_count: messages.length,
      quality_passed: qualityPassed,
      quality_failed: messages.length - qualityPassed,
    },
  };
}

// ============================================================================
// BATCH APPROVAL
// ============================================================================

export async function approveBatch(
  supabase: SupabaseClient,
  batchId: string,
  userId: string,
  approvedLeadIds?: string[] // If provided, only approve specific leads
): Promise<{ approved: number; rejected: number }> {
  // Get batch
  const { data: batch } = await supabase
    .from('li_daily_batches')
    .select('*')
    .eq('id', batchId)
    .eq('user_id', userId)
    .single();

  if (!batch) throw new Error('Batch not found');
  if (batch.status !== 'pending') throw new Error(`Batch already ${batch.status}`);

  const leadIds = approvedLeadIds || batch.lead_ids;

  // Update batch
  await supabase
    .from('li_daily_batches')
    .update({
      approved: true,
      approved_at: new Date().toISOString(),
      lead_ids: leadIds,
      batch_size: leadIds.length,
      status: 'approved',
    })
    .eq('id', batchId);

  // Update message statuses
  const { count: approvedCount } = await supabase
    .from('li_outreach_messages')
    .update({ status: 'approved' })
    .in('lead_id', leadIds)
    .eq('status', 'draft');

  // Reject messages for leads not in the approved list
  const rejectedIds = (batch.lead_ids as string[]).filter(id => !leadIds.includes(id));
  let rejectedCount = 0;
  if (rejectedIds.length > 0) {
    const { count } = await supabase
      .from('li_outreach_messages')
      .update({ status: 'failed' })
      .in('lead_id', rejectedIds)
      .eq('status', 'draft');
    rejectedCount = count || 0;
  }

  return {
    approved: approvedCount || 0,
    rejected: rejectedCount,
  };
}

// ============================================================================
// WEEKLY SEND COUNT CHECK
// ============================================================================

export async function getWeeklySendCount(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const { count } = await supabase
    .from('li_daily_batches')
    .select('batch_size', { count: 'exact', head: false })
    .eq('user_id', userId)
    .eq('status', 'approved')
    .gte('target_date', weekAgo.toISOString().split('T')[0]);

  // Sum batch sizes
  const { data: batches } = await supabase
    .from('li_daily_batches')
    .select('batch_size')
    .eq('user_id', userId)
    .in('status', ['approved', 'sent'])
    .gte('target_date', weekAgo.toISOString().split('T')[0]);

  return (batches || []).reduce((sum, b) => sum + (b.batch_size || 0), 0);
}
