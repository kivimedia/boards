import { NextRequest } from 'next/server';
import { errorResponse, successResponse } from '@/lib/api-helpers';
import { getPageForgeAuth } from '@/lib/pageforge-auth';
import { getProviderKey } from '@/lib/ai/providers';
import { logUsage } from '@/lib/ai/cost-tracker';
import { runAutoName } from '@/lib/ai/pageforge-auto-name';
import type { PageForgeNamingIssue } from '@/lib/types';

interface Params {
  params: { id: string };
}

// ============================================================================
// GET HANDLER
// ============================================================================

/**
 * GET /api/pageforge/builds/[id]/auto-name
 * Returns pre-computed auto-name suggestions from build artifacts.
 * Used by the Figma plugin to load results without triggering AI.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const auth = await getPageForgeAuth(request, 'pageforge:read');
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const buildId = params.id;

  const { data: build, error } = await (supabase as any)
    .from('pageforge_builds')
    .select('artifacts')
    .eq('id', buildId)
    .single();

  if (error || !build) {
    return errorResponse('Build not found', 404);
  }

  const artifacts = (build.artifacts || {}) as Record<string, any>;
  const autoNameData = artifacts.auto_name || artifacts.auto_name_results;

  if (!autoNameData) {
    return successResponse({
      status: 'not_ready',
      renames: [],
      message: 'Auto-name has not run yet for this build',
    });
  }

  if (autoNameData.skipped) {
    return successResponse({
      status: 'skipped',
      renames: [],
      message: autoNameData.reason || 'No naming issues found',
    });
  }

  return successResponse({
    status: 'ready',
    renames: autoNameData.renames || [],
    issue_count: autoNameData.issue_count,
    rename_count: autoNameData.rename_count,
    generated_at: autoNameData.generated_at,
    had_screenshot: autoNameData.had_screenshot,
    duration_ms: autoNameData.duration_ms,
  });
}

// ============================================================================
// POST HANDLER
// ============================================================================

/**
 * POST /api/pageforge/builds/[id]/auto-name
 * Use AI vision to suggest proper Figma layer names for layers with generic names.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getPageForgeAuth(request);
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;
  const buildId = params.id;
  const startTime = Date.now();

  // -----------------------------------------------------------------------
  // 1. Fetch build + site profile
  // -----------------------------------------------------------------------
  let build: any;
  try {
    const { data, error } = await (supabase as any)
      .from('pageforge_builds')
      .select('*, site_profile:pageforge_site_profiles(*)')
      .eq('id', buildId)
      .single();

    if (error || !data) {
      return errorResponse('Build not found', 404);
    }
    build = data;
  } catch (err) {
    console.error('[auto-name] Failed to fetch build:', err);
    return errorResponse('Failed to fetch build', 500);
  }

  const siteProfile = build.site_profile;

  // -----------------------------------------------------------------------
  // 2. Validate required fields
  // -----------------------------------------------------------------------
  if (!build.figma_file_key) {
    return errorResponse('Build has no Figma file key');
  }

  if (!siteProfile?.figma_personal_token) {
    return errorResponse('Site profile has no Figma personal token configured');
  }

  const artifacts = (build.artifacts || {}) as Record<string, any>;
  const namingData = artifacts.preflight?.figma_naming;

  if (!namingData?.issues || namingData.issues.length === 0) {
    return errorResponse('No naming issues found in preflight data');
  }

  const namingIssues: PageForgeNamingIssue[] = namingData.issues;

  // -----------------------------------------------------------------------
  // 3. Get Google API key
  // -----------------------------------------------------------------------
  const apiKey = await getProviderKey(supabase, 'google');
  if (!apiKey) {
    return errorResponse('Google AI API key not configured');
  }

  // -----------------------------------------------------------------------
  // 4. Run auto-name via shared module
  // -----------------------------------------------------------------------
  let result;
  try {
    result = await runAutoName({
      figmaFileKey: build.figma_file_key,
      figmaPersonalToken: siteProfile.figma_personal_token,
      figmaNodeIds: build.figma_node_ids,
      namingIssues,
      googleApiKey: apiKey,
    });
  } catch (err) {
    const durationMs = Date.now() - startTime;

    // Log the failed attempt
    try {
      await logUsage(supabase, {
        userId,
        activity: 'pageforge_orchestrator',
        provider: 'google',
        modelId: 'gemini-2.5-flash',
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: durationMs,
        status: 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
        metadata: { buildId, endpoint: 'auto-name' },
      });
    } catch (logErr) {
      console.error('[auto-name] Failed to log usage:', logErr);
    }

    return errorResponse(
      `AI naming failed: ${err instanceof Error ? err.message : String(err)}`,
      502
    );
  }

  // -----------------------------------------------------------------------
  // 5. Log usage
  // -----------------------------------------------------------------------
  try {
    await logUsage(supabase, {
      userId,
      activity: 'pageforge_orchestrator',
      provider: 'google',
      modelId: 'gemini-2.5-flash',
      inputTokens: result.input_tokens,
      outputTokens: result.output_tokens,
      latencyMs: result.duration_ms,
      status: 'success',
      metadata: {
        buildId,
        endpoint: 'auto-name',
        issueCount: result.issue_count,
        renameCount: result.rename_count,
        hadScreenshot: result.had_screenshot,
      },
    });
  } catch (logErr) {
    console.error('[auto-name] Failed to log usage:', logErr);
  }

  // -----------------------------------------------------------------------
  // 6. Store results in build artifacts
  // -----------------------------------------------------------------------
  const autoNameResults = {
    renames: result.renames,
    generated_at: result.generated_at,
    model: result.model,
    issue_count: result.issue_count,
    rename_count: result.rename_count,
    had_screenshot: result.had_screenshot,
    duration_ms: result.duration_ms,
  };

  try {
    const updatedArtifacts = {
      ...artifacts,
      auto_name: autoNameResults,
    };

    const { error: updateError } = await (supabase as any)
      .from('pageforge_builds')
      .update({
        artifacts: updatedArtifacts,
        updated_at: new Date().toISOString(),
      })
      .eq('id', buildId);

    if (updateError) {
      console.error('[auto-name] Failed to save results to build artifacts:', updateError);
      // Still return results even if storage fails
    }
  } catch (saveErr) {
    console.error('[auto-name] Failed to save results:', saveErr);
  }

  // -----------------------------------------------------------------------
  // 7. Return results
  // -----------------------------------------------------------------------
  return successResponse({
    renames: result.renames,
    issue_count: result.issue_count,
    rename_count: result.rename_count,
    had_screenshot: result.had_screenshot,
    duration_ms: result.duration_ms,
  });
}
