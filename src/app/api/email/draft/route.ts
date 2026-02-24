import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getValidAccessToken } from '@/lib/google/token-manager';
import { createDraft } from '@/lib/google/gmail';

interface CreateDraftBody {
  to: string;
  subject: string;
  body: string;
}

export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<CreateDraftBody>(request);
  if (!parsed.ok) return parsed.response;

  const { to, subject, body } = parsed.body;
  if (!to || !subject || !body) {
    return errorResponse('to, subject, and body are required');
  }

  const { supabase, userId } = auth.ctx;

  try {
    const accessToken = await getValidAccessToken(supabase, userId);
    if (!accessToken) return errorResponse('Google not connected', 401);

    const draft = await createDraft(accessToken, to, subject, body);
    return successResponse({ draftId: draft.id, messageId: draft.message.id });
  } catch (err) {
    return errorResponse((err as Error).message, 500);
  }
}
