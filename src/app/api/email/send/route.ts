import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getValidAccessToken } from '@/lib/google/token-manager';
import { sendEmail, sendDraft } from '@/lib/google/gmail';

interface SendEmailBody {
  to?: string;
  subject?: string;
  body?: string;
  draftId?: string;
}

export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<SendEmailBody>(request);
  if (!parsed.ok) return parsed.response;

  const { supabase, userId } = auth.ctx;

  try {
    const accessToken = await getValidAccessToken(supabase, userId);
    if (!accessToken) return errorResponse('Google not connected', 401);

    // Option 1: Send an existing draft
    if (parsed.body.draftId) {
      const result = await sendDraft(accessToken, parsed.body.draftId);
      return successResponse({ messageId: result.id, threadId: result.threadId });
    }

    // Option 2: Send a new email directly
    const { to, subject, body } = parsed.body;
    if (!to || !subject || !body) {
      return errorResponse('Either draftId or (to, subject, body) are required');
    }

    const result = await sendEmail(accessToken, to, subject, body);
    return successResponse({ messageId: result.id, threadId: result.threadId });
  } catch (err) {
    return errorResponse((err as Error).message, 500);
  }
}
