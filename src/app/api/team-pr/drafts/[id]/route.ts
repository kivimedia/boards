import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

/**
 * GET /api/team-pr/drafts/[id]
 * Single draft with outlet info
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { id } = params;

  const { data, error } = await supabase
    .from('pr_email_drafts')
    .select(`
      *,
      outlet:pr_outlets(id, name, outlet_code, contact_name, contact_email, website_url),
      run:pr_runs!inner(id, user_id, client_id, status)
    `)
    .eq('id', id)
    .eq('run.user_id', userId)
    .single();

  if (error) return errorResponse('Draft not found', 404);
  return successResponse(data);
}

/**
 * PATCH /api/team-pr/drafts/[id]
 * Edit draft text (subject, body_html, body_text). Increment revision_count.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<{
    subject?: string;
    body_html?: string;
    body_text?: string;
  }>(request);
  if (!body.ok) return body.response;

  const { supabase, userId } = auth.ctx;
  const { id } = params;

  // Verify ownership via run
  const { data: draft, error: checkError } = await supabase
    .from('pr_email_drafts')
    .select('id, revision_count, run:pr_runs!inner(user_id)')
    .eq('id', id)
    .eq('run.user_id', userId)
    .single();

  if (checkError || !draft) return errorResponse('Draft not found', 404);

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    revision_count: (draft.revision_count || 0) + 1,
  };

  if (body.body.subject !== undefined) updates.subject = body.body.subject;
  if (body.body.body_html !== undefined) updates.body_html = body.body.body_html;
  if (body.body.body_text !== undefined) updates.body_text = body.body.body_text;

  const { data, error } = await supabase
    .from('pr_email_drafts')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}
