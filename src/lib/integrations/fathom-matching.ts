import type { SupabaseClient } from '@supabase/supabase-js';
import type { FathomCalendarInvitee, FathomTranscriptEntry } from './fathom';

interface MatchResult {
  clientId: string | null;
  clientName: string | null;
  matchedBy: string | null;
  participantsCreated: number;
}

/**
 * Match meeting participants to known clients.
 * Strategy:
 * 1. Check calendar invitee emails against client contacts and client email
 * 2. Check speaker names against client contact names (fuzzy)
 * 3. Create/update participant_identities for future auto-matching
 */
export async function matchParticipantsToClients(
  supabase: SupabaseClient,
  recordingId: string,
  invitees: FathomCalendarInvitee[],
  transcript: FathomTranscriptEntry[]
): Promise<MatchResult> {
  // Fetch all clients with their contacts
  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, email, contacts');

  if (!clients || clients.length === 0) {
    return { clientId: null, clientName: null, matchedBy: null, participantsCreated: 0 };
  }

  // Build email-to-client lookup from client.email and client.contacts[].email
  const emailToClient = new Map<string, { id: string; name: string; contactName?: string }>();
  for (const client of clients) {
    if (client.email) {
      emailToClient.set(client.email.toLowerCase(), { id: client.id, name: client.name });
    }
    const contacts = (client.contacts || []) as Array<{ name?: string; email?: string }>;
    for (const contact of contacts) {
      if (contact.email) {
        emailToClient.set(contact.email.toLowerCase(), {
          id: client.id,
          name: client.name,
          contactName: contact.name,
        });
      }
    }
  }

  // Check existing participant_identities for known mappings
  const { data: knownIdentities } = await supabase
    .from('participant_identities')
    .select('email, client_id, display_name');

  const knownEmailMap = new Map<string, string>();
  for (const identity of (knownIdentities || [])) {
    if (identity.email && identity.client_id) {
      knownEmailMap.set(identity.email.toLowerCase(), identity.client_id);
    }
  }

  let matchedClientId: string | null = null;
  let matchedClientName: string | null = null;
  let matchedBy: string | null = null;
  let participantsCreated = 0;

  // Process calendar invitees (highest confidence)
  for (const invitee of invitees) {
    if (!invitee.email) continue;
    const email = invitee.email.toLowerCase();

    // Check known identities first
    const knownClientId = knownEmailMap.get(email);
    if (knownClientId && !matchedClientId) {
      matchedClientId = knownClientId;
      const client = clients.find(c => c.id === knownClientId);
      matchedClientName = client?.name || null;
      matchedBy = 'known_identity';
    }

    // Check client contacts
    const clientMatch = emailToClient.get(email);
    if (clientMatch && !matchedClientId) {
      matchedClientId = clientMatch.id;
      matchedClientName = clientMatch.name;
      matchedBy = 'calendar_email';
    }

    // Upsert participant identity
    const { data: identity } = await supabase
      .from('participant_identities')
      .upsert(
        {
          email,
          display_name: invitee.name,
          client_id: clientMatch?.id || knownClientId || null,
          contact_name: clientMatch?.contactName || invitee.name,
          source: 'calendar_email',
          confidence: clientMatch ? 'high' : 'medium',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'idx_participant_identities_email' }
      )
      .select('id')
      .single();

    // Create meeting_participant link
    if (identity) {
      await supabase.from('meeting_participants').insert({
        recording_id: recordingId,
        identity_id: identity.id,
        speaker_display_name: invitee.name,
        speaker_email: email,
        is_external: invitee.is_external,
      });
      participantsCreated++;
    }
  }

  // Process unique transcript speakers not already matched by email
  const processedEmails = new Set(invitees.map(i => i.email?.toLowerCase()).filter(Boolean));
  const seenSpeakers = new Set<string>();

  for (const entry of transcript) {
    const speakerName = entry.speaker.display_name;
    const speakerEmail = entry.speaker.matched_calendar_invitee_email;

    if (seenSpeakers.has(speakerName)) continue;
    seenSpeakers.add(speakerName);

    // Skip if already handled via calendar invitee email
    if (speakerEmail && processedEmails.has(speakerEmail.toLowerCase())) continue;

    // Try email match if available
    if (speakerEmail) {
      const email = speakerEmail.toLowerCase();
      const clientMatch = emailToClient.get(email);

      if (clientMatch && !matchedClientId) {
        matchedClientId = clientMatch.id;
        matchedClientName = clientMatch.name;
        matchedBy = 'transcript_email';
      }

      const { data: identity } = await supabase
        .from('participant_identities')
        .upsert(
          {
            email,
            display_name: speakerName,
            fathom_speaker_name: speakerName,
            client_id: clientMatch?.id || null,
            contact_name: clientMatch?.contactName || speakerName,
            source: 'calendar_email',
            confidence: clientMatch ? 'high' : 'low',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'idx_participant_identities_email' }
        )
        .select('id')
        .single();

      if (identity) {
        await supabase.from('meeting_participants').insert({
          recording_id: recordingId,
          identity_id: identity.id,
          speaker_display_name: speakerName,
          speaker_email: email,
          is_external: true,
        });
        participantsCreated++;
      }
    } else {
      // No email - try fuzzy name match against client contact names
      let nameMatchClient: { id: string; name: string } | null = null;
      for (const client of clients) {
        const contacts = (client.contacts || []) as Array<{ name?: string }>;
        for (const contact of contacts) {
          if (contact.name && fuzzyNameMatch(speakerName, contact.name)) {
            nameMatchClient = { id: client.id, name: client.name };
            break;
          }
        }
        // Also check client name itself
        if (!nameMatchClient && fuzzyNameMatch(speakerName, client.name)) {
          nameMatchClient = { id: client.id, name: client.name };
        }
        if (nameMatchClient) break;
      }

      if (nameMatchClient && !matchedClientId) {
        matchedClientId = nameMatchClient.id;
        matchedClientName = nameMatchClient.name;
        matchedBy = 'speaker_name';
      }

      // Insert participant without email (no unique constraint to conflict on)
      const { data: identity } = await supabase
        .from('participant_identities')
        .insert({
          display_name: speakerName,
          fathom_speaker_name: speakerName,
          client_id: nameMatchClient?.id || null,
          source: 'speaker_name',
          confidence: nameMatchClient ? 'medium' : 'low',
        })
        .select('id')
        .single();

      if (identity) {
        await supabase.from('meeting_participants').insert({
          recording_id: recordingId,
          identity_id: identity.id,
          speaker_display_name: speakerName,
          is_external: true,
        });
        participantsCreated++;
      }
    }
  }

  return { clientId: matchedClientId, clientName: matchedClientName, matchedBy, participantsCreated };
}

/**
 * Simple fuzzy name matching.
 * Checks if names are similar enough (case-insensitive, handles first/last name order).
 */
function fuzzyNameMatch(a: string, b: string): boolean {
  const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
  const na = normalize(a);
  const nb = normalize(b);

  // Exact match
  if (na === nb) return true;

  // One name contains the other
  if (na.includes(nb) || nb.includes(na)) return true;

  // Split into parts and check overlap
  const partsA = na.split(' ');
  const partsB = nb.split(' ');
  const matching = partsA.filter(p => partsB.some(q => q === p || (p.length > 2 && q.startsWith(p))));

  // At least 2 name parts match, or 1 part matches and both are single-word
  if (matching.length >= 2) return true;
  if (matching.length === 1 && partsA.length === 1 && partsB.length === 1) return true;

  return false;
}
