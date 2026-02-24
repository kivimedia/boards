import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getIPWhitelist, addIPWhitelistEntry } from '@/lib/enterprise';

/**
 * GET /api/enterprise/ip-whitelist
 * List all IP whitelist entries.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  try {
    const entries = await getIPWhitelist(supabase);
    return successResponse(entries);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch IP whitelist';
    return errorResponse(message, 500);
  }
}

interface AddIPWhitelistBody {
  cidr: string;
  description?: string;
}

/**
 * POST /api/enterprise/ip-whitelist
 * Add a new IP whitelist entry.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<AddIPWhitelistBody>(request);
  if (!parsed.ok) return parsed.response;

  const { cidr, description } = parsed.body;

  if (!cidr?.trim()) return errorResponse('cidr is required');

  const { supabase, userId } = auth.ctx;

  const entry = await addIPWhitelistEntry(supabase, {
    cidr: cidr.trim(),
    description: description?.trim(),
    createdBy: userId,
  });

  if (!entry) return errorResponse('Failed to add IP whitelist entry', 500);
  return successResponse(entry, 201);
}
