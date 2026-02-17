import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { calculateCompleteness } from '@/lib/briefing';
import { BriefingTemplateField } from '@/lib/types';

interface Params {
  params: { id: string };
}

export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const cardId = params.id;

  const { data, error } = await supabase
    .from('card_briefs')
    .select('*, template:briefing_templates(*)')
    .eq('card_id', cardId)
    .single();

  if (error && error.code !== 'PGRST116') {
    return errorResponse(error.message, 500);
  }

  // Return null data if no brief exists yet
  return successResponse(data || null);
}

interface UpsertBriefBody {
  template_id?: string;
  data: Record<string, unknown>;
}

export async function PUT(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<UpsertBriefBody>(request);
  if (!body.ok) return body.response;

  const { template_id, data: briefData } = body.body;
  if (!briefData || typeof briefData !== 'object') {
    return errorResponse('data object is required');
  }

  const { supabase } = auth.ctx;
  const cardId = params.id;

  // Get the template fields for completeness calculation
  let fields: BriefingTemplateField[] = [];

  if (template_id) {
    const { data: template, error: templateError } = await supabase
      .from('briefing_templates')
      .select('fields')
      .eq('id', template_id)
      .single();

    if (templateError) return errorResponse('Template not found', 404);
    fields = (template.fields as BriefingTemplateField[]) || [];
  } else {
    // If no template_id provided, try to get it from existing brief
    const { data: existing } = await supabase
      .from('card_briefs')
      .select('template_id')
      .eq('card_id', cardId)
      .single();

    if (existing?.template_id) {
      const { data: template } = await supabase
        .from('briefing_templates')
        .select('fields')
        .eq('id', existing.template_id)
        .single();

      if (template) {
        fields = (template.fields as BriefingTemplateField[]) || [];
      }
    }
  }

  // Calculate completeness
  const { score, isComplete } = calculateCompleteness(briefData, fields);

  // Check if brief already exists for this card
  const { data: existingBrief } = await supabase
    .from('card_briefs')
    .select('id')
    .eq('card_id', cardId)
    .single();

  let result;

  if (existingBrief) {
    // Update existing brief
    const updatePayload: Record<string, unknown> = {
      data: briefData,
      completeness_score: score,
      is_complete: isComplete,
    };
    if (template_id) {
      updatePayload.template_id = template_id;
    }

    result = await supabase
      .from('card_briefs')
      .update(updatePayload)
      .eq('id', existingBrief.id)
      .select('*, template:briefing_templates(*)')
      .single();
  } else {
    // Insert new brief
    result = await supabase
      .from('card_briefs')
      .insert({
        card_id: cardId,
        template_id: template_id || null,
        data: briefData,
        completeness_score: score,
        is_complete: isComplete,
      })
      .select('*, template:briefing_templates(*)')
      .single();
  }

  if (result.error) return errorResponse(result.error.message, 500);
  return successResponse(result.data);
}
