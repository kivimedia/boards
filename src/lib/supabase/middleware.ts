import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/', '/login', '/signup', '/pending-approval', '/forgot-password', '/reset-password', '/auth/callback', '/api/auth/', '/api/cron/', '/api/admin/', '/api/webhooks/', '/api/pageforge/', '/connect-slack/', '/api/slack/'];

/**
 * Timeout for network calls (profile check for client role isolation).
 * Auth itself no longer needs a timeout since we use getSession() (local JWT parse).
 */
const NETWORK_TIMEOUT_MS = 10000;

function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Supabase network timeout')), ms)
    ),
  ]);
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const pathname = request.nextUrl.pathname;
  const isPublicPath = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Use getSession() instead of getUser() for middleware.
  // getSession() parses the JWT locally (no network call) — instant.
  // getUser() makes a round-trip to Supabase auth API — 200-3000ms from Vercel Stockholm to US.
  // Security note: getSession() trusts the JWT signature without server verification.
  // This is fine for middleware (routing/redirect logic). Individual API routes
  // that need verified auth should call getUser() themselves.
  let user = null;
  try {
    const { data } = await supabase.auth.getSession();
    user = data?.session?.user ?? null;
  } catch {
    if (isPublicPath) {
      return supabaseResponse;
    }
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Service temporarily unavailable' },
        { status: 503 }
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (!user && !isPublicPath) {
    // API routes should return 401 JSON, not redirect to login
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Client role isolation: restrict client users to their own board + map
  // This still needs a network call to check profile role, but only for authed users.
  if (user && !isPublicPath) {
    try {
      const result = await withTimeout(
        supabase.from('profiles').select('user_role, client_id').eq('id', user.id).single(),
        NETWORK_TIMEOUT_MS
      ) as { data: { user_role: string; client_id: string | null } | null };
      const profile = result.data;

      if (profile?.user_role === 'client' && profile?.client_id) {
        const clientId = profile.client_id;
        const clientAllowedPrefixes = [
          '/client-board',
          `/client/${clientId}/map`,
          '/api/client-board',
          '/api/cards/',
          '/api/clients/' + clientId,
          '/api/auth/',
        ];

        const isAllowed =
          clientAllowedPrefixes.some((p) => pathname.startsWith(p)) ||
          isPublicPath;

        if (!isAllowed) {
          if (pathname.startsWith('/api/')) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
          }
          const url = request.nextUrl.clone();
          url.pathname = '/client-board';
          return NextResponse.redirect(url);
        }
      }
    } catch {
      // Profile check timed out - allow the request through (auth succeeded, just can't check role)
    }
  }

  return supabaseResponse;
}
