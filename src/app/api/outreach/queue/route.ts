import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

/**
 * GET /api/outreach/queue - Get daily batch for a given date
 *
 * Query params:
 *   date - Target date (YYYY-MM-DD), defaults to today
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

  // Get daily batch
  const { data: batch } = await supabase
    .from('li_daily_batches')
    .select('*')
    .eq('user_id', userId)
    .eq('target_date', date)
    .single();

  if (!batch) {
    return successResponse({ batch: null, messages: [], stats: null });
  }

  // Get messages for leads in this batch
  const { data: messages } = await supabase
    .from('li_outreach_messages')
    .select('*')
    .in('lead_id', batch.lead_ids || [])
    .in('status', ['draft', 'approved'])
    .order('created_at', { ascending: false });

  // Get lead details
  const { data: leads } = await supabase
    .from('li_leads')
    .select('id, full_name, job_position, company_name, lead_score, pipeline_stage, website, linkedin_url')
    .in('id', batch.lead_ids || []);

  // Merge leads with their messages
  const leadMap = new Map((leads || []).map(l => [l.id, l]));
  const enrichedMessages = (messages || []).map(msg => ({
    ...msg,
    lead: leadMap.get(msg.lead_id) || null,
  }));

  // Get settings for context
  const { data: settings } = await supabase
    .from('li_settings')
    .select('warmup_week, daily_send_limit, weekly_send_limit, pause_outreach')
    .eq('user_id', userId)
    .single();

  // Get weekly send count
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const { data: weekBatches } = await supabase
    .from('li_daily_batches')
    .select('batch_size')
    .eq('user_id', userId)
    .in('status', ['approved', 'sent'])
    .gte('target_date', weekAgo.toISOString().split('T')[0]);

  const weeklySent = (weekBatches || []).reduce((sum, b) => sum + (b.batch_size || 0), 0);

  return successResponse({
    batch,
    messages: enrichedMessages,
    stats: {
      warmup_week: settings?.warmup_week || 1,
      daily_limit: settings?.daily_send_limit || 25,
      weekly_limit: settings?.weekly_send_limit || 100,
      weekly_sent: weeklySent,
      is_paused: settings?.pause_outreach || false,
    },
  });
}
