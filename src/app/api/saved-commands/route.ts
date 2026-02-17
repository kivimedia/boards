import { NextRequest } from 'next/server';
import { getAuthContext, errorResponse, successResponse } from '@/lib/api-helpers';

/**
 * GET /api/saved-commands?board_id={id}
 * List saved commands for a board.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const boardId = request.nextUrl.searchParams.get('board_id');

  if (!boardId) {
    return errorResponse('board_id is required');
  }

  const { data, error } = await supabase
    .from('saved_commands')
    .select('id, board_id, name, command, icon, usage_count, created_at')
    .eq('board_id', boardId)
    .order('usage_count', { ascending: false });

  if (error) {
    return errorResponse(error.message, 500);
  }

  return successResponse(data || []);
}

/**
 * POST /api/saved-commands
 * Save a new command recipe.
 * Body: { board_id: string, name: string, command: string, icon?: string }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  let body: { board_id: string; name: string; command: string; icon?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const { board_id, name, command, icon } = body;
  if (!board_id || !name || !command) {
    return errorResponse('board_id, name, and command are required');
  }

  if (name.length > 100) {
    return errorResponse('Name too long (max 100 characters)');
  }

  if (command.length > 500) {
    return errorResponse('Command too long (max 500 characters)');
  }

  // Check existing count (limit to 20 per board)
  const { count } = await supabase
    .from('saved_commands')
    .select('id', { count: 'exact', head: true })
    .eq('board_id', board_id);

  if ((count || 0) >= 20) {
    return errorResponse('Maximum 20 saved commands per board');
  }

  const { data, error } = await supabase
    .from('saved_commands')
    .insert({
      board_id,
      created_by: userId,
      name: name.trim(),
      command: command.trim(),
      icon: icon?.trim() || 'zap',
    })
    .select()
    .single();

  if (error) {
    return errorResponse(error.message, 500);
  }

  return successResponse(data, 201);
}

/**
 * DELETE /api/saved-commands?id={id}
 * Delete a saved command.
 */
export async function DELETE(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const id = request.nextUrl.searchParams.get('id');

  if (!id) {
    return errorResponse('id is required');
  }

  const { error } = await supabase
    .from('saved_commands')
    .delete()
    .eq('id', id);

  if (error) {
    return errorResponse(error.message, 500);
  }

  return successResponse({ deleted: true });
}
