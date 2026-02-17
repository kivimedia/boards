import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getClientTickets, submitClientTicket } from '@/lib/client-portal';
import type { ClientTicketType } from '@/lib/types';

interface Params {
  params: { clientId: string };
}

/**
 * GET /api/clients/[clientId]/tickets
 * Get tickets for a client. Supports optional ?status= query param.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') ?? undefined;

  try {
    const tickets = await getClientTickets(supabase, params.clientId, status);
    return successResponse(tickets);
  } catch (err) {
    return errorResponse(
      `Failed to fetch tickets: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}

interface SubmitTicketBody {
  ticket_type: ClientTicketType;
  title: string;
  description?: string;
  priority?: string;
  attachments?: unknown[];
}

/**
 * POST /api/clients/[clientId]/tickets
 * Submit a new client ticket and route it to the appropriate board.
 *
 * Body:
 *   ticket_type: ClientTicketType (required)
 *   title: string (required)
 *   description?: string
 *   priority?: string
 *   attachments?: unknown[]
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<SubmitTicketBody>(request);
  if (!body.ok) return body.response;

  const { ticket_type, title, description, priority, attachments } = body.body;
  if (!ticket_type) return errorResponse('ticket_type is required');
  if (!title) return errorResponse('title is required');

  const { supabase, userId } = auth.ctx;

  try {
    const ticket = await submitClientTicket(supabase, params.clientId, userId, {
      ticket_type,
      title,
      description,
      priority,
      attachments,
    });

    if (!ticket) {
      return errorResponse('Failed to submit ticket', 500);
    }

    return successResponse(ticket, 201);
  } catch (err) {
    return errorResponse(
      `Failed to submit ticket: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}
