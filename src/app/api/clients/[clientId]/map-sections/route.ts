import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { MapSectionType } from '@/lib/types';

interface Params {
  params: { clientId: string };
}

export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { data, error } = await supabase
    .from('map_sections')
    .select('*')
    .eq('client_id', params.clientId)
    .order('position', { ascending: true });

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}

interface CreateSectionBody {
  section_type: MapSectionType;
  title?: string;
  content?: Record<string, unknown>;
  position?: number;
  is_client_visible?: boolean;
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreateSectionBody>(request);
  if (!body.ok) return body.response;

  const { section_type, title, content, position, is_client_visible } = body.body;
  if (!section_type) return errorResponse('Section type is required');

  const validTypes: MapSectionType[] = ['visual_brief', 'outreach_planner', 'resources', 'whiteboard', 'notes'];
  if (!validTypes.includes(section_type)) return errorResponse('Invalid section type');

  const { supabase } = auth.ctx;
  const { data, error } = await supabase
    .from('map_sections')
    .insert({
      client_id: params.clientId,
      section_type,
      title: title?.trim() || '',
      content: content || {},
      position: position ?? 0,
      is_client_visible: is_client_visible ?? false,
    })
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data, 201);
}
