import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getApiUsageStats } from '@/lib/public-api';

/**
 * GET /api/v1/usage
 * Get API usage statistics for a specific key.
 * Query params: key_id (required), days (default 7, max 90)
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const keyId = url.searchParams.get('key_id');
  const daysParam = url.searchParams.get('days');

  if (!keyId) {
    return errorResponse('key_id query parameter is required');
  }

  let days = 7;
  if (daysParam) {
    const parsed = parseInt(daysParam, 10);
    if (isNaN(parsed) || parsed < 1) {
      return errorResponse('days must be a positive integer');
    }
    days = Math.min(parsed, 90);
  }

  const { supabase, userId } = auth.ctx;

  // Verify the key belongs to the user
  const { data: apiKey, error: keyError } = await supabase
    .from('api_keys')
    .select('id')
    .eq('id', keyId)
    .eq('user_id', userId)
    .single();

  if (keyError || !apiKey) {
    return errorResponse('API key not found', 404);
  }

  const entries = await getApiUsageStats(supabase, keyId, days);

  // Aggregate daily stats
  const dailyStats: Record<string, { total: number; success: number; error: number }> = {};
  for (const entry of entries) {
    const date = entry.created_at.substring(0, 10);
    if (!dailyStats[date]) {
      dailyStats[date] = { total: 0, success: 0, error: 0 };
    }
    dailyStats[date].total += 1;
    if (entry.status_code >= 200 && entry.status_code < 400) {
      dailyStats[date].success += 1;
    } else {
      dailyStats[date].error += 1;
    }
  }

  return successResponse({
    key_id: keyId,
    days,
    total_requests: entries.length,
    daily: dailyStats,
    entries: entries.slice(0, 100), // Return latest 100 entries
  });
}
