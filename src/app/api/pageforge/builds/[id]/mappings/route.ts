import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api-helpers';
import { getPageForgeAuth } from '@/lib/pageforge-auth';

/**
 * GET /api/pageforge/builds/[id]/mappings
 * Fetch all element mapping proposals for a build.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getPageForgeAuth(request, 'pageforge:read');
  if (!auth.ok) return auth.response;

  const buildId = params.id;

  const { data: mappings, error } = await auth.ctx.supabase
    .from('pageforge_build_mappings')
    .select('*')
    .eq('build_id', buildId)
    .order('section_index', { ascending: true });

  if (error) return errorResponse(error.message, 500);

  return NextResponse.json({ mappings: mappings || [] });
}

/**
 * POST /api/pageforge/builds/[id]/mappings
 * Save AI mapping proposals (called by VPS worker).
 * Body: { mappings: [{ section_index, section_name, figma_element_type, proposed_divi5_module, proposed_config, proposal_reasoning }] }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getPageForgeAuth(request, 'pageforge:write');
  if (!auth.ok) return auth.response;

  const buildId = params.id;
  const body = await request.json();
  const { mappings } = body;

  if (!Array.isArray(mappings) || mappings.length === 0) {
    return errorResponse('mappings array is required');
  }

  const rows = mappings.map((m: any) => ({
    build_id: buildId,
    section_index: m.section_index,
    section_name: m.section_name,
    figma_element_type: m.figma_element_type,
    proposed_divi5_module: m.proposed_divi5_module,
    proposed_config: m.proposed_config || {},
    proposal_reasoning: m.proposal_reasoning || null,
    decision: 'pending',
  }));

  const { data, error } = await auth.ctx.supabase
    .from('pageforge_build_mappings')
    .insert(rows)
    .select();

  if (error) return errorResponse(error.message, 500);

  return NextResponse.json({ mappings: data }, { status: 201 });
}

/**
 * PATCH /api/pageforge/builds/[id]/mappings
 * Approve or override individual mappings.
 * Body: { mappingId, decision: 'approved' | 'overridden', final_divi5_module?, final_config?, override_reason? }
 * OR: { approveAll: true } to bulk approve all pending mappings.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getPageForgeAuth(request, 'pageforge:write');
  if (!auth.ok) return auth.response;

  const buildId = params.id;
  const body = await request.json();

  // Bulk approve all
  if (body.approveAll) {
    const { error } = await auth.ctx.supabase
      .from('pageforge_build_mappings')
      .update({
        decision: 'approved',
        decided_by: auth.ctx.userId,
        decided_at: new Date().toISOString(),
      })
      .eq('build_id', buildId)
      .eq('decision', 'pending');

    if (error) return errorResponse(error.message, 500);
    return NextResponse.json({ ok: true });
  }

  // Single mapping update
  const { mappingId, decision, final_divi5_module, final_config, override_reason } = body;

  if (!mappingId || !decision) {
    return errorResponse('mappingId and decision are required');
  }

  const updatePayload: Record<string, unknown> = {
    decision,
    decided_by: auth.ctx.userId,
    decided_at: new Date().toISOString(),
  };

  if (decision === 'overridden') {
    updatePayload.final_divi5_module = final_divi5_module;
    updatePayload.final_config = final_config || {};
    updatePayload.override_reason = override_reason || null;
  }

  const { error } = await auth.ctx.supabase
    .from('pageforge_build_mappings')
    .update(updatePayload)
    .eq('id', mappingId)
    .eq('build_id', buildId);

  if (error) return errorResponse(error.message, 500);

  // If overridden, upsert to knowledge base for future learning
  if (decision === 'overridden' && final_divi5_module) {
    const { data: mapping } = await auth.ctx.supabase
      .from('pageforge_build_mappings')
      .select('figma_element_type, proposed_divi5_module')
      .eq('id', mappingId)
      .single();

    if (mapping) {
      // Get site profile ID from build
      const { data: build } = await auth.ctx.supabase
        .from('pageforge_builds')
        .select('site_profile_id')
        .eq('id', buildId)
        .single();

      if (build) {
        // Upsert knowledge base entry
        const { data: existing } = await auth.ctx.supabase
          .from('pageforge_element_mappings')
          .select('id, times_approved, times_overridden')
          .eq('site_profile_id', build.site_profile_id)
          .eq('figma_element_type', mapping.figma_element_type)
          .eq('divi5_module', final_divi5_module)
          .maybeSingle();

        if (existing) {
          const newOverridden = (existing.times_overridden || 0) + 1;
          const newApproved = existing.times_approved || 0;
          const confidence = newApproved / (newApproved + newOverridden + 1);

          await auth.ctx.supabase
            .from('pageforge_element_mappings')
            .update({
              times_overridden: newOverridden,
              confidence_score: Math.round(confidence * 100) / 100,
              was_overridden: true,
              override_reason,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
        } else {
          await auth.ctx.supabase
            .from('pageforge_element_mappings')
            .insert({
              site_profile_id: build.site_profile_id,
              figma_element_type: mapping.figma_element_type,
              divi5_module: final_divi5_module,
              divi5_config: final_config || {},
              was_overridden: true,
              override_reason,
              confidence_score: 0.50,
              times_overridden: 1,
            });
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}
