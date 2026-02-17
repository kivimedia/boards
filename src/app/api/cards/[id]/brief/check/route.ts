import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
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

  // Get the card's brief with its template
  const { data: brief, error } = await supabase
    .from('card_briefs')
    .select('*, template:briefing_templates(*)')
    .eq('card_id', cardId)
    .single();

  if (error && error.code !== 'PGRST116') {
    return errorResponse(error.message, 500);
  }

  // No brief exists at all
  if (!brief) {
    return successResponse({
      is_complete: false,
      completeness_score: 0,
      missing_required: [],
    });
  }

  // Calculate completeness from the template fields
  const fields = (brief.template?.fields as BriefingTemplateField[]) || [];
  const briefData = (brief.data as Record<string, unknown>) || {};
  const { score, isComplete, missingRequired } = calculateCompleteness(briefData, fields);

  return successResponse({
    is_complete: isComplete,
    completeness_score: score,
    missing_required: missingRequired,
  });
}
