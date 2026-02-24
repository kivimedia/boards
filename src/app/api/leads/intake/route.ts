import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { triageLead } from '@/lib/lead-triage';

export const maxDuration = 60;

/**
 * Lead intake webhook.
 *
 * Called by WordPress forms (WPForms, Gravity Forms, etc.) when a new inquiry
 * is submitted. Creates a card on the appropriate board and runs triage.
 *
 * Authentication: uses a shared webhook secret instead of user auth.
 */
export async function POST(request: NextRequest) {
  // Validate webhook secret
  const secret = request.headers.get('x-webhook-secret') || new URL(request.url).searchParams.get('secret');
  const expectedSecret = process.env.LEAD_WEBHOOK_SECRET;

  if (!expectedSecret || secret !== expectedSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  // Extract fields from various form formats
  const name = getString(body, ['name', 'full_name', 'client_name', 'your-name']);
  const email = getString(body, ['email', 'client_email', 'your-email']);
  const phone = getString(body, ['phone', 'client_phone', 'your-phone', 'telephone']);
  const eventType = getString(body, ['event_type', 'eventType', 'type_of_event', 'event']);
  const eventDate = getString(body, ['event_date', 'eventDate', 'date_of_event', 'date']);
  const venue = getString(body, ['venue', 'venue_name', 'location']);
  const venueCity = getString(body, ['city', 'venue_city']);
  const description = getString(body, ['message', 'description', 'details', 'your-message', 'comments']);
  const source = getString(body, ['source', 'lead_source', 'utm_source']) || 'website_form';
  const boardType = getString(body, ['board', 'board_type']) || 'boutique_decor';

  if (!name) {
    return new Response(JSON.stringify({ error: 'name is required' }), { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  // Find the target board
  const { data: board } = await supabase
    .from('boards')
    .select('id, type')
    .eq('type', boardType)
    .limit(1)
    .single();

  if (!board) {
    return new Response(
      JSON.stringify({ error: `No board found for type "${boardType}"` }),
      { status: 404 },
    );
  }

  // Find the "Website Inquiry" list on that board
  const { data: targetList } = await supabase
    .from('lists')
    .select('id')
    .eq('board_id', board.id)
    .eq('name', 'Website Inquiry')
    .single();

  if (!targetList) {
    return new Response(
      JSON.stringify({ error: 'No "Website Inquiry" list found on this board' }),
      { status: 404 },
    );
  }

  // Get the board owner (first admin user) for created_by
  const { data: owner } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_role', 'admin')
    .limit(1)
    .single();

  const createdBy = owner?.id || null;

  // Create the card
  const { data: card, error: cardError } = await supabase
    .from('cards')
    .insert({
      title: name,
      description: description || null,
      client_email: email || null,
      client_phone: phone || null,
      event_type: eventType || null,
      event_date: eventDate || null,
      venue_name: venue || null,
      venue_city: venueCity || null,
      lead_source: source,
      created_by: createdBy,
      last_touched_at: new Date().toISOString(),
      last_touched_by: createdBy,
    })
    .select()
    .single();

  if (cardError || !card) {
    console.error('[LeadIntake] Failed to create card:', cardError?.message);
    return new Response(
      JSON.stringify({ error: 'Failed to create card' }),
      { status: 500 },
    );
  }

  // Create placement on the Website Inquiry list
  const { data: maxPos } = await supabase
    .from('card_placements')
    .select('position')
    .eq('list_id', targetList.id)
    .order('position', { ascending: false })
    .limit(1)
    .single();

  const position = (maxPos?.position ?? -1) + 1;

  await supabase.from('card_placements').insert({
    card_id: card.id,
    list_id: targetList.id,
    position,
    is_mirror: false,
  });

  // Log the intake event
  await supabase.from('activity_log').insert({
    card_id: card.id,
    board_id: board.id,
    user_id: createdBy,
    event_type: 'lead_intake',
    metadata: {
      source,
      board_type: boardType,
      has_email: !!email,
      has_phone: !!phone,
      has_event_date: !!eventDate,
    },
  });

  // Run triage in the background
  if (createdBy) {
    triageLead(supabase, card.id, board.id, createdBy).catch((err) => {
      console.error('[LeadIntake] Triage failed:', err);
    });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      card_id: card.id,
      board_id: board.id,
    }),
    { status: 201, headers: { 'Content-Type': 'application/json' } },
  );
}

/** Extract a string from body, trying multiple possible field names. */
function getString(body: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const val = body[key];
    if (typeof val === 'string' && val.trim()) return val.trim();
  }
  return null;
}
