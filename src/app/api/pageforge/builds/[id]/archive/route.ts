import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';

interface Params {
  params: { id: string };
}

/**
 * POST /api/pageforge/builds/[id]/archive
 * Archive a completed, failed, or cancelled build.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { data: build, error } = await auth.ctx.supabase
    .from('pageforge_builds')
    .select('id, status')
    .eq('id', params.id)
    .single();

  if (error || !build) {
    return errorResponse('Build not found', 404);
  }

  const archivable = ['published', 'failed', 'cancelled'];
  if (!archivable.includes(build.status)) {
    return errorResponse(`Cannot archive a build with status "${build.status}". Only published, failed, or cancelled builds can be archived.`);
  }

  const { error: updateError } = await auth.ctx.supabase
    .from('pageforge_builds')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', params.id);

  if (updateError) {
    return errorResponse('Failed to archive build', 500);
  }

  return NextResponse.json({ success: true, status: 'archived' });
}
