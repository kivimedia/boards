import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getValidAccessToken, removeTokens } from '@/lib/google/token-manager';
import { revokeToken } from '@/lib/google/oauth';

export async function DELETE() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  try {
    // Try to revoke the token at Google (best-effort)
    const accessToken = await getValidAccessToken(supabase, userId);
    if (accessToken) {
      await revokeToken(accessToken).catch(() => {
        // Revocation is best-effort
      });
    }

    // Remove from our DB
    await removeTokens(supabase, userId);

    return successResponse({ disconnected: true });
  } catch (err) {
    return errorResponse((err as Error).message, 500);
  }
}
