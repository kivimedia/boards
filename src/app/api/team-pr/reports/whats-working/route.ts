import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

const THRESHOLD = 50;

/**
 * GET /api/team-pr/reports/whats-working
 * Aggregates approved/sent email performance by pitch angle and outlet type.
 * Requires at least 50 approved/sent drafts before returning insights.
 * Query params: ?client_id= (required)
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('client_id');

  if (!clientId) {
    return errorResponse('client_id is required');
  }

  // Fetch all drafts for this client (APPROVED, SENT, REJECTED) to compute approval rates
  const { data: drafts, error: draftsError } = await supabase
    .from('pr_email_drafts')
    .select('id, status, pitch_angle, revision_count, reviewer_notes, outlet_id')
    .eq('client_id', clientId)
    .in('status', ['APPROVED', 'SENT', 'REJECTED']);

  if (draftsError) return errorResponse(draftsError.message, 500);

  const allDrafts = drafts ?? [];
  const approvedOrSent = allDrafts.filter(
    (d) => d.status === 'APPROVED' || d.status === 'SENT'
  );

  if (approvedOrSent.length < THRESHOLD) {
    return successResponse({
      ready: false,
      current_count: approvedOrSent.length,
      threshold: THRESHOLD,
    });
  }

  // Gather outlet_ids for outlet_type lookup
  const outletIds = [...new Set(allDrafts.map((d) => d.outlet_id).filter(Boolean))];
  const outletTypeMap: Record<string, string> = {};

  if (outletIds.length > 0) {
    // Verify ownership via run join
    const { data: outlets } = await supabase
      .from('pr_outlets')
      .select('id, outlet_type, run:pr_runs!inner(user_id)')
      .in('id', outletIds)
      .eq('run.user_id', userId);

    for (const o of outlets ?? []) {
      if (o.outlet_type) {
        outletTypeMap[o.id] = o.outlet_type;
      }
    }
  }

  // --- by_pitch_angle ---
  type AngleAgg = { approved: number; total: number; revision_counts: number[] };
  const byAngle: Record<string, AngleAgg> = {};

  for (const draft of allDrafts) {
    const angle = draft.pitch_angle || 'unknown';
    if (!byAngle[angle]) byAngle[angle] = { approved: 0, total: 0, revision_counts: [] };
    byAngle[angle].total += 1;
    if (draft.status === 'APPROVED' || draft.status === 'SENT') {
      byAngle[angle].approved += 1;
    }
    byAngle[angle].revision_counts.push(draft.revision_count ?? 0);
  }

  const byPitchAngle = Object.entries(byAngle)
    .map(([angle, agg]) => ({
      pitch_angle: angle,
      total_drafts: agg.total,
      approved_count: agg.approved,
      approval_rate: Math.round((agg.approved / agg.total) * 1000) / 1000,
      avg_revision_count:
        agg.revision_counts.length > 0
          ? Math.round(
              (agg.revision_counts.reduce((a, b) => a + b, 0) / agg.revision_counts.length) * 100
            ) / 100
          : 0,
    }))
    .sort((a, b) => b.approval_rate - a.approval_rate);

  // --- by_outlet_type ---
  type TypeAgg = { approved: number; total: number };
  const byType: Record<string, TypeAgg> = {};

  for (const draft of allDrafts) {
    const type = (draft.outlet_id && outletTypeMap[draft.outlet_id]) || 'unknown';
    if (!byType[type]) byType[type] = { approved: 0, total: 0 };
    byType[type].total += 1;
    if (draft.status === 'APPROVED' || draft.status === 'SENT') {
      byType[type].approved += 1;
    }
  }

  const byOutletType = Object.entries(byType)
    .map(([outlet_type, agg]) => ({
      outlet_type,
      total_drafts: agg.total,
      approved_count: agg.approved,
      approval_rate: Math.round((agg.approved / agg.total) * 1000) / 1000,
    }))
    .sort((a, b) => b.approval_rate - a.approval_rate);

  // --- revision_stats by pitch_angle ---
  const revisionStats = byPitchAngle.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.pitch_angle] = entry.avg_revision_count;
    return acc;
  }, {});

  // --- common rejection reasons (from reviewer_notes on REJECTED) ---
  const rejectedDrafts = allDrafts.filter((d) => d.status === 'REJECTED');
  const noteCounts: Record<string, number> = {};
  for (const draft of rejectedDrafts) {
    const note = draft.reviewer_notes?.trim();
    if (note) {
      noteCounts[note] = (noteCounts[note] || 0) + 1;
    }
  }
  const commonRejectionReasons = Object.entries(noteCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([reason, count]) => ({ reason, count }));

  return successResponse({
    ready: true,
    total_emails: approvedOrSent.length,
    by_pitch_angle: byPitchAngle,
    by_outlet_type: byOutletType,
    revision_stats: revisionStats,
    common_rejection_reasons: commonRejectionReasons,
  });
}
