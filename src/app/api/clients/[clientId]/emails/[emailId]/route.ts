import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getClientEmail, updateEmail } from '@/lib/client-emails';
import type { EmailTone, EmailStatus } from '@/lib/types';

interface Params {
  params: { clientId: string; emailId: string };
}

// GET /api/clients/[clientId]/emails/[emailId] — fetch a single email
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const email = await getClientEmail(supabase, params.emailId);

  if (!email) return errorResponse('Email not found', 404);
  if (email.client_id !== params.clientId) return errorResponse('Email not found', 404);

  return successResponse(email);
}

// PATCH /api/clients/[clientId]/emails/[emailId] — update an email
interface UpdateEmailBody {
  subject?: string;
  body?: string;
  tone?: EmailTone;
  recipients?: string[];
  cc?: string[];
  status?: EmailStatus;
  scheduled_for?: string | null;
  approved_by?: string | null;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<UpdateEmailBody>(request);
  if (!parsed.ok) return parsed.response;

  const { supabase } = auth.ctx;

  // Verify email belongs to this client
  const existing = await getClientEmail(supabase, params.emailId);
  if (!existing) return errorResponse('Email not found', 404);
  if (existing.client_id !== params.clientId) return errorResponse('Email not found', 404);

  const updates: Record<string, unknown> = {};
  const { subject, body, tone, recipients, cc, status, scheduled_for, approved_by } = parsed.body;

  if (subject !== undefined) updates.subject = subject.trim();
  if (body !== undefined) updates.body = body.trim();
  if (tone !== undefined) updates.tone = tone;
  if (recipients !== undefined) updates.recipients = recipients;
  if (cc !== undefined) updates.cc = cc;
  if (status !== undefined) updates.status = status;
  if (scheduled_for !== undefined) updates.scheduled_for = scheduled_for;
  if (approved_by !== undefined) updates.approved_by = approved_by;

  if (Object.keys(updates).length === 0) {
    return errorResponse('No valid fields to update');
  }

  const updated = await updateEmail(supabase, params.emailId, updates);
  if (!updated) return errorResponse('Failed to update email', 500);
  return successResponse(updated);
}

// DELETE /api/clients/[clientId]/emails/[emailId] — delete an email
export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  // Verify email belongs to this client
  const existing = await getClientEmail(supabase, params.emailId);
  if (!existing) return errorResponse('Email not found', 404);
  if (existing.client_id !== params.clientId) return errorResponse('Email not found', 404);

  const { error } = await supabase
    .from('client_emails')
    .delete()
    .eq('id', params.emailId)
    .eq('client_id', params.clientId);

  if (error) return errorResponse(error.message, 500);
  return successResponse({ deleted: true });
}
