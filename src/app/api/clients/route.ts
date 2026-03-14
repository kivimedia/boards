import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  // Fetch clients with their meeting configs
  const { data: clients, error } = await supabase
    .from('clients')
    .select('*, client_meeting_configs(calendar_event_keyword)')
    .order('created_at', { ascending: false });

  if (error) return errorResponse(error.message, 500);

  // Fetch upcoming calendar events (next 60 days)
  const now = new Date().toISOString();
  const sixtyDaysOut = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
  const { data: events } = await supabase
    .from('calendar_events')
    .select('id, title, start_time')
    .gte('start_time', now)
    .lte('start_time', sixtyDaysOut)
    .order('start_time', { ascending: true });

  // For each client, find the next upcoming event matching their meeting keyword
  const enriched = (clients || []).map((client: any) => {
    const configs = client.client_meeting_configs || [];
    const keywords: string[] = configs
      .map((c: any) => c.calendar_event_keyword?.toLowerCase())
      .filter(Boolean);

    let next_event_time: string | null = null;
    let next_event_title: string | null = null;

    if (keywords.length > 0 && events) {
      for (const event of events) {
        const titleLower = event.title?.toLowerCase() || '';
        if (keywords.some(kw => titleLower.includes(kw))) {
          next_event_time = event.start_time;
          next_event_title = event.title;
          break; // events are sorted ascending, so first match = next event
        }
      }
    }

    // Remove the nested configs from the response
    const { client_meeting_configs, ...rest } = client;
    return { ...rest, next_event_time, next_event_title };
  });

  return successResponse(enriched);
}

interface CreateClientBody {
  name: string;
  company?: string;
  contacts?: { name: string; email: string; phone?: string; role?: string }[];
  client_tag?: string;
  contract_type?: string;
  notes?: string;
  email?: string;
  phone?: string;
  location?: string;
}

export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreateClientBody>(request);
  if (!body.ok) return body.response;

  const { name, company, contacts, client_tag, contract_type, notes, email, phone, location } = body.body;
  if (!name?.trim()) return errorResponse('Client name is required');

  const { supabase, userId } = auth.ctx;
  const { data, error } = await supabase
    .from('clients')
    .insert({
      name: name.trim(),
      company: company?.trim() || null,
      contacts: contacts || [],
      client_tag: client_tag?.trim() || null,
      contract_type: contract_type?.trim() || null,
      notes: notes?.trim() || null,
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      location: location?.trim() || null,
      created_by: userId,
    })
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data, 201);
}
