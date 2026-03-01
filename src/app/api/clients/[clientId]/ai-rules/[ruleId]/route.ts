import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';

interface Params {
  params: { clientId: string; ruleId: string };
}

interface UpdateRuleBody {
  rule_text?: string;
  rule_type?: string;
  priority?: number;
  enabled?: boolean;
  is_global?: boolean;
}

/**
 * PATCH /api/clients/[clientId]/ai-rules/[ruleId]
 * Update an existing AI rule.
 *
 * Body (all fields optional):
 *   rule_text?: string
 *   rule_type?: string
 *   priority?: number
 *   enabled?: boolean
 *   is_global?: boolean
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { ruleId } = params;

  let body: UpdateRuleBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  // Build update object from provided fields only
  const updates: Record<string, unknown> = {};
  if (body.rule_text !== undefined) updates.rule_text = body.rule_text;
  if (body.rule_type !== undefined) updates.rule_type = body.rule_type;
  if (body.priority !== undefined) updates.priority = body.priority;
  if (body.enabled !== undefined) updates.enabled = body.enabled;
  if (body.is_global !== undefined) updates.is_global = body.is_global;

  if (Object.keys(updates).length === 0) {
    return errorResponse('No fields to update');
  }

  try {
    const { data, error } = await supabase
      .from('client_ai_rules')
      .update(updates)
      .eq('id', ruleId)
      .select()
      .single();

    if (error) {
      return errorResponse(`Failed to update AI rule: ${error.message}`, 500);
    }

    if (!data) {
      return errorResponse('AI rule not found', 404);
    }

    return NextResponse.json({ data });
  } catch (err) {
    return errorResponse(
      `Failed to update AI rule: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}

/**
 * DELETE /api/clients/[clientId]/ai-rules/[ruleId]
 * Delete an AI rule.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { ruleId } = params;

  try {
    const { error } = await supabase
      .from('client_ai_rules')
      .delete()
      .eq('id', ruleId);

    if (error) {
      return errorResponse(`Failed to delete AI rule: ${error.message}`, 500);
    }

    return NextResponse.json({ data: { deleted: true } });
  } catch (err) {
    return errorResponse(
      `Failed to delete AI rule: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}
