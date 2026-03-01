import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthContext } from '@/lib/api-helpers';
import { validateApiKey, hasPermission } from '@/lib/public-api';
import type { ApiKeyPermission } from '@/lib/types';

interface PageForgeAuthResult {
  ok: true;
  ctx: {
    supabase: any;
    userId: string;
  };
}

interface PageForgeAuthError {
  ok: false;
  response: NextResponse;
}

/**
 * Authenticate a PageForge API request.
 * Tries three methods in order:
 * 1. API key (Bearer ab_...) - permanent, never expires
 * 2. Supabase JWT (Bearer <jwt>) - 1-hour expiry
 * 3. Cookie session - web app requests
 */
export async function getPageForgeAuth(
  request: NextRequest,
  requiredPermission: ApiKeyPermission = 'pageforge:write',
): Promise<PageForgeAuthResult | PageForgeAuthError> {
  const authHeader = request.headers.get('authorization');

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);

    // --- API key path (ab_ prefix) ---
    if (token.startsWith('ab_')) {
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!serviceKey) {
        return {
          ok: false,
          response: NextResponse.json(
            { error: 'Server misconfigured - missing service role key' },
            { status: 500 },
          ),
        };
      }

      const serviceSupabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceKey,
      );

      const apiKey = await validateApiKey(serviceSupabase, token);
      if (!apiKey) {
        return {
          ok: false,
          response: NextResponse.json(
            { error: 'Invalid or expired API key' },
            { status: 401 },
          ),
        };
      }

      if (!hasPermission(apiKey, requiredPermission)) {
        return {
          ok: false,
          response: NextResponse.json(
            { error: `API key missing required permission: ${requiredPermission}` },
            { status: 403 },
          ),
        };
      }

      return {
        ok: true,
        ctx: { supabase: serviceSupabase, userId: apiKey.user_id },
      };
    }

    // --- JWT path ---
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return {
        ok: false,
        response: NextResponse.json({ error: 'Invalid token' }, { status: 401 }),
      };
    }

    return { ok: true, ctx: { supabase, userId: user.id } };
  }

  // --- Cookie path (web app) ---
  return getAuthContext();
}
