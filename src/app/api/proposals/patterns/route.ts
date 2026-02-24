import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from('proposal_patterns')
    .select('*')
    .neq('name', '__voice_profile__')
    .order('created_from_count', { ascending: false });

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}

interface CreatePatternBody {
  name: string;
  event_types?: string[];
  products?: string[];
  typical_price_min?: number;
  typical_price_max?: number;
  match_keywords?: string[];
  confidence_threshold?: number;
  is_no_brainer?: boolean;
}

export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreatePatternBody>(request);
  if (!body.ok) return body.response;

  const { name } = body.body;
  if (!name) return errorResponse('name is required');

  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from('proposal_patterns')
    .insert({
      name,
      event_types: body.body.event_types || [],
      products: body.body.products || [],
      typical_price_min: body.body.typical_price_min || 0,
      typical_price_max: body.body.typical_price_max || 0,
      match_keywords: body.body.match_keywords || [],
      confidence_threshold: body.body.confidence_threshold || 0.6,
      is_no_brainer: body.body.is_no_brainer || false,
      created_from_count: 0,
      is_active: true,
    })
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}
