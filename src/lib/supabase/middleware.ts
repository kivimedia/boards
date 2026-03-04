import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/signup', '/pending-approval', '/forgot-password', '/reset-password', '/auth/callback', '/api/auth/', '/api/cron/', '/api/admin/', '/api/webhooks/', '/api/pageforge/'];

const AUTH_TIMEOUT_MS = 15000;

function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Supabase auth timeout')), ms)
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

  let user = null;
  try {
    const { data } = await withTimeout(supabase.auth.getUser(), AUTH_TIMEOUT_MS);
    user = data?.user ?? null;
  } catch {
    // Supabase unreachable or timed out - allow public paths, redirect others to login
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
  if (user && !isPublicPath) {
    try {
      const result = await withTimeout(
        supabase.from('profiles').select('user_role, client_id').eq('id', user.id).single(),
        AUTH_TIMEOUT_MS
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
