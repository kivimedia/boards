import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/podcast/webhooks/calendly
 * Webhook endpoint for Cal.com / Calendly booking events.
 * When someone books via the scheduling link (kivimedia.com/15?ref=CANDIDATE_ID),
 * this webhook updates the candidate status to 'scheduled'.
 *
 * Cal.com sends: { triggerEvent, payload: { ... } }
 * Calendly sends: { event, payload: { ... } }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Extract candidate reference from the booking
    let candidateRef: string | null = null;
    let guestEmail: string | null = null;
    let guestName: string | null = null;
    let bookingTime: string | null = null;

    // Cal.com format
    if (body.triggerEvent || body.payload?.bookingId) {
      const payload = body.payload ?? {};
      // Cal.com passes query params from the booking link in the metadata
      candidateRef = payload.metadata?.ref
        ?? payload.responses?.ref
        ?? extractRefFromUrl(payload.metadata?.bookingLink);
      guestEmail = payload.attendees?.[0]?.email ?? payload.email;
      guestName = payload.attendees?.[0]?.name ?? payload.name;
      bookingTime = payload.startTime ?? payload.startDate;
    }
    // Calendly format
    else if (body.event && body.payload?.tracking) {
      candidateRef = body.payload.tracking?.utm_content
        ?? extractRefFromUrl(body.payload.tracking?.utm_source);
      const invitee = body.payload.invitee ?? {};
      guestEmail = invitee.email;
      guestName = invitee.name;
      bookingTime = body.payload.event?.start_time;
    }

    if (!candidateRef && !guestEmail) {
      // Can't identify candidate — log and accept
      console.log('[Webhook/Calendly] No candidate ref or email in payload:', JSON.stringify(body).slice(0, 500));
      return NextResponse.json({ ok: true, message: 'No candidate match found' });
    }

    // Use service role to update candidate status (no auth cookie on webhooks)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Try to find candidate by ref (UUID) first, then by email
    let candidateId: string | null = null;

    if (candidateRef) {
      // Check if it's a valid UUID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(candidateRef)) {
        const { data } = await supabase
          .from('pga_candidates')
          .select('id')
          .eq('id', candidateRef)
          .maybeSingle();
        candidateId = data?.id ?? null;
      }
    }

    if (!candidateId && guestEmail) {
      const { data } = await supabase
        .from('pga_candidates')
        .select('id')
        .eq('email', guestEmail)
        .maybeSingle();
      candidateId = data?.id ?? null;
    }

    if (!candidateId) {
      console.log('[Webhook/Calendly] No matching candidate for ref:', candidateRef, 'email:', guestEmail);
      return NextResponse.json({ ok: true, message: 'No matching candidate' });
    }

    // Update candidate status to 'scheduled'
    await supabase
      .from('pga_candidates')
      .update({
        status: 'scheduled',
        notes: `Booked: ${bookingTime ?? 'unknown time'}${guestName ? ` (${guestName})` : ''}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', candidateId)
      .in('status', ['outreach_active', 'replied']); // Only update if in expected state

    // Also pause the email sequence
    await supabase
      .from('pga_email_sequences')
      .update({
        status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('candidate_id', candidateId)
      .in('status', ['active', 'draft']);

    console.log(`[Webhook/Calendly] Candidate ${candidateId} → scheduled`);
    return NextResponse.json({ ok: true, candidate_id: candidateId });
  } catch (err: any) {
    console.error('[Webhook/Calendly] Error:', err.message);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

/**
 * Extract ?ref=UUID from a URL string.
 */
function extractRefFromUrl(url?: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://example.com${url}`);
    return parsed.searchParams.get('ref') || null;
  } catch {
    return null;
  }
}
