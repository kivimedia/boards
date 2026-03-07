import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * POST /api/auth/login
 * Proxy login through server-side to avoid direct browser→Supabase auth calls.
 * Browser calls this endpoint; this calls Supabase from Vercel (server→server),
 * sets session cookies in the response, and returns success/error.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { email, password } = body;

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }

  const cookieStore = cookies();
  const pendingCookies: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach((c) => pendingCookies.push(c));
        },
      },
    }
  );

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  // Check profile role for redirect hint
  let userRole: string | null = null;
  let clientId: string | null = null;
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_role, client_id')
      .eq('id', data.user.id)
      .single();
    userRole = profile?.user_role ?? null;
    clientId = profile?.client_id ?? null;
  } catch {
    // Profile check failed - proceed to dashboard
  }

  const response = NextResponse.json({
    success: true,
    userRole,
    clientId,
  });

  // Apply session cookies to the response
  pendingCookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
  });

  return response;
}
