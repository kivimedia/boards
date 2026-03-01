import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/meetings/routing-rules
 * List all Fathom routing rules, ordered by priority descending.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from('fathom_routing_rules')
    .select('*')
    .order('priority', { ascending: false });

  if (error) {
    return errorResponse(error.message, 500);
  }

  return NextResponse.json({ rules: data });
}

/**
 * POST /api/meetings/routing-rules
 * Create a new routing rule.
 * Body: { rule_type, conditions, target_client_id?, target_card_id?, priority?, enabled? }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  let body: {
    rule_type: string;
    conditions: Record<string, unknown>;
    target_client_id?: string;
    target_card_id?: string;
    priority?: number;
    enabled?: boolean;
  };

  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  if (!body.rule_type || !body.conditions) {
    return errorResponse('rule_type and conditions are required', 400);
  }

  const { data, error } = await supabase
    .from('fathom_routing_rules')
    .insert({
      rule_type: body.rule_type,
      conditions: body.conditions,
      target_client_id: body.target_client_id || null,
      target_card_id: body.target_card_id || null,
      priority: body.priority ?? 0,
      enabled: body.enabled ?? true,
    })
    .select()
    .single();

  if (error) {
    return errorResponse(error.message, 500);
  }

  return NextResponse.json({ rule: data }, { status: 201 });
}
