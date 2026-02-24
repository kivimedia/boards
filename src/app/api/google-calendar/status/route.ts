import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getConnectionStatus } from '@/lib/integrations/google-calendar';

export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  try {
    const status = await getConnectionStatus(auth.ctx.supabase);
    return successResponse(status);
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
}
