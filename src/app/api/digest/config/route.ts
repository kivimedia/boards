import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getDigestConfig, upsertDigestConfig } from '@/lib/digest-emails';

/**
 * GET /api/digest/config
 * Get current user's digest config.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  try {
    const config = await getDigestConfig(supabase, userId);
    return successResponse(config);
  } catch (err: any) {
    return errorResponse(err.message || 'Failed to fetch digest config', 500);
  }
}

interface UpsertDigestConfigBody {
  frequency?: 'daily' | 'weekly';
  send_time?: string;
  include_assigned?: boolean;
  include_overdue?: boolean;
  include_mentions?: boolean;
  include_completed?: boolean;
}

/**
 * POST /api/digest/config
 * Create or update digest config.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<UpsertDigestConfigBody>(request);
  if (!parsed.ok) return parsed.response;

  const { supabase, userId } = auth.ctx;

  try {
    const config = await upsertDigestConfig(supabase, userId, parsed.body);
    return successResponse(config, 201);
  } catch (err: any) {
    return errorResponse(err.message || 'Failed to upsert digest config', 500);
  }
}

/**
 * PATCH /api/digest/config
 * Update digest config (upsert).
 */
export async function PATCH(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<UpsertDigestConfigBody>(request);
  if (!parsed.ok) return parsed.response;

  const { supabase, userId } = auth.ctx;

  try {
    const config = await upsertDigestConfig(supabase, userId, parsed.body);
    return successResponse(config, 201);
  } catch (err: any) {
    return errorResponse(err.message || 'Failed to upsert digest config', 500);
  }
}
