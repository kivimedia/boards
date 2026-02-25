import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
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
