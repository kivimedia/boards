import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/signup', '/pending-approval', '/forgot-password', '/reset-password', '/auth/callback'];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublicPath = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

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

  // Check account_status for authenticated users on non-public paths
  if (user && !isPublicPath && !pathname.startsWith('/api/')) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('account_status')
      .eq('id', user.id)
      .single();

    if (profile?.account_status === 'pending') {
      const url = request.nextUrl.clone();
      url.pathname = '/pending-approval';
      return NextResponse.redirect(url);
    }

    if (profile?.account_status === 'suspended') {
      // Sign them out and redirect to login
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
