import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';

interface Params {
  params: { clientId: string };
}

/**
 * GET /api/clients/[clientId]/ai-rules
 * List AI rules for a client (including global rules), ordered by priority desc.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { clientId } = params;

  try {
    const { data, error } = await supabase
      .from('client_ai_rules')
      .select('*')
      .or(`client_id.eq.${clientId},is_global.eq.true`)
      .order('priority', { ascending: false });

    if (error) {
      return errorResponse(`Failed to fetch AI rules: ${error.message}`, 500);
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    return errorResponse(
      `Failed to fetch AI rules: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}

interface CreateRuleBody {
  rule_text: string;
  rule_type?: string;
  priority?: number;
  is_global?: boolean;
}

/**
 * POST /api/clients/[clientId]/ai-rules
 * Create a new AI rule for a client.
 *
 * Body:
 *   rule_text: string (required)
 *   rule_type?: string (default 'summary')
 *   priority?: number (default 0)
 *   is_global?: boolean (default false)
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { clientId } = params;

  let body: CreateRuleBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  if (!body.rule_text || typeof body.rule_text !== 'string' || !body.rule_text.trim()) {
    return errorResponse('rule_text is required');
  }

  try {
    const { data, error } = await supabase
      .from('client_ai_rules')
      .insert({
        client_id: clientId,
        rule_text: body.rule_text.trim(),
        rule_type: body.rule_type ?? 'summary',
        priority: body.priority ?? 0,
        is_global: body.is_global ?? false,
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      return errorResponse(`Failed to create AI rule: ${error.message}`, 500);
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    return errorResponse(
      `Failed to create AI rule: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}
