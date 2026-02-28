import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import { createBuild, listBuilds } from '@/lib/ai/pageforge-pipeline';
import type { PageForgeSiteProfile } from '@/lib/types';

/**
 * GET /api/pageforge/builds
 * List builds, optionally filtered by clientId or siteProfileId.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const clientId = url.searchParams.get('clientId') || undefined;
  const siteProfileId = url.searchParams.get('siteProfileId') || undefined;
  const status = url.searchParams.get('status') || undefined;

  const builds = await listBuilds(auth.ctx.supabase, {
    clientId,
    siteProfileId,
    status: status as any,
  });

  return NextResponse.json({ builds });
}

/**
 * POST /api/pageforge/builds
 * Start a new build.
 * Body: { siteProfileId, figmaFileKey, figmaNodeIds?, pageTitle, pageSlug? }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const { siteProfileId, figmaFileKey, figmaNodeIds, pageTitle, pageSlug, page_builder: pageBuilder, model_profile: modelProfile, custom_models: customModels, boardListId, trackOnBoard } = body;

  if (!siteProfileId || !figmaFileKey || !pageTitle) {
    return errorResponse('siteProfileId, figmaFileKey, and pageTitle are required');
  }

  // Fetch site profile
  const { data: siteProfile, error } = await auth.ctx.supabase
    .from('pageforge_site_profiles')
    .select('*')
    .eq('id', siteProfileId)
    .single();

  if (error || !siteProfile) {
    return errorResponse('Site profile not found', 404);
  }

  const build = await createBuild(
    auth.ctx.supabase,
    siteProfile as PageForgeSiteProfile,
    {
      figmaFileKey,
      figmaNodeIds: figmaNodeIds || [],
      pageTitle,
      pageSlug,
      createdBy: auth.ctx.userId,
    }
  );

  // Store model_profile, custom_models, and page_builder override in the build
  const updatePayload: Record<string, unknown> = {
    artifacts: {
      model_profile: modelProfile || 'cost_optimized',
      custom_models: customModels || null,
    },
  };
  // Allow overriding the page builder per-build
  if (pageBuilder && pageBuilder !== siteProfile.page_builder) {
    updatePayload.page_builder = pageBuilder;
  }
  await auth.ctx.supabase
    .from('pageforge_builds')
    .update(updatePayload)
    .eq('id', build.id);

  // Create VPS job for the build
  await auth.ctx.supabase.from('vps_jobs').insert({
    job_type: 'pipeline:pageforge',
    status: 'queued',
    payload: {
      build_id: build.id,
      site_profile_id: siteProfileId,
      model_profile: modelProfile || 'cost_optimized',
      page_builder: pageBuilder || siteProfile.page_builder,
    },
    created_by: auth.ctx.userId,
  });

  // Optionally create board sub-tasks
  const resolvedListId = boardListId || (trackOnBoard ? await resolveClientBoardList(auth.ctx.supabase, siteProfile) : null);
  if (resolvedListId) {
    try {
      const { createBuildSubTasks } = await import('@/lib/ai/pageforge/build-tasks');
      await createBuildSubTasks(auth.ctx.supabase, {
        buildId: build.id,
        pageTitle,
        listId: resolvedListId,
        createdBy: auth.ctx.userId,
      });
    } catch (err) {
      console.error('Failed to create build sub-tasks:', err);
      // Non-fatal - build continues without board tasks
    }
  }

  return NextResponse.json({ build }, { status: 201 });
}

/**
 * Resolve the first list of the client's linked board.
 * Returns null if no client, no board, or no lists found.
 */
async function resolveClientBoardList(
  supabase: Parameters<typeof createBuild>[0],
  siteProfile: { client_id: string | null }
): Promise<string | null> {
  if (!siteProfile.client_id) return null;
  try {
    // Find client's active board
    const { data: clientBoards } = await supabase
      .from('client_boards')
      .select('board_id')
      .eq('client_id', siteProfile.client_id)
      .eq('is_active', true)
      .limit(1)
      .single();
    if (!clientBoards?.board_id) return null;
    // Find first list in that board
    const { data: firstList } = await supabase
      .from('lists')
      .select('id')
      .eq('board_id', clientBoards.board_id)
      .order('position', { ascending: true })
      .limit(1)
      .single();
    return firstList?.id || null;
  } catch {
    return null;
  }
}
