import { NextResponse } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import { getAuthorizationUrl } from '@/lib/google/oauth';
import crypto from 'crypto';

export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  try {
    // State encodes the user ID + a random nonce for CSRF protection
    const nonce = crypto.randomBytes(16).toString('hex');
    const state = Buffer.from(JSON.stringify({
      userId: auth.ctx.userId,
      nonce,
    })).toString('base64url');

    const url = getAuthorizationUrl(state);
    return NextResponse.json({ url });
  } catch (err) {
    return errorResponse((err as Error).message, 500);
  }
}
