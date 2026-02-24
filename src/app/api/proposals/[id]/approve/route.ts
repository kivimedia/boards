import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

interface Params {
  params: { id: string };
}

interface ApproveBody {
  send_via?: 'gmail_draft' | 'gmail_direct' | 'manual';
  modifications?: {
    line_items?: unknown[];
    email_subject?: string;
    email_body?: string;
    total_amount?: number;
  };
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<ApproveBody>(request);
  if (!body.ok) return body.response;

  const { supabase, userId } = auth.ctx;
  const proposalId = params.id;

  // Fetch the current draft
  const { data: draft, error: fetchError } = await supabase
    .from('proposal_drafts')
    .select('*')
    .eq('id', proposalId)
    .single();

  if (fetchError || !draft) return errorResponse('Proposal draft not found', 404);
  if (draft.status !== 'draft') return errorResponse(`Cannot approve a proposal with status "${draft.status}"`, 400);

  // Build update payload
  const updates: Record<string, unknown> = {
    status: 'approved',
    approved_by: userId,
  };

  if (body.body.send_via) {
    updates.sent_via = body.body.send_via;
  }

  if (body.body.modifications) {
    updates.modifications = body.body.modifications;
    if (body.body.modifications.line_items) {
      updates.line_items = body.body.modifications.line_items;
    }
    if (body.body.modifications.email_subject) {
      updates.email_subject = body.body.modifications.email_subject;
    }
    if (body.body.modifications.email_body) {
      updates.email_body = body.body.modifications.email_body;
    }
    if (body.body.modifications.total_amount !== undefined) {
      updates.total_amount = body.body.modifications.total_amount;
    }
  }

  const { data, error } = await supabase
    .from('proposal_drafts')
    .update(updates)
    .eq('id', proposalId)
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}
