import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getClientEmails, createEmail } from '@/lib/client-emails';
import type { EmailStatus, EmailTone } from '@/lib/types';

interface Params {
  params: { clientId: string };
}

// GET /api/clients/[clientId]/emails — list emails with optional ?status= filter
export async function GET(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') as EmailStatus | null;

  const validStatuses: EmailStatus[] = ['draft', 'approved', 'sent', 'failed'];
  if (status && !validStatuses.includes(status)) {
    return errorResponse('Invalid status filter. Must be draft, approved, sent, or failed.');
  }

  const emails = await getClientEmails(supabase, params.clientId, status ?? undefined);
  return successResponse(emails);
}

// POST /api/clients/[clientId]/emails — manually create an email
interface CreateEmailBody {
  subject: string;
  body: string;
  tone?: EmailTone;
  recipients: string[];
  cc?: string[];
  scheduledFor?: string;
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<CreateEmailBody>(request);
  if (!parsed.ok) return parsed.response;

  const { subject, body, tone, recipients, cc, scheduledFor } = parsed.body;

  if (!subject?.trim()) return errorResponse('Subject is required');
  if (!body?.trim()) return errorResponse('Body is required');
  if (!recipients || recipients.length === 0) return errorResponse('At least one recipient is required');

  const { supabase, userId } = auth.ctx;
  const email = await createEmail(supabase, params.clientId, {
    subject: subject.trim(),
    body: body.trim(),
    tone,
    recipients,
    cc,
    draftedBy: userId,
    aiGenerated: false,
    scheduledFor,
  });

  if (!email) return errorResponse('Failed to create email', 500);
  return successResponse(email, 201);
}
