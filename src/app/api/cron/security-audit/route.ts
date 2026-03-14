import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const CRON_SECRET = process.env.CRON_SECRET || '';

/**
 * Weekly security audit cron.
 * Reviews security_audit_log for the past 7 days.
 * Generates a summary report and flags anomalies.
 *
 * POST /api/cron/security-audit
 * Header: Authorization: Bearer <CRON_SECRET>
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch recent audit events
  const { data: events, error } = await supabase
    .from('security_audit_log')
    .select('*')
    .gte('created_at', weekAgo)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const totalEvents = events?.length || 0;

  // Categorize flags
  const flagCounts: Record<string, number> = {};
  const toolCounts: Record<string, number> = {};
  let injectionPatternCount = 0;
  let truncationCount = 0;
  let htmlStrippedCount = 0;

  for (const event of events || []) {
    toolCounts[event.tool_name] = (toolCounts[event.tool_name] || 0) + 1;
    for (const flag of event.flags || []) {
      flagCounts[flag] = (flagCounts[flag] || 0) + 1;
      if (flag.startsWith('injection_pattern:')) injectionPatternCount++;
      if (flag.startsWith('truncated:')) truncationCount++;
      if (flag === 'html_script_stripped') htmlStrippedCount++;
    }
  }

  // Determine severity
  let severity: 'CLEAR' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'CLEAR';
  if (totalEvents > 0) severity = 'LOW';
  if (injectionPatternCount > 0) severity = 'HIGH';
  if (injectionPatternCount > 5) severity = 'CRITICAL';

  const report = {
    period: { start: weekAgo, end: new Date().toISOString() },
    severity,
    total_events: totalEvents,
    injection_patterns: injectionPatternCount,
    html_stripped: htmlStrippedCount,
    truncations: truncationCount,
    events_by_tool: toolCounts,
    flag_breakdown: flagCounts,
    requires_human_review: severity === 'HIGH' || severity === 'CRITICAL',
    recommendation: severity === 'CRITICAL'
      ? 'IMMEDIATE: Multiple injection patterns detected. Review security_audit_log and consider temporarily disabling affected data sources.'
      : severity === 'HIGH'
        ? 'Review injection pattern events in security_audit_log. May be false positives from ad creative HTML.'
        : severity === 'LOW'
          ? 'Normal operation. Events are within expected parameters.'
          : 'No security events this period.',
  };

  // Store report in seo_ads_reports with security type
  await supabase.from('seo_ads_reports').insert({
    report_type: 'weekly_security_audit',
    report_data: report,
  });

  return NextResponse.json({ report, timestamp: new Date().toISOString() });
}
