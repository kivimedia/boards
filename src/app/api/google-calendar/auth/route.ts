import { NextRequest } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import { getOAuthUrl } from '@/lib/integrations/google-calendar';

export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  try {
    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const origin = `${protocol}://${host}`;
    const redirectUri = `${origin}/api/google-calendar/callback`;
    const url = getOAuthUrl(redirectUri);
    return Response.json({ url });
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
}
