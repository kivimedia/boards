import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { BOARD_TYPE_CONFIG, LABEL_COLORS } from '@/lib/constants';
import { BoardType } from '@/lib/types';
import { canAccessBoardByRole } from '@/lib/permissions';

export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  // Fetch user's agency role
  const { data: profile } = await supabase
    .from('profiles')
    .select('agency_role')
    .eq('id', userId)
    .single();

  const { data, error } = await supabase
    .from('boards')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) return errorResponse(error.message, 500);

  // Filter boards by agency role
  const agencyRole = profile?.agency_role ?? null;
  const filtered = agencyRole
    ? data?.filter((board: any) => canAccessBoardByRole(agencyRole, board.type)) ?? []
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

  // Create default labels
  const labels = LABEL_COLORS.slice(0, 4).map((color, index) => ({
    board_id: board.id,
    name: ['Urgent', 'Bug', 'Feature', 'Done'][index],
    color: color.value,
  }));

  await supabase.from('labels').insert(labels);

  return successResponse(board, 201);
}
