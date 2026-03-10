import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getOpsDashboardData } from '@/lib/ai/ops-dashboard';

export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  try {
    const data = await getOpsDashboardData(auth.ctx.supabase);
    return successResponse(data);
  } catch (err) {
    return errorResponse(
      `Failed to load AI ops dashboard: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}
