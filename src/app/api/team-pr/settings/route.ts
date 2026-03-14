import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, parseBody } from '@/lib/api-helpers';

const DEFAULTS = {
  max_outlets: 50,
  relevance_threshold: 50,
  verification_threshold: 60,
  qa_threshold: 70,
};

/**
 * GET /api/team-pr/settings
 * Returns default PR pipeline config. TODO: persist per-user config.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  return successResponse(DEFAULTS);
}

/**
 * PATCH /api/team-pr/settings
 * Accepts config update. TODO: persist per-user config.
 */
export async function PATCH(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<Record<string, unknown>>(request);
  if (!body.ok) return body.response;

  return successResponse({ ...DEFAULTS, ...body.body });
}
