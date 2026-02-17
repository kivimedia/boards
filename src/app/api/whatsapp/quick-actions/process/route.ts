import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { processQuickAction } from '@/lib/whatsapp';

interface ProcessQuickActionBody {
  keyword: string;
  card_id: string;
}

/**
 * POST /api/whatsapp/quick-actions/process
 * Process a quick action by keyword and card ID.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<ProcessQuickActionBody>(request);
  if (!parsed.ok) return parsed.response;

  const { keyword, card_id } = parsed.body;

  if (!keyword?.trim()) {
    return errorResponse('keyword is required');
  }

  if (!card_id?.trim()) {
    return errorResponse('card_id is required');
  }

  const { supabase, userId } = auth.ctx;

  const result = await processQuickAction(supabase, keyword.trim(), card_id.trim(), userId);

  if (!result.success) {
    return errorResponse(result.error || 'Quick action failed', 400);
  }

  return successResponse(result);
}
