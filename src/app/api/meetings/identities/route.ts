import { NextRequest } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/meetings/identities
 * List participant identities with filters, client join, and meeting count.
 * Query params: confidence, confirmed, client_id, search, page, limit
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const url = new URL(request.url);

  const confidence = url.searchParams.get('confidence');
  const confirmed = url.searchParams.get('confirmed');
  const clientId = url.searchParams.get('client_id');
  const search = url.searchParams.get('search');
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);
  const offset = (page - 1) * limit;

  // Build the identity query with client join
  let query = supabase
    .from('participant_identities')
    .select(`
      id,
      email,
      display_name,
      fathom_speaker_name,
      client_id,
      contact_name,
      source,
      confidence,
      confirmed_at,
      confirmed_by,
      created_at,
      updated_at,
      clients:client_id (id, name)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  // Apply filters
  if (confidence) {
    query = query.eq('confidence', confidence);
  }

  if (confirmed === 'true') {
    query = query.not('confirmed_at', 'is', null);
  } else if (confirmed === 'false') {
    query = query.is('confirmed_at', null);
  }

  if (clientId) {
    query = query.eq('client_id', clientId);
  }

  if (search) {
    query = query.or(
      `display_name.ilike.%${search}%,email.ilike.%${search}%,fathom_speaker_name.ilike.%${search}%`
    );
  }

  const { data, count, error } = await query;

  if (error) {
    return errorResponse(error.message, 500);
  }

  // Get meeting counts per identity via a separate query
  const identityIds = (data || []).map((d: any) => d.id);
  let meetingCounts: Record<string, number> = {};

  if (identityIds.length > 0) {
    const { data: countData, error: countError } = await supabase
      .from('meeting_participants')
      .select('identity_id')
      .in('identity_id', identityIds);

    if (!countError && countData) {
      // Count occurrences per identity_id
      for (const row of countData) {
        if (row.identity_id) {
          meetingCounts[row.identity_id] = (meetingCounts[row.identity_id] || 0) + 1;
        }
      }
    }
  }

  // Merge meeting counts into the identity records
  const identities = (data || []).map((identity: any) => ({
    ...identity,
    meeting_count: meetingCounts[identity.id] || 0,
  }));

  const total = count || 0;

  return NextResponse.json({
    identities,
    total,
    page,
    total_pages: Math.ceil(total / limit),
  });
}
