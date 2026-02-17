import { SupabaseClient } from '@supabase/supabase-js';
import type {
  ClientBoard,
  ClientPortalUser,
  ClientTicket,
  ClientTicketType,
  SatisfactionResponse,
  BoardType,
} from './types';

// ============================================================================
// TICKET TYPE → BOARD TYPE ROUTING MAP
// ============================================================================

export const TICKET_ROUTING_MAP: Record<ClientTicketType, BoardType> = {
  design: 'graphic_designer',
  bug: 'dev',
  dev: 'dev',
  content: 'copy',
  video: 'video_editor',
  general: 'account_manager',
};

export const TICKET_TYPE_LABELS: Record<ClientTicketType, string> = {
  design: 'Design Request',
  bug: 'Bug Report',
  dev: 'Development Request',
  content: 'Content Request',
  video: 'Video Request',
  general: 'General Request',
};

export const CLIENT_STATUS_LABELS: Record<string, string> = {
  in_progress: 'In Progress',
  ready_for_review: 'Ready for Review',
  approved: 'Approved',
  delivered: 'Delivered',
  revision_requested: 'Revision Requested',
};

// ============================================================================
// CLIENT BOARD MANAGEMENT
// ============================================================================

/**
 * Link a board to a client for portal visibility.
 */
export async function linkClientBoard(
  supabase: SupabaseClient,
  clientId: string,
  boardId: string
): Promise<ClientBoard | null> {
  const { data, error } = await supabase
    .from('client_boards')
    .upsert({ client_id: clientId, board_id: boardId, is_active: true })
    .select()
    .single();

  if (error) return null;
  return data as ClientBoard;
}

/**
 * Get all boards linked to a client.
 */
export async function getClientBoards(
  supabase: SupabaseClient,
  clientId: string
): Promise<ClientBoard[]> {
  const { data } = await supabase
    .from('client_boards')
    .select('*')
    .eq('client_id', clientId)
    .eq('is_active', true);

  return (data as ClientBoard[]) ?? [];
}

// ============================================================================
// CLIENT PORTAL USER MANAGEMENT
// ============================================================================

/**
 * Create or update a client portal user.
 */
export async function upsertPortalUser(
  supabase: SupabaseClient,
  clientId: string,
  email: string,
  name: string,
  isPrimary: boolean = false
): Promise<ClientPortalUser | null> {
  const { data, error } = await supabase
    .from('client_portal_users')
    .upsert(
      { client_id: clientId, email, name, is_primary_contact: isPrimary },
      { onConflict: 'client_id,email' }
    )
    .select()
    .single();

  if (error) {
    // Fallback: insert without upsert
    const { data: inserted, error: insertErr } = await supabase
      .from('client_portal_users')
      .insert({ client_id: clientId, email, name, is_primary_contact: isPrimary })
      .select()
      .single();

    if (insertErr) return null;
    return inserted as ClientPortalUser;
  }

  return data as ClientPortalUser;
}

/**
 * Get portal users for a client.
 */
export async function getPortalUsers(
  supabase: SupabaseClient,
  clientId: string
): Promise<ClientPortalUser[]> {
  const { data } = await supabase
    .from('client_portal_users')
    .select('*')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .order('is_primary_contact', { ascending: false });

  return (data as ClientPortalUser[]) ?? [];
}

/**
 * Send a magic link to a client portal user.
 */
export async function sendMagicLink(
  supabase: SupabaseClient,
  email: string,
  redirectTo: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ============================================================================
// TICKET ROUTING
// ============================================================================

/**
 * Submit a client ticket and route it to the appropriate department board.
 */
export async function submitClientTicket(
  supabase: SupabaseClient,
  clientId: string,
  submittedBy: string,
  ticket: {
    ticket_type: ClientTicketType;
    title: string;
    description?: string;
    priority?: string;
    attachments?: unknown[];
  }
): Promise<ClientTicket | null> {
  // 1. Create the ticket
  const { data: newTicket, error: ticketErr } = await supabase
    .from('client_tickets')
    .insert({
      client_id: clientId,
      submitted_by: submittedBy,
      ticket_type: ticket.ticket_type,
      title: ticket.title,
      description: ticket.description ?? null,
      priority: ticket.priority ?? 'medium',
      attachments: ticket.attachments ?? [],
    })
    .select()
    .single();

  if (ticketErr || !newTicket) return null;

  // 2. Find the target board based on ticket type
  const targetBoardType = TICKET_ROUTING_MAP[ticket.ticket_type];
  const { data: boards } = await supabase
    .from('boards')
    .select('id')
    .eq('board_type', targetBoardType)
    .limit(1);

  if (!boards || boards.length === 0) {
    return newTicket as ClientTicket;
  }

  const targetBoardId = boards[0].id;

  // 3. Find the first list (intake/backlog) on the target board
  const { data: lists } = await supabase
    .from('lists')
    .select('id')
    .eq('board_id', targetBoardId)
    .order('position', { ascending: true })
    .limit(1);

  if (!lists || lists.length === 0) {
    return newTicket as ClientTicket;
  }

  // 4. Create a card on the target board
  const { data: card } = await supabase
    .from('cards')
    .insert({
      title: `[Client] ${ticket.title}`,
      description: ticket.description ?? '',
      priority: ticket.priority ?? 'medium',
      client_id: clientId,
      is_client_visible: true,
      client_status: 'in_progress',
      client_ticket_type: ticket.ticket_type,
      approval_status: 'pending',
      created_by: submittedBy,
    })
    .select('id')
    .single();

  if (!card) return newTicket as ClientTicket;

  // 5. Place the card on the board
  await supabase.from('card_placements').insert({
    card_id: card.id,
    list_id: lists[0].id,
    position: 0,
  });

  // 6. Update ticket with routing info
  await supabase
    .from('client_tickets')
    .update({
      status: 'routed',
      routed_to_card_id: card.id,
      routed_to_board_id: targetBoardId,
    })
    .eq('id', newTicket.id);

  return {
    ...newTicket,
    status: 'routed',
    routed_to_card_id: card.id,
    routed_to_board_id: targetBoardId,
  } as ClientTicket;
}

/**
 * Get client tickets.
 */
export async function getClientTickets(
  supabase: SupabaseClient,
  clientId: string,
  status?: string
): Promise<ClientTicket[]> {
  let query = supabase
    .from('client_tickets')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);

  const { data } = await query;
  return (data as ClientTicket[]) ?? [];
}

/**
 * Get client-visible cards for the client portal kanban.
 */
export async function getClientVisibleCards(
  supabase: SupabaseClient,
  clientId: string
): Promise<unknown[]> {
  const { data } = await supabase
    .from('cards')
    .select('id, title, description, priority, client_status, client_ticket_type, approval_status, created_at, updated_at')
    .eq('client_id', clientId)
    .eq('is_client_visible', true)
    .order('updated_at', { ascending: false });

  return data ?? [];
}

// ============================================================================
// SATISFACTION
// ============================================================================

/**
 * Submit a satisfaction response.
 */
export async function submitSatisfaction(
  supabase: SupabaseClient,
  clientId: string,
  submittedBy: string,
  cardId: string | null,
  rating: number,
  feedback?: string
): Promise<SatisfactionResponse | null> {
  const { data, error } = await supabase
    .from('satisfaction_responses')
    .insert({
      client_id: clientId,
      submitted_by: submittedBy,
      card_id: cardId,
      rating: Math.min(5, Math.max(1, rating)),
      feedback: feedback ?? null,
    })
    .select()
    .single();

  if (error) return null;
  return data as SatisfactionResponse;
}

/**
 * Get average satisfaction for a client.
 */
export async function getClientSatisfaction(
  supabase: SupabaseClient,
  clientId: string
): Promise<{ average: number; count: number }> {
  const { data } = await supabase
    .from('satisfaction_responses')
    .select('rating')
    .eq('client_id', clientId);

  if (!data || data.length === 0) return { average: 0, count: 0 };

  const sum = data.reduce((acc, r) => acc + r.rating, 0);
  return {
    average: Math.round((sum / data.length) * 10) / 10,
    count: data.length,
  };
}
