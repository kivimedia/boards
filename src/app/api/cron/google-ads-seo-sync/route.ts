import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import * as gadsAccount from '@/lib/integrations/google-ads-account';
import { sanitizeMcpOutput, logSanitizationEvent } from '@/lib/ai/agent-tools';

const CRON_SECRET = process.env.CRON_SECRET || '';

/**
 * Monthly Google Ads + SEO sync cron.
 * Cross-references organic rankings with paid keywords.
 * Identifies opportunities where organic can replace paid (cost savings).
 * Generates efficiency report in seo_ads_reports table.
 *
 * POST /api/cron/google-ads-seo-sync
 * Header: Authorization: Bearer <CRON_SECRET>
 */
export async function POST(request: Request) {
  // Verify cron authorization
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();

  // Get all active team configs with Google Ads credentials
  const { data: configs } = await supabase
    .from('seo_team_configs')
    .select('id, google_credentials, site_url')
    .eq('is_active', true);

  if (!configs?.length) {
    return NextResponse.json({ message: 'No active team configs' });
  }

  const results: Array<{ teamConfigId: string; status: string; report?: unknown }> = [];

  for (const config of configs) {
    const hasGads = config.google_credentials?.google_ads?.customer_id;
    if (!hasGads) {
      results.push({ teamConfigId: config.id, status: 'skipped - no google ads credentials' });
      continue;
    }

    try {
      // Fetch keyword performance and search terms
      const [keywordsRes, searchTermsRes] = await Promise.allSettled([
        gadsAccount.getKeywordPerformance({ teamConfigId: config.id }),
        gadsAccount.getSearchTermsReport({ teamConfigId: config.id }, undefined, 30),
      ]);

      const keywords = keywordsRes.status === 'fulfilled' ? keywordsRes.value.data : null;
      const searchTerms = searchTermsRes.status === 'fulfilled' ? searchTermsRes.value.data : null;

      // Build efficiency report
      const reportData = {
        period: new Date().toISOString().slice(0, 7), // YYYY-MM
        total_keywords: Array.isArray(keywords) ? keywords.length : 0,
        total_search_terms: Array.isArray(searchTerms) ? searchTerms.length : 0,
        organic_replacing_paid: 0,
        transition_candidates: 0,
        monthly_savings: 0,
        top_opportunities: [] as Array<{ keyword: string; monthly_cost: number; organic_position?: number }>,
      };

      // Identify transition candidates (keywords where we might have organic coverage)
      if (Array.isArray(searchTerms)) {
        for (const term of searchTerms) {
          if (term.has_organic_content === true && term.cost > 0) {
            reportData.organic_replacing_paid++;
            reportData.monthly_savings += term.cost;
          }
          if (term.has_organic_content === false && term.impressions > 100) {
            reportData.transition_candidates++;
            if (reportData.top_opportunities.length < 10) {
              reportData.top_opportunities.push({
                keyword: term.search_term,
                monthly_cost: term.cost,
              });
            }
          }
        }
      }

      // Sanitize report data before storing
      const raw = JSON.stringify(reportData);
      const sanitized = sanitizeMcpOutput(raw, 'cron_seo_sync', config.id);
      if (sanitized.flags.length > 0) {
        await logSanitizationEvent(supabase, 'cron_seo_sync', config.id, raw, sanitized.flags, 'sanitized');
      }

      // Store report
      await supabase.from('seo_ads_reports').insert({
        team_config_id: config.id,
        report_type: 'monthly_efficiency',
        report_data: reportData,
      });

      results.push({ teamConfigId: config.id, status: 'success', report: reportData });
    } catch (err) {
      results.push({
        teamConfigId: config.id,
        status: `error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return NextResponse.json({ results, timestamp: new Date().toISOString() });
}
