import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getWhatsAppGroups, createWhatsAppGroup } from '@/lib/whatsapp';

/**
 * GET /api/whatsapp/groups
 * List WhatsApp groups. Optionally filter by board_id.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { searchParams } = new URL(request.url);
  const boardId = searchParams.get('board_id') || undefined;

  const groups = await getWhatsAppGroups(supabase, boardId);

  return successResponse(groups);
}

interface CreateGroupBody {
  group_name: string;
  board_id?: string;
  department?: string;
  whatsapp_group_id?: string;
}

/**
 * POST /api/whatsapp/groups
 * Create a new WhatsApp group mapping.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<CreateGroupBody>(request);
  if (!parsed.ok) return parsed.response;

  const { group_name, board_id, department, whatsapp_group_id } = parsed.body;

  if (!group_name?.trim()) {
    return errorResponse('group_name is required');
  }

  const { supabase } = auth.ctx;

  const group = await createWhatsAppGroup(supabase, {
    groupName: group_name.trim(),
    boardId: board_id,
    department: department?.trim(),
    whatsappGroupId: whatsapp_group_id?.trim(),
  });

  if (!group) {
    return errorResponse('Failed to create group', 500);
  }

  return successResponse(group, 201);
}
