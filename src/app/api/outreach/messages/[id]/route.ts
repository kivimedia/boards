import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { checkMessageQuality } from '@/lib/outreach/message-quality';

/**
 * PATCH /api/outreach/messages/[id] - Update a message's text
 *
 * Body: { message_text: string }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { id } = await params;

  let body: { message_text: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  if (!body.message_text?.trim()) {
    return errorResponse('message_text is required', 400);
  }

  // Re-run quality check on updated text
  const qualityCheck = checkMessageQuality(body.message_text);

  const { data: message, error } = await supabase
    .from('li_outreach_messages')
    .update({
      message_text: body.message_text,
      quality_check: qualityCheck,
      quality_passed: qualityCheck.passed,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  if (!message) return errorResponse('Message not found', 404);

  return successResponse({ message });
}
