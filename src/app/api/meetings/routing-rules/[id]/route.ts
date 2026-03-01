import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/meetings/routing-rules/[id]
 * Update a routing rule. Body: partial update fields.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const ruleId = params.id;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  // Only allow updating known fields
  const allowedFields = [
    'rule_type',
    'conditions',
    'target_client_id',
    'target_card_id',
    'priority',
    'enabled',
    'dry_run',
  ];

  const updates: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in body) {
      updates[key] = body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return errorResponse('No valid fields to update', 400);
  }

  const { data, error } = await supabase
    .from('fathom_routing_rules')
    .update(updates)
    .eq('id', ruleId)
    .select()
    .single();

  if (error) {
    return errorResponse(error.message, 500);
  }

  if (!data) {
    return errorResponse('Routing rule not found', 404);
  }

  return NextResponse.json({ rule: data });
}

/**
 * DELETE /api/meetings/routing-rules/[id]
 * Delete a routing rule by id.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const ruleId = params.id;

  const { error } = await supabase
    .from('fathom_routing_rules')
    .delete()
    .eq('id', ruleId);

  if (error) {
    return errorResponse(error.message, 500);
  }

  return NextResponse.json({ success: true });
}
