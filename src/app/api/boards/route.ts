import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { BOARD_TYPE_CONFIG, BALLOON_DEFAULT_LABELS } from '@/lib/constants';
import { BoardType } from '@/lib/types';
import { canAccessBoardByRole } from '@/lib/permissions';

export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  // Fetch user's business role
  const { data: profile } = await supabase
    .from('profiles')
    .select('business_role')
    .eq('id', userId)
    .single();

  const { data, error } = await supabase
    .from('boards')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) return errorResponse(error.message, 500);

  // Filter boards by business role
  const businessRole = profile?.business_role ?? null;
  const filtered = businessRole
    ? data?.filter((board: any) => canAccessBoardByRole(businessRole, board.type)) ?? []
    : data ?? [];

  return successResponse(filtered);
}

interface CreateBoardBody {
  name: string;
  type: BoardType;
}

export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreateBoardBody>(request);
  if (!body.ok) return body.response;

  const { name, type } = body.body;
  if (!name?.trim()) return errorResponse('Board name is required');
  if (!BOARD_TYPE_CONFIG[type]) return errorResponse('Invalid board type');

  const { supabase, userId } = auth.ctx;
  const config = BOARD_TYPE_CONFIG[type];

  // Create the board
  const { data: board, error: boardError } = await supabase
    .from('boards')
    .insert({ name: name.trim(), type, created_by: userId })
    .select()
    .single();

  if (boardError) return errorResponse(boardError.message, 500);

  // Create default lists
  const lists = config.defaultLists.map((listName, index) => ({
    board_id: board.id,
    name: listName,
    position: index,
  }));

  await supabase.from('lists').insert(lists);

  // Create board-specific default labels
  const boardLabels = BALLOON_DEFAULT_LABELS[type];
  if (boardLabels) {
    const labels = boardLabels.map((label) => ({
      board_id: board.id,
      name: label.name,
      color: label.color,
    }));
    await supabase.from('labels').insert(labels);
  }

  // Create default custom field definitions
  if (config.defaultCustomFields.length > 0) {
    const fields = config.defaultCustomFields.map((field, index) => ({
      board_id: board.id,
      name: field.name,
      field_type: field.field_type,
      options: field.options ?? [],
      is_required: field.is_required ?? false,
      position: index,
    }));
    await supabase.from('custom_field_definitions').insert(fields);
  }

  return successResponse(board, 201);
}
