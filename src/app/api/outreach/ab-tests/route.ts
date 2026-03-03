import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getTestsWithEvaluations, createABTest } from '@/lib/outreach/ab-test-engine';

/**
 * GET /api/outreach/ab-tests - List all A/B tests with evaluations
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const tests = await getTestsWithEvaluations(supabase, userId);

  return successResponse({ tests });
}

/**
 * POST /api/outreach/ab-tests - Create a new A/B test
 *
 * Body: { template_number: number; template_stage: string }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  let body: { template_number: number; template_stage: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  if (!body.template_number || !body.template_stage) {
    return errorResponse('template_number and template_stage are required', 400);
  }

  const result = await createABTest(supabase, userId, body.template_number, body.template_stage);

  if (!result.success) {
    return errorResponse(result.error || 'Failed to create test', 400);
  }

  return successResponse({ test: result.test }, 201);
}
