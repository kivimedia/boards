import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { SupabaseClient } from '@supabase/supabase-js';

export interface AuthContext {
  supabase: SupabaseClient;
  userId: string;
}

/**
 * Extract authenticated user from request. Returns AuthContext or an error response.
 *
 * Uses getSession() (local JWT decode, no network call) instead of getUser()
 * (network roundtrip to Supabase Auth). Safe because the middleware already
 * called getUser() to verify the token before the request reaches here.
 */
export async function getAuthContext(): Promise<
  { ok: true; ctx: AuthContext } | { ok: false; response: NextResponse }
> {
  const supabase = createServerSupabaseClient();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      ),
    };
  }

  return {
    ok: true,
    ctx: { supabase, userId: session.user.id },
  };
}

/**
 * Standard success response
 */
export function successResponse(data: unknown, status = 200) {
  return NextResponse.json({ data }, { status });
}

/**
 * Standard error response
 */
export function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Parse JSON body from request, returning error response if invalid
 */
export async function parseBody<T>(
  request: Request
): Promise<{ ok: true; body: T } | { ok: false; response: NextResponse }> {
  try {
    const body = await request.json();
    return { ok: true, body: body as T };
  } catch {
    return {
      ok: false,
      response: errorResponse('Invalid JSON body'),
    };
  }
}
