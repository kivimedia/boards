import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';

interface Params {
  params: { id: string };
}

/**
 * POST /api/pageforge/builds/[id]/abort
 * Abort an active build - cancels VPS job, marks build as cancelled.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const reason = body.reason || 'Manual abort';

  // Fetch the build
  const { data: build, error } = await auth.ctx.supabase
    .from('pageforge_builds')
    .select('id, status, vps_job_id, wp_page_id, site_profile_id')
    .eq('id', params.id)
    .single();

  if (error || !build) {
    return errorResponse('Build not found', 404);
  }

  // Only allow abort on active builds
  const terminalStatuses = ['published', 'failed', 'cancelled'];
  if (terminalStatuses.includes(build.status)) {
    return errorResponse('Build is already in a terminal state', 400);
  }

  // 1. Cancel the VPS job if it exists
  if (build.vps_job_id) {
    await auth.ctx.supabase
      .from('vps_jobs')
      .update({
        status: 'cancelled',
        error_message: `Aborted: ${reason}`,
        completed_at: new Date().toISOString(),
      })
      .eq('id', build.vps_job_id);
  }

  // 2. Update build status to cancelled
  const { data: currentBuild } = await auth.ctx.supabase
    .from('pageforge_builds')
    .select('error_log')
    .eq('id', params.id)
    .single();

  const errorLog = (currentBuild?.error_log as any[] || []);
  errorLog.push({
    phase: build.status,
    error: `Build aborted: ${reason}`,
    timestamp: new Date().toISOString(),
  });

  await auth.ctx.supabase
    .from('pageforge_builds')
    .update({
      status: 'cancelled',
      error_log: errorLog,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id);

  // 3. If a WP draft page was created, try to delete it
  let wpCleanupNote = '';
  if (build.wp_page_id && build.site_profile_id) {
    try {
      const { data: profile } = await auth.ctx.supabase
        .from('pageforge_site_profiles')
        .select('wp_rest_url, wp_username, wp_app_password')
        .eq('id', build.site_profile_id)
        .single();

      if (profile?.wp_rest_url && profile?.wp_username && profile?.wp_app_password) {
        const wpUrl = `${profile.wp_rest_url}/pages/${build.wp_page_id}?force=true`;
        const auth64 = Buffer.from(`${profile.wp_username}:${profile.wp_app_password}`).toString('base64');
        const wpRes = await fetch(wpUrl, {
          method: 'DELETE',
          headers: { Authorization: `Basic ${auth64}` },
        });
        if (wpRes.ok) {
          wpCleanupNote = `WP draft page (ID: ${build.wp_page_id}) was deleted.`;
        } else {
          wpCleanupNote = `Failed to delete WP draft page (ID: ${build.wp_page_id}). Status: ${wpRes.status}. May need manual cleanup.`;
        }
      } else {
        wpCleanupNote = `WP draft page (ID: ${build.wp_page_id}) may need manual cleanup (missing credentials).`;
      }
    } catch (err) {
      wpCleanupNote = `WP draft page (ID: ${build.wp_page_id}) may need manual cleanup. Error: ${(err as Error).message}`;
    }
  }

  return NextResponse.json({
    success: true,
    message: `Build aborted: ${reason}. ${wpCleanupNote}`.trim(),
  });
}
