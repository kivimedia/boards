import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api-helpers';
import { getPageForgeAuth } from '@/lib/pageforge-auth';

/**
 * PATCH /api/pageforge/mappings/[id]
 * Update a knowledge base mapping.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getPageForgeAuth(request, 'pageforge:write');
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.figma_element_type !== undefined) update.figma_element_type = body.figma_element_type;
  if (body.divi5_module !== undefined) update.divi5_module = body.divi5_module;
  if (body.divi5_config !== undefined) update.divi5_config = body.divi5_config;
  if (body.confidence_score !== undefined) update.confidence_score = body.confidence_score;

  const { data, error } = await auth.ctx.supabase
    .from('pageforge_element_mappings')
    .update(update)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);

  return NextResponse.json({ mapping: data });
}

/**
 * DELETE /api/pageforge/mappings/[id]
 * Delete a knowledge base mapping.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getPageForgeAuth(request, 'pageforge:write');
  if (!auth.ok) return auth.response;

  const { error } = await auth.ctx.supabase
    .from('pageforge_element_mappings')
    .delete()
    .eq('id', params.id);

  if (error) return errorResponse(error.message, 500);

  return NextResponse.json({ ok: true });
}
