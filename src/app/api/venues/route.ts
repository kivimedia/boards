import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from('venues')
    .select('*')
    .order('name');

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}

interface CreateVenueBody {
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  venue_type?: string | null;
  source?: string | null;
  notes?: string | null;
}

export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreateVenueBody>(request);
  if (!body.ok) return body.response;

  const { name } = body.body;
  if (!name) return errorResponse('name is required');

  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from('venues')
    .insert({
      name,
      address: body.body.address || null,
      city: body.body.city || null,
      state: body.body.state || 'NC',
      contact_name: body.body.contact_name || null,
      contact_email: body.body.contact_email || null,
      venue_type: body.body.venue_type || null,
      source: body.body.source || 'manual',
      notes: body.body.notes || null,
    })
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}
