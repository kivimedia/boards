import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { PKTrackerType } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Mapping from tracker_type to Supabase table name.
 */
const TRACKER_TABLES: Record<string, string> = {
  fathom_videos: 'pk_fathom_videos',
  client_updates: 'pk_client_updates',
  ticket_updates: 'pk_ticket_updates',
  daily_goals: 'pk_daily_goals',
  sanity_checks: 'pk_sanity_checks',
  sanity_tests: 'pk_sanity_tests',
  pics_monitoring: 'pk_pics_monitoring',
  flagged_tickets: 'pk_flagged_tickets',
  weekly_tickets: 'pk_weekly_tickets',
  pingdom_tests: 'pk_pingdom_tests',
  google_ads_reports: 'pk_google_ads_reports',
  monthly_summaries: 'pk_monthly_summaries',
  update_schedule: 'pk_update_schedule',
  holiday_tracking: 'pk_holiday_tracking',
  website_status: 'pk_website_status',
  google_analytics_status: 'pk_google_analytics_status',
  other_activities: 'pk_other_activities',
};

/**
 * Date column used for each tracker type (for date-range filtering).
 */
const DATE_COLUMNS: Record<string, string> = {
  fathom_videos: 'meeting_date',
  client_updates: 'date_sent',
  ticket_updates: 'created_at',
  daily_goals: 'entry_date',
  sanity_checks: 'check_date',
  sanity_tests: 'test_date',
  pics_monitoring: 'check_date',
  flagged_tickets: 'created_at',
  weekly_tickets: 'created_at',
  pingdom_tests: 'test_date',
  google_ads_reports: 'created_at',
  monthly_summaries: 'created_at',
  update_schedule: 'created_at',
  holiday_tracking: 'created_at',
  website_status: 'created_at',
  google_analytics_status: 'created_at',
  other_activities: 'created_at',
};

/**
 * GET /api/performance/tracker
 * Query data from a specific PK tracker table.
 *
 * Query params:
 *   type     (required) - tracker type (e.g. fathom_videos)
 *   am       (optional) - filter by account_manager_name
 *   from     (optional) - date range start (ISO date)
 *   to       (optional) - date range end (ISO date)
 *   limit    (optional) - max rows, default 200
 *   offset   (optional) - offset for pagination
 *   sort     (optional) - column to sort by (default: date column or created_at)
 *   order    (optional) - asc or desc (default: desc)
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { searchParams } = new URL(request.url);

  const trackerType = searchParams.get('type') as PKTrackerType | null;
  if (!trackerType || !TRACKER_TABLES[trackerType]) {
    return errorResponse(
      `Invalid or missing tracker type. Valid types: ${Object.keys(TRACKER_TABLES).join(', ')}`
    );
  }

  const tableName = TRACKER_TABLES[trackerType];
  const amFilter = searchParams.get('am');
  const fromDate = searchParams.get('from');
  const toDate = searchParams.get('to');
  const limit = Math.min(parseInt(searchParams.get('limit') || '200', 10), 1000);
  const offset = parseInt(searchParams.get('offset') || '0', 10);
  const sortCol = searchParams.get('sort') || DATE_COLUMNS[trackerType] || 'created_at';
  const sortOrder = searchParams.get('order') === 'asc' ? true : false;

  let query = supabase
    .from(tableName)
    .select('*', { count: 'exact' })
    .order(sortCol, { ascending: sortOrder })
    .range(offset, offset + limit - 1);

  // Filter by account manager name (most tracker tables have this column)
  if (amFilter) {
    query = query.eq('account_manager_name', amFilter);
  }

  // Date range filter
  const dateCol = DATE_COLUMNS[trackerType];
  if (dateCol && fromDate) {
    query = query.gte(dateCol, fromDate);
  }
  if (dateCol && toDate) {
    query = query.lte(dateCol, toDate);
  }

  const { data, error, count } = await query;

  if (error) return errorResponse(error.message, 500);

  return successResponse({
    tracker_type: trackerType,
    rows: data || [],
    total: count || 0,
    limit,
    offset,
  });
}
