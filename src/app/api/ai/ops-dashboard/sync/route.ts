import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { syncAllProviderData } from '@/lib/ai/ops-sync';

export async function POST() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  try {
    const results = await syncAllProviderData(auth.ctx.supabase, auth.ctx.userId);
    return successResponse({
      syncedAt: new Date().toISOString(),
      results,
    });
  } catch (err) {
    return errorResponse(
      `Failed to sync provider data: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}
