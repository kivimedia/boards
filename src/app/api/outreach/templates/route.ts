import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

/**
 * GET /api/outreach/templates - List all templates + rotation variants
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  const [templatesRes, variantsRes] = await Promise.all([
    supabase
      .from('li_templates')
      .select('*')
      .eq('user_id', userId)
      .order('template_number', { ascending: true })
      .order('variant', { ascending: true }),
    supabase
      .from('li_rotation_variants')
      .select('*')
      .eq('user_id', userId)
      .order('variant_number', { ascending: true }),
  ]);

  if (templatesRes.error) return errorResponse(templatesRes.error.message, 500);

  // Get usage stats per template
  const { data: usageData } = await supabase
    .from('li_outreach_messages')
    .select('template_number, status');

  const usageMap: Record<number, { sent: number; drafted: number }> = {};
  for (const msg of usageData || []) {
    if (!msg.template_number) continue;
    if (!usageMap[msg.template_number]) usageMap[msg.template_number] = { sent: 0, drafted: 0 };
    if (msg.status === 'sent') usageMap[msg.template_number].sent++;
    else usageMap[msg.template_number].drafted++;
  }

  return successResponse({
    templates: templatesRes.data || [],
    rotation_variants: variantsRes.data || [],
    usage: usageMap,
  });
}

/**
 * POST /api/outreach/templates - Create or update a template
 *
 * Body: {
 *   template_number: number;
 *   variant: 'A' | 'B';
 *   stage: string;
 *   template_text: string;
 *   prerequisite?: Record<string, unknown>;
 *   max_length?: number;
 *   is_followup?: boolean;
 * }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  let body: {
    template_number: number;
    variant: 'A' | 'B';
    stage: string;
    template_text: string;
    prerequisite?: Record<string, unknown>;
    max_length?: number;
    is_followup?: boolean;
  };

  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  if (!body.template_number || !body.variant || !body.template_text) {
    return errorResponse('template_number, variant, and template_text are required', 400);
  }

  // Default stage from template_number if not provided (stage is NOT NULL in DB)
  if (!body.stage) {
    const STAGE_DEFAULTS: Record<number, string> = {
      1: 'TO_SEND_CONNECTION', 2: 'CONNECTED', 3: 'LOOM_PERMISSION',
      4: 'LOOM_SENT', 5: 'REPLIED', 6: 'MESSAGE_SENT',
      7: 'NUDGE_SENT', 9: 'BOOKED', 10: 'NOT_INTERESTED',
    };
    body.stage = STAGE_DEFAULTS[body.template_number] || 'TO_SEND_CONNECTION';
  }

  // Check if template exists (upsert)
  const { data: existing } = await supabase
    .from('li_templates')
    .select('id')
    .eq('user_id', userId)
    .eq('template_number', body.template_number)
    .eq('variant', body.variant)
    .single();

  if (existing) {
    // Update
    const { data, error } = await supabase
      .from('li_templates')
      .update({
        stage: body.stage,
        template_text: body.template_text,
        prerequisite: body.prerequisite || {},
        max_length: body.max_length || null,
        is_followup: body.is_followup || false,
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) return errorResponse(error.message, 500);
    return successResponse({ template: data, action: 'updated' });
  } else {
    // Insert
    const { data, error } = await supabase
      .from('li_templates')
      .insert({
        user_id: userId,
        template_number: body.template_number,
        variant: body.variant,
        stage: body.stage,
        template_text: body.template_text,
        prerequisite: body.prerequisite || {},
        max_length: body.max_length || null,
        is_followup: body.is_followup || false,
        is_active: true,
      })
      .select()
      .single();

    if (error) return errorResponse(error.message, 500);
    return successResponse({ template: data, action: 'created' });
  }
}
