import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

/**
 * GET /api/team-pr/reports/calibration
 * For every 5th completed run, generates a calibration snapshot:
 * - Feedback breakdown by type
 * - Draft override rate
 * - Gate override count
 * - Average QA pass rate
 * - Recommendations based on rates
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

  // Fetch all completed runs for this client ordered chronologically
  const { data: runs, error: runsError } = await supabase
    .from('pr_runs')
    .select('id, created_at, emails_generated, outlets_discovered, outlets_qa_passed')
    .eq('client_id', clientId)
    .eq('user_id', userId)
    .eq('status', 'COMPLETED')
    .order('created_at', { ascending: true });

  if (runsError) return errorResponse(runsError.message, 500);
  if (!runs || runs.length < 5) {
    return successResponse({
      snapshots: [],
      runs_completed: runs?.length ?? 0,
      next_snapshot_at_run: 5,
    });
  }

  // Build snapshots for every 5-run window
  const snapshots = [];
  const windowSize = 5;

  for (let i = windowSize; i <= runs.length; i += windowSize) {
    const windowRuns = runs.slice(i - windowSize, i);
    const runIds = windowRuns.map((r) => r.id);

    // Fetch all feedback for these runs
    const { data: feedbackRows, error: fbError } = await supabase
      .from('pr_feedback')
      .select('feedback_type')
      .eq('client_id', clientId)
      .in('run_id', runIds);

    if (fbError) return errorResponse(fbError.message, 500);

    const feedback = feedbackRows ?? [];

    // Breakdown by feedback_type
    const breakdown: Record<string, number> = {};
    for (const fb of feedback) {
      const t = fb.feedback_type as string;
      breakdown[t] = (breakdown[t] || 0) + 1;
    }

    // Draft override rate = draft_override feedback count / total emails_generated
    const draftOverrideCount = breakdown['draft_override'] ?? 0;
    const gateOverrideCount = breakdown['gate_override'] ?? 0;
    const totalEmailsGenerated = windowRuns.reduce(
      (sum, r) => sum + (r.emails_generated ?? 0),
      0
    );
    const overrideRate =
      totalEmailsGenerated > 0 ? draftOverrideCount / totalEmailsGenerated : 0;

    // Average QA pass rate across the 5 runs
    const qaPassRates = windowRuns
      .filter((r) => (r.outlets_discovered ?? 0) > 0)
      .map((r) => (r.outlets_qa_passed ?? 0) / (r.outlets_discovered ?? 1));
    const avgQaPassRate =
      qaPassRates.length > 0
        ? qaPassRates.reduce((a, b) => a + b, 0) / qaPassRates.length
        : 0;

    // Build recommendations
    const recommendations: string[] = [];
    if (overrideRate > 0.3) {
      recommendations.push(
        'High draft override rate detected. Review pitch angle templates and tone guidelines to reduce manual edits.'
      );
    }
    if (gateOverrideCount > 2) {
      recommendations.push(
        'Frequent gate overrides suggest QA thresholds may be miscalibrated. Consider lowering pass criteria or reviewing scoring weights.'
      );
    }
    if (avgQaPassRate < 0.5) {
      recommendations.push(
        'Low QA pass rate. Refine initial discovery filters and verification criteria to improve outlet quality.'
      );
    }
    if ((breakdown['wrong_contact'] ?? 0) > 3) {
      recommendations.push(
        'Multiple wrong_contact flags. Audit contact discovery sources and add manual review for low-confidence emails.'
      );
    }
    if ((breakdown['tone_mismatch'] ?? 0) > 2) {
      recommendations.push(
        'Recurring tone mismatch feedback. Update client voice profile and pitch norms for this territory.'
      );
    }
    if (recommendations.length === 0) {
      recommendations.push('Pipeline performance within normal parameters. No immediate calibration needed.');
    }

    const periodStart = windowRuns[0].created_at;
    const periodEnd = windowRuns[windowRuns.length - 1].created_at;
    const runStart = i - windowSize + 1;
    const runEnd = i;

    snapshots.push({
      run_range: `Runs ${runStart}-${runEnd}`,
      period: {
        from: periodStart,
        to: periodEnd,
      },
      override_rate: Math.round(overrideRate * 1000) / 1000,
      gate_override_count: gateOverrideCount,
      qa_pass_rate: Math.round(avgQaPassRate * 1000) / 1000,
      feedback_total: feedback.length,
      feedback_breakdown: breakdown,
      recommendations,
    });
  }

  return successResponse({
    snapshots,
    runs_completed: runs.length,
    next_snapshot_at_run: Math.ceil(runs.length / windowSize) * windowSize + windowSize,
  });
}
