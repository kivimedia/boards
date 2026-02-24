import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

interface Params {
  params: { id: string };
}

interface RejectBody {
  reason?: string;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<RejectBody>(request);
  if (!body.ok) return body.response;

  const { supabase, userId } = auth.ctx;
  const proposalId = params.id;

  // Fetch the current draft
  const { data: draft, error: fetchError } = await supabase
    .from('proposal_drafts')
    .select('id, status')
    .eq('id', proposalId)
    .single();

  if (fetchError || !draft) return errorResponse('Proposal draft not found', 404);
  if (draft.status !== 'draft') return errorResponse(`Cannot reject a proposal with status "${draft.status}"`, 400);

  const { data, error } = await supabase
    .from('proposal_drafts')
    .update({
      status: 'rejected',
      modifications: { rejected_by: userId, reason: body.body.reason || null },
    })
    .eq('id', proposalId)
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}
