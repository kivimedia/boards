import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { evaluateTest } from '@/lib/outreach/ab-test-engine';
import type { LIABTest } from '@/lib/types';

/**
 * GET /api/outreach/ab-tests/[id] - Get A/B test detail with evaluation
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { id } = await params;

  const { data: test, error } = await supabase
    .from('li_ab_tests')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (error || !test) return errorResponse('Test not found', 404);

  const evaluation = evaluateTest(test as LIABTest);

  // Get template details for variant labels
  const templateIds = [test.variant_a_id, test.variant_b_id].filter(Boolean);
  const { data: templates } = await supabase
    .from('li_templates')
    .select('id, variant, template_text, template_number')
    .in('id', templateIds);

  // Get recent messages for this test's templates
  const { data: recentMessages } = await supabase
    .from('li_outreach_messages')
    .select('id, template_id, status, created_at, lead_id')
    .in('template_id', templateIds)
    .order('created_at', { ascending: false })
    .limit(20);

  return successResponse({
    test,
    evaluation,
    templates: templates || [],
    recentMessages: recentMessages || [],
  });
}
