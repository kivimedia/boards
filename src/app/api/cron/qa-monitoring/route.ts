import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getDueMonitoringConfigs, runMonitoringCheck } from '@/lib/ai/dev-qa';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min max for monitoring multiple URLs

/**
 * GET /api/cron/qa-monitoring
 * Daily cron job (3:00 AM UTC) that runs QA monitoring on configured URLs.
 * Checks Lighthouse scores, link health, and WCAG compliance.
 * Alerts on regressions exceeding the configured threshold.
 *
 * Protected by CRON_SECRET bearer token.
 */
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  try {
    // Get all configs that are due for a run
    const dueConfigs = await getDueMonitoringConfigs(supabase);

    if (dueConfigs.length === 0) {
      return NextResponse.json({
        message: 'No monitoring configs due for a run',
        checked: 0,
        regressions: 0,
      });
    }

    let totalRegressions = 0;
    const results: Array<{
      url: string;
      configId: string;
      lighthouseScores: Record<string, number> | null;
      brokenLinks: number;
      totalLinks: number;
      wcagCompliance: number | null;
      regressionCount: number;
    }> = [];

    // Process each config sequentially (to avoid overloading Browserless)
    for (const config of dueConfigs) {
      try {
        const result = await runMonitoringCheck(supabase, config);
        const regressionCount = Object.keys(result.regressions).length;
        totalRegressions += regressionCount;

        results.push({
          url: config.url,
          configId: config.id,
          lighthouseScores: result.lighthouseScores as Record<string, number> | null,
          brokenLinks: result.linkCheckSummary.broken,
          totalLinks: result.linkCheckSummary.total,
          wcagCompliance: result.wcagReport?.compliancePercentage ?? null,
          regressionCount,
        });

        // If regressions detected, store an alert via productivity_alerts pattern
        if (regressionCount > 0 && config.board_id) {
          for (const [category, regression] of Object.entries(result.regressions)) {
            await supabase.from('productivity_alerts').insert({
              board_id: config.board_id,
              metric_name: 'ai_pass_rate', // Reuse closest metric type
              current_value: regression.current,
              threshold_value: regression.previous,
              alert_type: 'below_threshold',
              severity: regression.drop > 20 ? 'critical' : 'warning',
              metadata: {
                source: 'qa_monitoring',
                url: config.url,
                category,
                drop: regression.drop,
              },
            });
          }
        }
      } catch (err) {
        console.error(`[QAMonitoring] Failed for ${config.url}:`, err);
        results.push({
          url: config.url,
          configId: config.id,
          lighthouseScores: null,
          brokenLinks: 0,
          totalLinks: 0,
          wcagCompliance: null,
          regressionCount: 0,
        });
      }
    }

    return NextResponse.json({
      message: 'QA monitoring cron complete',
      checked: results.length,
      regressions: totalRegressions,
      results,
    });
  } catch (err) {
    console.error('[QAMonitoring] Cron error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Monitoring cron failed' },
      { status: 500 }
    );
  }
}
