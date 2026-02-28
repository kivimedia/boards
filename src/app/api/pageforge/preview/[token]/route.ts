import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Public API - NO AUTH REQUIRED.
 * GET /api/pageforge/preview/[token]
 * Returns sanitized build data for client preview.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface Params {
  params: { token: string };
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { token } = params;

  if (!token || token.length < 16) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }

  // Look up the token
  const { data: previewToken, error: tokenErr } = await supabase
    .from('pageforge_preview_tokens')
    .select('*')
    .eq('token', token)
    .eq('is_revoked', false)
    .single();

  if (tokenErr || !previewToken) {
    return NextResponse.json({ error: 'Preview link not found or has been revoked' }, { status: 404 });
  }

  // Check expiration
  if (new Date(previewToken.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Preview link has expired' }, { status: 410 });
  }

  // Fetch the build with phases
  const { data: build, error: buildErr } = await supabase
    .from('pageforge_builds')
    .select('*, site_profile:pageforge_site_profiles(site_name)')
    .eq('id', previewToken.build_id)
    .single();

  if (buildErr || !build) {
    return NextResponse.json({ error: 'Build not found' }, { status: 404 });
  }

  // Fetch phases
  const { data: phases } = await supabase
    .from('pageforge_build_phases')
    .select('phase_name, phase_index, status, started_at, completed_at, duration_ms')
    .eq('build_id', previewToken.build_id)
    .order('phase_index', { ascending: true });

  // Build sanitized artifacts (screenshots only)
  const artifacts = (build.artifacts ?? {}) as Record<string, string>;
  const screenshots: Record<string, { figma?: string; wp?: string }> = {};
  for (const viewport of ['desktop', 'tablet', 'mobile']) {
    const figma = artifacts[`figma_screenshot_${viewport}`];
    const wp = artifacts[`wp_screenshot_${viewport}`];
    if (figma || wp) {
      screenshots[viewport] = {};
      if (figma) screenshots[viewport].figma = figma;
      if (wp) screenshots[viewport].wp = wp;
    }
  }

  // QA summary from phase_results
  const qaResults = (build.phase_results?.functional_qa ?? {}) as Record<string, unknown>;
  const qaItems = (qaResults.checks ?? []) as Array<{ name: string; passed: boolean; message?: string }>;

  // Sanitized response - no credentials, no internal IDs beyond build_id
  const response = {
    build: {
      id: build.id,
      page_title: build.page_title,
      page_slug: build.page_slug,
      site_name: build.site_profile?.site_name ?? null,
      status: build.status,
      vqa_scores: {
        desktop: build.vqa_score_desktop,
        tablet: build.vqa_score_tablet,
        mobile: build.vqa_score_mobile,
        overall: build.vqa_score_overall,
      },
      lighthouse_scores: {
        performance: build.lighthouse_performance,
        accessibility: build.lighthouse_accessibility,
        best_practices: build.lighthouse_best_practices,
        seo: build.lighthouse_seo,
      },
      qa_checks: {
        passed: build.qa_checks_passed,
        failed: build.qa_checks_failed,
        total: build.qa_checks_total,
        items: qaItems.map((item) => ({
          name: item.name,
          passed: item.passed,
          message: item.message ?? null,
        })),
      },
      wp_preview_url: build.wp_preview_url ?? null,
      wp_live_url: build.wp_live_url ?? null,
      screenshots,
      phase_timeline: (phases ?? []).map((p) => ({
        name: p.phase_name,
        index: p.phase_index,
        status: p.status,
        duration_ms: p.duration_ms,
      })),
      created_at: build.created_at,
    },
  };

  return NextResponse.json(response);
}
