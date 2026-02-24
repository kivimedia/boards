import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

export async function POST() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  try {
    const { error } = await auth.ctx.supabase
      .from('google_calendar_connection')
      .update({ is_active: false })
      .eq('is_active', true);

    if (error) return errorResponse(error.message, 500);
    return successResponse({ disconnected: true });
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
}
