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

  // 3. If a WP draft page was created, note it for cleanup
  // (actual WP page deletion would need WP credentials, which the API route
  //  doesn't have access to - flag it for the VPS worker to clean up)
  let wpCleanupNote = '';
  if (build.wp_page_id) {
    wpCleanupNote = `Note: WP draft page (ID: ${build.wp_page_id}) may need manual cleanup.`;
  }

  return NextResponse.json({
    success: true,
    message: `Build aborted: ${reason}. ${wpCleanupNote}`.trim(),
  });
}
