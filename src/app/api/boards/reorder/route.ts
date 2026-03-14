import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

interface ReorderBody {
  boards: { id: string; position: number }[];
}

export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<ReorderBody>(request);
  if (!body.ok) return body.response;

  const { boards } = body.body;
  if (!Array.isArray(boards) || boards.length === 0) {
    return errorResponse('boards array is required');
  }

  const { supabase } = auth.ctx;

  // Update each board's position
  const updates = boards.map(({ id, position }) =>
    supabase.from('boards').update({ position }).eq('id', id)
  );

  await Promise.all(updates);

  return successResponse({ updated: boards.length });
}
