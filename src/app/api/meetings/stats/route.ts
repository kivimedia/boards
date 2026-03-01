import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/meetings/stats
 * Return aggregate meeting statistics.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  try {
    // 1. Total recordings count
    const { count: total, error: totalError } = await supabase
      .from('fathom_recordings')
      .select('id', { count: 'exact', head: true });

    if (totalError) throw totalError;

    // 2. This week's count (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoISO = sevenDaysAgo.toISOString();

    const { count: thisWeek, error: weekError } = await supabase
      .from('fathom_recordings')
      .select('id', { count: 'exact', head: true })
      .gte('recorded_at', sevenDaysAgoISO);

    if (weekError) throw weekError;

    // 3. Average duration_seconds
    const { data: avgData, error: avgError } = await supabase
      .from('fathom_recordings')
      .select('duration_seconds')
      .not('duration_seconds', 'is', null);

    if (avgError) throw avgError;

    let avgDuration = 0;
    if (avgData && avgData.length > 0) {
      const sum = avgData.reduce(
        (acc: number, r: { duration_seconds: number }) => acc + (r.duration_seconds || 0),
        0
      );
      avgDuration = Math.round(sum / avgData.length);
    }

    // 4. Count by processing_status
    const { data: statusData, error: statusError } = await supabase
      .from('fathom_recordings')
      .select('processing_status');

    if (statusError) throw statusError;

    const byStatus: Record<string, number> = {};
    for (const row of statusData || []) {
      const status = (row as { processing_status: string }).processing_status || 'unknown';
      byStatus[status] = (byStatus[status] || 0) + 1;
    }

    // 5. Top 5 clients by meeting count
    const { data: clientData, error: clientError } = await supabase
      .from('fathom_recordings')
      .select('matched_client_id, clients:matched_client_id (id, name)')
      .not('matched_client_id', 'is', null);

    if (clientError) throw clientError;

    const clientCounts: Record<string, { id: string; name: string; count: number }> = {};
    for (const row of clientData || []) {
      const rec = row as unknown as {
        matched_client_id: string;
        clients: { id: string; name: string } | null;
      };
      if (!rec.matched_client_id) continue;
      if (!clientCounts[rec.matched_client_id]) {
        clientCounts[rec.matched_client_id] = {
          id: rec.matched_client_id,
          name: rec.clients?.name || 'Unknown',
          count: 0,
        };
      }
      clientCounts[rec.matched_client_id].count++;
    }

    const topClients = Object.values(clientCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // 6. Unmatched count (needs_review)
    const { count: unmatched, error: unmatchedError } = await supabase
      .from('fathom_recordings')
      .select('id', { count: 'exact', head: true })
      .eq('processing_status', 'needs_review');

    if (unmatchedError) throw unmatchedError;

    return NextResponse.json({
      total: total || 0,
      this_week: thisWeek || 0,
      avg_duration: avgDuration,
      by_status: byStatus,
      top_clients: topClients,
      unmatched: unmatched || 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[meetings/stats] Failed to fetch stats:', message);
    return errorResponse(`Failed to fetch meeting stats: ${message}`, 500);
  }
}
