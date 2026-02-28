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
  const { siteProfileId, figmaFileKey, figmaNodeIds, pageTitle, pageSlug } = body;

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

  // Create VPS job for the build
  await auth.ctx.supabase.from('vps_jobs').insert({
    job_type: 'pipeline:pageforge',
    status: 'queued',
    payload: {
      build_id: build.id,
      site_profile_id: siteProfileId,
    },
    created_by: auth.ctx.userId,
  });

  return NextResponse.json({ build }, { status: 201 });
}
