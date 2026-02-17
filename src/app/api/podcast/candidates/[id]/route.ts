import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import type { PGACandidateStatus, PGAConfidence } from '@/lib/types';

/**
 * GET /api/podcast/candidates/[id]
 * Get a single candidate with their email sequences
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { id } = params;

  const { data: candidate, error } = await supabase
    .from('pga_candidates')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return errorResponse('Candidate not found', 404);

  // Also fetch email sequences for this candidate
  const { data: sequences } = await supabase
    .from('pga_email_sequences')
    .select('*')
    .eq('candidate_id', id)
    .order('created_at', { ascending: false });

  return successResponse({ ...candidate, email_sequences: sequences || [] });
}

/**
 * PATCH /api/podcast/candidates/[id]
 * Update candidate fields (status changes, review actions, etc.)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<{
    name?: string;
    one_liner?: string;
    email?: string;
    email_verified?: boolean;
    platform_presence?: Record<string, string>;
    evidence_of_paid_work?: Array<{ project: string; description: string; url?: string }>;
    estimated_reach?: Record<string, number>;
    tools_used?: string[];
    contact_method?: string;
    scout_confidence?: PGAConfidence;
    source?: Record<string, string>;
    status?: PGACandidateStatus;
    rejection_reason?: string;
    notes?: string;
  }>(request);
  if (!body.ok) return body.response;

  const { supabase } = auth.ctx;
  const { id } = params;
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  // Build update object from provided fields
  const allowedFields = [
    'name', 'one_liner', 'email', 'email_verified',
    'platform_presence', 'evidence_of_paid_work', 'estimated_reach',
    'tools_used', 'contact_method', 'scout_confidence', 'source',
    'status', 'rejection_reason', 'notes',
  ] as const;

  for (const field of allowedFields) {
    if (body.body[field] !== undefined) {
      updates[field] = body.body[field];
    }
  }

  // If status is changing to 'approved' or 'rejected', stamp review metadata
  if (body.body.status === 'approved' || body.body.status === 'rejected') {
    updates.reviewed_by = auth.ctx.userId;
    updates.reviewed_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('pga_candidates')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}

/**
 * DELETE /api/podcast/candidates/[id]
 * Delete a candidate (cascades to email sequences)
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { id } = params;

  const { error } = await supabase
    .from('pga_candidates')
    .delete()
    .eq('id', id);

  if (error) return errorResponse(error.message, 500);
  return successResponse({ deleted: true });
}
