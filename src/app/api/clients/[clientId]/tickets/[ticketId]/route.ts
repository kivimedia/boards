import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

interface Params {
  params: { clientId: string; ticketId: string };
}

/**
 * GET /api/clients/[clientId]/tickets/[ticketId]
 * Get a single ticket by ID.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  try {
    const { data, error } = await supabase
      .from('client_tickets')
      .select('*')
      .eq('id', params.ticketId)
      .eq('client_id', params.clientId)
      .single();

    if (error || !data) {
      return errorResponse('Ticket not found', 404);
    }

    return successResponse(data);
  } catch (err) {
    return errorResponse(
      `Failed to fetch ticket: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}

interface UpdateTicketBody {
  status?: string;
}

/**
 * PATCH /api/clients/[clientId]/tickets/[ticketId]
 * Update a ticket's status.
 *
 * Body:
 *   status?: string
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<UpdateTicketBody>(request);
  if (!body.ok) return body.response;

  const { status } = body.body;
  if (!status) return errorResponse('status is required');

  const { supabase } = auth.ctx;

  try {
    const { data, error } = await supabase
      .from('client_tickets')
      .update({ status })
      .eq('id', params.ticketId)
      .eq('client_id', params.clientId)
      .select()
      .single();

    if (error) {
      return errorResponse(error.message, 500);
    }

    if (!data) {
      return errorResponse('Ticket not found', 404);
    }

    return successResponse(data);
  } catch (err) {
    return errorResponse(
      `Failed to update ticket: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}
