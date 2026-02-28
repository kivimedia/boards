import { SupabaseClient } from '@supabase/supabase-js';
import { wpTestConnection, createWpClient } from '../../integrations/wordpress-client';
import { wpCliTestConnection } from '../../integrations/wp-cli-client';
import { figmaTestConnection } from '../../integrations/figma-client';
import { callPageForgeAgent } from '../pageforge-pipeline';
import { getSystemPrompt } from '../prompt-templates';
import type { PageForgeSiteProfile, PageForgeBuild, PageForgeAgentCall } from '../../types';

// ============================================================================
// ORCHESTRATOR AGENT
// Manages preflight checks, final report compilation, and cost calculation.
// ============================================================================

export interface PreflightResult {
  passed: boolean;
  checks: PreflightCheck[];
  errors: string[];
}

export interface PreflightCheck {
  name: string;
  passed: boolean;
  message: string;
  details?: string;
}

/**
 * Run preflight checks before a build starts.
 * Validates: WP REST, WP SSH (if configured), Figma token, page builder plugin.
 */
export async function runPreflight(
  supabase: SupabaseClient,
  buildId: string,
  siteProfile: PageForgeSiteProfile
): Promise<PreflightResult> {
  const checks: PreflightCheck[] = [];
  const errors: string[] = [];

  // 1. WordPress REST API connection
  if (siteProfile.wp_username && siteProfile.wp_app_password) {
    const wpResult = await wpTestConnection({
      restUrl: siteProfile.wp_rest_url,
      username: siteProfile.wp_username,
      appPassword: siteProfile.wp_app_password,
    });
    checks.push({
      name: 'WordPress REST API',
      passed: wpResult.ok,
      message: wpResult.ok ? `Connected to ${wpResult.siteName}` : wpResult.error || 'Connection failed',
    });
    if (!wpResult.ok) errors.push(`WP REST: ${wpResult.error}`);
  } else {
    checks.push({
      name: 'WordPress REST API',
      passed: false,
      message: 'WordPress credentials not configured',
    });
    errors.push('WordPress credentials not configured');
  }

  // 2. WordPress SSH (optional)
  if (siteProfile.wp_ssh_host && siteProfile.wp_ssh_user) {
    const sshResult = await wpCliTestConnection({
      host: siteProfile.wp_ssh_host,
      user: siteProfile.wp_ssh_user,
      keyPath: siteProfile.wp_ssh_key_path || undefined,
    });
    checks.push({
      name: 'WordPress SSH/WP-CLI',
      passed: sshResult.ok,
      message: sshResult.ok ? `WP-CLI ${sshResult.wpCliVersion}` : sshResult.error || 'SSH failed',
    });
    if (!sshResult.ok) {
      // SSH is optional, log warning but don't fail
      checks[checks.length - 1].details = 'SSH is optional; REST API deploy will be used';
    }
  }

  // 3. Figma token
  if (siteProfile.figma_personal_token) {
    const figmaResult = await figmaTestConnection(siteProfile.figma_personal_token);
    checks.push({
      name: 'Figma Access',
      passed: figmaResult.ok,
      message: figmaResult.ok ? `Authenticated as ${figmaResult.email}` : figmaResult.error || 'Auth failed',
    });
    if (!figmaResult.ok) errors.push(`Figma: ${figmaResult.error}`);
  } else {
    checks.push({
      name: 'Figma Access',
      passed: false,
      message: 'Figma token not configured',
    });
    errors.push('Figma personal access token not configured');
  }

  // 4. Page builder check via plugin list
  if (siteProfile.wp_username && siteProfile.wp_app_password) {
    const client = createWpClient({
      restUrl: siteProfile.wp_rest_url,
      username: siteProfile.wp_username,
      appPassword: siteProfile.wp_app_password,
    });

    try {
      const { wpIsPluginActive } = await import('../../integrations/wordpress-client');
      const builder = siteProfile.page_builder;

      if (builder === 'divi5' || builder === 'divi4') {
        const diviActive = await wpIsPluginActive(client, 'divi');
        checks.push({
          name: `Page Builder (${builder})`,
          passed: diviActive,
          message: diviActive ? 'Divi theme/plugin active' : 'Divi not detected (plugin list may require admin)',
        });
      } else {
        // Gutenberg is always available in WP 5+
        checks.push({
          name: 'Page Builder (Gutenberg)',
          passed: true,
          message: 'Gutenberg is built-in',
        });
      }
    } catch {
      checks.push({
        name: 'Page Builder Check',
        passed: true,
        message: 'Could not verify plugins (may need admin privileges), proceeding',
      });
    }
  }

  const passed = errors.length === 0;
  return { passed, checks, errors };
}

/**
 * Compile a final human-readable build report.
 */
export async function compileFinalReport(
  supabase: SupabaseClient,
  buildId: string,
  build: PageForgeBuild,
  agentCalls: PageForgeAgentCall[]
): Promise<string> {
  const systemPrompt = getSystemPrompt('pageforge_orchestrator');

  const userMessage = `Compile a final build report for this PageForge build.

Build ID: ${buildId}
Page Title: ${build.page_title}
Page Builder: ${build.page_builder}
Status: ${build.status}

VQA Scores:
- Desktop: ${build.vqa_score_desktop ?? 'N/A'}%
- Tablet: ${build.vqa_score_tablet ?? 'N/A'}%
- Mobile: ${build.vqa_score_mobile ?? 'N/A'}%
- Overall: ${build.vqa_score_overall ?? 'N/A'}%

Lighthouse:
- Performance: ${build.lighthouse_performance ?? 'N/A'}
- Accessibility: ${build.lighthouse_accessibility ?? 'N/A'}
- Best Practices: ${build.lighthouse_best_practices ?? 'N/A'}
- SEO: ${build.lighthouse_seo ?? 'N/A'}

QA: ${build.qa_checks_passed}/${build.qa_checks_total} checks passed

Total Cost: $${build.total_cost_usd.toFixed(4)}
Agent Calls: ${agentCalls.length}
VQA Fix Iterations: ${build.vqa_fix_iteration}

Phase Results Summary:
${JSON.stringify(build.phase_results, null, 2).slice(0, 3000)}

WordPress URLs:
- Draft: ${build.wp_draft_url || 'N/A'}
- Preview: ${build.wp_preview_url || 'N/A'}
- Live: ${build.wp_live_url || 'N/A'}

Please compile a clear, concise report suitable for the AM to share with the client.`;

  const result = await callPageForgeAgent(
    supabase,
    buildId,
    'pageforge_report',
    'report_generation',
    systemPrompt,
    userMessage,
    { activity: 'pageforge_orchestrator' }
  );

  return result.text;
}

/**
 * Calculate total build cost from agent calls.
 */
export function calculateBuildCost(agentCalls: PageForgeAgentCall[]): {
  totalCost: number;
  byCost: Record<string, number>;
  byPhase: Record<string, number>;
} {
  const byCost: Record<string, number> = {};
  const byPhase: Record<string, number> = {};

  for (const call of agentCalls) {
    const cost = Number(call.cost_usd) || 0;
    byCost[call.agent_name] = (byCost[call.agent_name] || 0) + cost;
    byPhase[call.phase] = (byPhase[call.phase] || 0) + cost;
  }

  const totalCost = Object.values(byCost).reduce((sum, v) => sum + v, 0);
  return { totalCost, byCost, byPhase };
}
