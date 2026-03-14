import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, parseBody } from '@/lib/api-helpers';

/**
 * POST /api/team-pr/runs/estimate
 * Returns estimated cost breakdown for a pipeline run.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<{ max_outlets?: number }>(request);
  if (!body.ok) return body.response;

  const maxOutlets = body.body.max_outlets || 50;

  // Cost model based on typical per-outlet costs
  const estimate = {
    research: {
      tavily_searches: 10,
      tavily_cost: 0.10,
      youtube_searches: 3,
      youtube_cost: 0.00,
      claude_parsing: 0.02,
      subtotal: 0.12,
    },
    verification: {
      hunter_domain_searches: maxOutlets,
      hunter_email_verifications: Math.round(maxOutlets * 0.7),
      hunter_cost: Number((maxOutlets * 0.02).toFixed(2)),
      claude_criteria_checks: maxOutlets,
      claude_cost: Number((maxOutlets * 0.005).toFixed(2)),
      subtotal: Number((maxOutlets * 0.025).toFixed(2)),
    },
    qa: {
      claude_qa_checks: Math.round(maxOutlets * 0.6),
      claude_cost: Number((Math.round(maxOutlets * 0.6) * 0.005).toFixed(2)),
      subtotal: Number((Math.round(maxOutlets * 0.6) * 0.005).toFixed(2)),
    },
    email_gen: {
      emails_to_generate: Math.round(maxOutlets * 0.4),
      claude_cost: Number((Math.round(maxOutlets * 0.4) * 0.01).toFixed(2)),
      subtotal: Number((Math.round(maxOutlets * 0.4) * 0.01).toFixed(2)),
    },
    total: 0,
  };

  estimate.total = Number(
    (
      estimate.research.subtotal +
      estimate.verification.subtotal +
      estimate.qa.subtotal +
      estimate.email_gen.subtotal
    ).toFixed(2)
  );

  return successResponse(estimate);
}
