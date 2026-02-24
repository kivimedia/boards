import { NextRequest } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import { getOAuthUrl } from '@/lib/integrations/google-calendar';

export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  try {
    const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const redirectUri = `${origin}/api/google-calendar/callback`;
    const url = getOAuthUrl(redirectUri);
    return Response.json({ url });
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
}
