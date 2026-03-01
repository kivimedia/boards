import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // CORS preflight for PageForge API routes (Figma plugin calls these)
  if (pathname.startsWith('/api/pageforge/') && request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  }

  const response = await updateSession(request);

  // Add CORS headers to PageForge API responses
  if (pathname.startsWith('/api/pageforge/')) {
    Object.entries(CORS_HEADERS).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
