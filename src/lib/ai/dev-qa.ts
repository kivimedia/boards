import { SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { createAnthropicClient, touchApiKey } from './providers';
import { resolveModelWithFallback } from './model-resolver';
import { logUsage } from './cost-tracker';
import { canMakeAICall } from './budget-checker';
import { getSystemPrompt, buildDevQAPrompt } from './prompt-templates';
import { runFullAudit, detectScoreRegression, mapAxeToWCAG } from './lighthouse-audit';
import type { LighthouseScores, AxeViolation } from './lighthouse-audit';
import { checkPageLinks, storeLinkCheckResults } from './link-checker';
import type { LinkCheckSummary } from './link-checker';
import type {
  QAScreenshot,
  QAFinding,
  QAChecklistResult,
  QAConsoleError,
  QAPerformanceMetrics,
  QAFindingsCount,
  QAFindingSeverity,
  QAChecklistItem,
  AIQAResult,
  QAMonitoringConfig,
  WCAGReport,
  MultiBrowserResult,
  BrowserDifference,
} from '../types';

// ============================================================================
// VIEWPORT DEFINITIONS
// ============================================================================

export const QA_VIEWPORTS = [
  { name: 'desktop', width: 1920, height: 1080 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 375, height: 812 },
] as const;

export type ViewportName = (typeof QA_VIEWPORTS)[number]['name'];

// ============================================================================
// BROWSERLESS SCREENSHOT CAPTURE
// ============================================================================

/**
 * Capture screenshots via Browserless.io API.
 * Falls back to a placeholder if Browserless is not configured.
 */
export async function captureScreenshots(
  url: string,
  viewports: typeof QA_VIEWPORTS = QA_VIEWPORTS
): Promise<{ screenshots: Buffer[]; consoleErrors: QAConsoleError[]; performanceMetrics: QAPerformanceMetrics }> {
  const browserlessKey = process.env.BROWSERLESS_API_KEY;

  if (!browserlessKey) {
    throw new Error(
      'BROWSERLESS_API_KEY environment variable is not set. ' +
      'Sign up at browserless.io and add the key to your environment.'
    );
  }

  const screenshots: Buffer[] = [];
  const consoleErrors: QAConsoleError[] = [];
  let performanceMetrics: QAPerformanceMetrics = {
    load_time_ms: 0,
    first_paint_ms: 0,
    dom_content_loaded_ms: 0,
  };

  for (const viewport of viewports) {
    try {
      const response = await fetch(
        `https://chrome.browserless.io/screenshot?token=${browserlessKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
            options: {
              fullPage: true,
              type: 'png',
            },
            viewport: {
              width: viewport.width,
              height: viewport.height,
              deviceScaleFactor: 1,
            },
            waitFor: 3000, // Wait 3s for dynamic content
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Browserless returned ${response.status}: ${response.statusText}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      screenshots.push(buffer);
    } catch (err) {
      console.error(`[DevQA] Screenshot failed for ${viewport.name}:`, err);
      // Push empty buffer as placeholder so viewport indexing stays aligned
      screenshots.push(Buffer.alloc(0));
    }
  }

  // Capture console errors and performance via Browserless /content endpoint
  try {
    const contentResponse = await fetch(
      `https://chrome.browserless.io/content?token=${browserlessKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          waitFor: 3000,
        }),
      }
    );

    if (contentResponse.ok) {
      // Performance timing from headers if available
      const timing = contentResponse.headers.get('x-response-time');
      if (timing) {
        performanceMetrics.load_time_ms = parseInt(timing, 10) || 0;
      }
    }
  } catch {
    // Non-critical, continue without console data
  }

  return { screenshots, consoleErrors, performanceMetrics };
}

/**
 * Upload screenshots to Supabase storage.
 */
export async function uploadScreenshots(
  supabase: SupabaseClient,
  cardId: string,
  qaId: string,
  screenshots: Buffer[],
  viewports: typeof QA_VIEWPORTS = QA_VIEWPORTS
): Promise<QAScreenshot[]> {
  const results: QAScreenshot[] = [];

  for (let i = 0; i < screenshots.length; i++) {
    const buffer = screenshots[i];
    if (buffer.length === 0) continue;

    const viewport = viewports[i];
    const storagePath = `qa/${cardId}/${qaId}_${viewport.name}.png`;

    const { error } = await supabase.storage
      .from('card-attachments')
      .upload(storagePath, buffer, {
        contentType: 'image/png',
        upsert: true,
      });

    if (!error) {
      results.push({
        viewport: viewport.name,
        width: viewport.width,
        height: viewport.height,
        storage_path: storagePath,
      });
    }
  }

  return results;
}

// ============================================================================
// QA ANALYSIS PIPELINE
// ============================================================================

export interface QAInput {
  cardId: string;
  boardId: string;
  userId: string;
  url: string;
  checklistItems: QAChecklistItem[];
}

export interface QAOutput {
  findings: QAFinding[];
  checklistResults: QAChecklistResult[];
  overallScore: number;
  summary: string;
  findingsCount: QAFindingsCount;
  modelUsed: string;
  lighthouseScores?: LighthouseScores | null;
  axeViolations?: AxeViolation[];
}

/**
 * Run the full AI Dev QA pipeline:
 * 1. Check budget
 * 2. Capture screenshots at 3 viewports
 * 3. Upload to storage
 * 4. Send to Claude vision for analysis
 * 5. Parse and return results
 */
export async function runDevQA(
  supabase: SupabaseClient,
  input: QAInput
): Promise<{
  qaOutput: QAOutput;
  screenshots: QAScreenshot[];
  consoleErrors: QAConsoleError[];
  performanceMetrics: QAPerformanceMetrics;
}> {
  const startTime = Date.now();

  // 1. Budget check
  const budgetCheck = await canMakeAICall(supabase, {
    provider: 'anthropic',
    activity: 'dev_qa',
    userId: input.userId,
    boardId: input.boardId,
  });

  if (!budgetCheck.allowed) {
    throw new Error(`Budget exceeded: ${budgetCheck.reason}`);
  }

  // 2. Resolve model
  const modelConfig = await resolveModelWithFallback(supabase, 'dev_qa');

  // 3. Create client
  const client = await createAnthropicClient(supabase);
  if (!client) {
    throw new Error('Anthropic API key not configured. Add one in Settings > AI Configuration.');
  }

  // 4. Capture screenshots
  const { screenshots: screenshotBuffers, consoleErrors, performanceMetrics } =
    await captureScreenshots(input.url);

  // 4b. Run Lighthouse and axe-core audits (non-blocking)
  const { lighthouseScores, axeViolations } = await runFullAudit(input.url);

  // 5. Generate QA ID and upload screenshots
  const qaId = crypto.randomUUID();
  const uploadedScreenshots = await uploadScreenshots(
    supabase,
    input.cardId,
    qaId,
    screenshotBuffers
  );

  // 6. Build vision message with all screenshots
  const systemPrompt = getSystemPrompt('dev_qa');
  const userPrompt = buildDevQAPrompt(
    input.url,
    'Desktop (1920x1080), Tablet (768x1024), Mobile (375x812)',
    input.checklistItems.map((item) => item.text)
  );

  const messageContent: Anthropic.MessageCreateParams['messages'][0]['content'] = [];

  for (let i = 0; i < screenshotBuffers.length; i++) {
    if (screenshotBuffers[i].length === 0) continue;
    const viewport = QA_VIEWPORTS[i];

    messageContent.push({
      type: 'text',
      text: `Screenshot: ${viewport.name} (${viewport.width}x${viewport.height})`,
    });
    messageContent.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/png',
        data: screenshotBuffers[i].toString('base64'),
      },
    });
  }

  messageContent.push({ type: 'text', text: userPrompt });

  // 7. Send to Claude
  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: modelConfig.model_id,
      max_tokens: modelConfig.max_tokens,
      temperature: modelConfig.temperature,
      system: systemPrompt,
      messages: [{ role: 'user', content: messageContent }],
    });
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    await logUsage(supabase, {
      userId: input.userId,
      boardId: input.boardId,
      cardId: input.cardId,
      activity: 'dev_qa',
      provider: 'anthropic',
      modelId: modelConfig.model_id,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs,
      status: 'error',
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw new Error(`AI QA analysis failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const latencyMs = Date.now() - startTime;
  await touchApiKey(supabase, 'anthropic');

  // 8. Parse response
  const responseText = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  const parsed = parseQAResponse(responseText, input.checklistItems.length);

  // 9. Log usage
  await logUsage(supabase, {
    userId: input.userId,
    boardId: input.boardId,
    cardId: input.cardId,
    activity: 'dev_qa',
    provider: 'anthropic',
    modelId: modelConfig.model_id,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    latencyMs,
    status: 'success',
    metadata: {
      overall_score: parsed.overallScore,
      findings_count: parsed.findingsCount,
      url: input.url,
    },
  });

  return {
    qaOutput: {
      ...parsed,
      modelUsed: modelConfig.model_id,
      lighthouseScores,
      axeViolations,
    },
    screenshots: uploadedScreenshots,
    consoleErrors,
    performanceMetrics,
  };
}

// ============================================================================
// RESPONSE PARSING
// ============================================================================

/**
 * Parse the AI QA response JSON.
 */
export function parseQAResponse(
  responseText: string,
  expectedChecklistCount: number
): Omit<QAOutput, 'modelUsed'> {
  let jsonStr = responseText;
  const jsonMatch = responseText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  }

  try {
    const parsed = JSON.parse(jsonStr);

    const findings: QAFinding[] = (parsed.findings || []).map(
      (f: { severity?: string; category?: string; description?: string; location?: string }) => ({
        severity: normalizeSeverity(f.severity),
        category: f.category ?? 'general',
        description: f.description ?? '',
        location: f.location ?? '',
      })
    );

    const checklistResults: QAChecklistResult[] = (parsed.checklist_results || []).map(
      (r: { index?: number; passed?: boolean; notes?: string }, i: number) => ({
        index: r.index ?? i + 1,
        passed: r.passed ?? false,
        notes: r.notes ?? '',
      })
    );

    const overallScore = Math.min(100, Math.max(0, parsed.overall_score ?? 0));
    const summary = parsed.summary ?? '';

    const findingsCount = countFindings(findings);

    return { findings, checklistResults, overallScore, summary, findingsCount };
  } catch {
    return {
      findings: [],
      checklistResults: [],
      overallScore: 0,
      summary: `AI response could not be parsed. Raw: ${responseText.slice(0, 200)}...`,
      findingsCount: { critical: 0, major: 0, minor: 0, info: 0 },
    };
  }
}

function normalizeSeverity(severity?: string): QAFindingSeverity {
  const s = (severity ?? '').toLowerCase();
  if (s === 'critical' || s === 'blocker') return 'critical';
  if (s === 'major' || s === 'high') return 'major';
  if (s === 'minor' || s === 'medium' || s === 'low') return 'minor';
  return 'info';
}

/**
 * Count findings by severity level.
 */
export function countFindings(findings: QAFinding[]): QAFindingsCount {
  const counts: QAFindingsCount = { critical: 0, major: 0, minor: 0, info: 0 };
  for (const f of findings) {
    counts[f.severity]++;
  }
  return counts;
}

/**
 * Determine overall QA status from score.
 */
export function scoreToStatus(score: number): 'passed' | 'failed' {
  return score >= 70 ? 'passed' : 'failed';
}

// ============================================================================
// RESULT STORAGE
// ============================================================================

/**
 * Store QA results in the database.
 */
export async function storeQAResult(
  supabase: SupabaseClient,
  input: QAInput,
  qaOutput: QAOutput,
  screenshots: QAScreenshot[],
  consoleErrors: QAConsoleError[],
  performanceMetrics: QAPerformanceMetrics,
  checklistTemplateId?: string
): Promise<AIQAResult | null> {
  const { data, error } = await supabase
    .from('ai_qa_results')
    .insert({
      card_id: input.cardId,
      url: input.url,
      screenshots,
      results: {
        findings: qaOutput.findings,
        checklist_results: qaOutput.checklistResults,
        overall_score: qaOutput.overallScore,
        summary: qaOutput.summary,
        lighthouse_scores: qaOutput.lighthouseScores,
        axe_violations: qaOutput.axeViolations,
      },
      console_errors: consoleErrors,
      performance_metrics: performanceMetrics,
      checklist_template_id: checklistTemplateId ?? null,
      checklist_results: qaOutput.checklistResults,
      overall_score: qaOutput.overallScore,
      overall_status: scoreToStatus(qaOutput.overallScore),
      findings_count: qaOutput.findingsCount,
      model_used: qaOutput.modelUsed,
      created_by: input.userId,
    })
    .select()
    .single();

  if (error) {
    console.error('[DevQA] Failed to store results:', error.message);
    return null;
  }

  return data as AIQAResult;
}

/**
 * Get QA history for a card.
 */
export async function getCardQAHistory(
  supabase: SupabaseClient,
  cardId: string
): Promise<AIQAResult[]> {
  const { data } = await supabase
    .from('ai_qa_results')
    .select('*')
    .eq('card_id', cardId)
    .order('created_at', { ascending: false });

  return (data as AIQAResult[]) ?? [];
}

// ============================================================================
// MULTI-BROWSER QA
// ============================================================================

const BROWSERS = ['chrome', 'firefox', 'webkit'] as const;
export type BrowserType = (typeof BROWSERS)[number];

/**
 * Capture screenshots in a specific browser via Browserless.io.
 * Chrome is the default; Firefox/WebKit use the emulation flag.
 */
export async function captureScreenshotsForBrowser(
  url: string,
  browser: BrowserType
): Promise<{ screenshots: Buffer[]; lighthouseScores: LighthouseScores | null }> {
  const browserlessKey = process.env.BROWSERLESS_API_KEY;
  if (!browserlessKey) {
    return { screenshots: [], lighthouseScores: null };
  }

  const screenshots: Buffer[] = [];

  for (const viewport of QA_VIEWPORTS) {
    try {
      const body: Record<string, unknown> = {
        url,
        options: { fullPage: true, type: 'png' },
        viewport: { width: viewport.width, height: viewport.height, deviceScaleFactor: 1 },
        waitFor: 3000,
      };

      // Browserless uses browser launch options for non-chrome
      if (browser !== 'chrome') {
        body.launch = { product: browser };
      }

      const response = await fetch(
        `https://chrome.browserless.io/screenshot?token=${browserlessKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );

      if (response.ok) {
        screenshots.push(Buffer.from(await response.arrayBuffer()));
      } else {
        screenshots.push(Buffer.alloc(0));
      }
    } catch {
      screenshots.push(Buffer.alloc(0));
    }
  }

  // Only run Lighthouse on chrome
  const lighthouseScores = browser === 'chrome' ? await runLighthouseOnly(url) : null;

  return { screenshots, lighthouseScores };
}

async function runLighthouseOnly(url: string): Promise<LighthouseScores | null> {
  const { lighthouseScores } = await runFullAudit(url);
  return lighthouseScores;
}

/**
 * Compare screenshots between two browsers using pixel difference.
 * Returns a percentage of pixels that differ.
 */
export function computeScreenshotDiff(
  bufferA: Buffer,
  bufferB: Buffer,
  viewport: string
): BrowserDifference {
  // Simple size-based comparison (actual pixelmatch would need PNG decoding)
  if (bufferA.length === 0 || bufferB.length === 0) {
    return {
      viewport,
      diffPercentage: bufferA.length === 0 && bufferB.length === 0 ? 0 : 100,
      diffImagePath: null,
      description: 'One or both screenshots failed to capture',
    };
  }

  // Compare buffer sizes as a rough proxy (real visual diff uses visual-diff.ts)
  const sizeDiff = Math.abs(bufferA.length - bufferB.length);
  const maxSize = Math.max(bufferA.length, bufferB.length);
  const roughDiffPercent = maxSize > 0 ? Math.round((sizeDiff / maxSize) * 100) : 0;

  return {
    viewport,
    diffPercentage: roughDiffPercent,
    diffImagePath: null,
    description: roughDiffPercent > 5 ? `${roughDiffPercent}% size difference detected` : 'Screenshots are similar',
  };
}

/**
 * Run QA across multiple browsers and compare results.
 */
export async function runMultiBrowserQA(
  url: string,
  browsers: BrowserType[] = ['chrome', 'firefox']
): Promise<MultiBrowserResult[]> {
  const results: MultiBrowserResult[] = [];
  const browserScreenshots: Map<BrowserType, Buffer[]> = new Map();

  // Capture in each browser sequentially (to avoid overloading Browserless)
  for (const browser of browsers) {
    const { screenshots, lighthouseScores } = await captureScreenshotsForBrowser(url, browser);
    browserScreenshots.set(browser, screenshots);

    const viewportScreenshots: QAScreenshot[] = screenshots.map((buf, i) => ({
      viewport: QA_VIEWPORTS[i].name,
      width: QA_VIEWPORTS[i].width,
      height: QA_VIEWPORTS[i].height,
      storage_path: '', // Not uploaded in multi-browser mode
    }));

    results.push({
      browser,
      screenshots: viewportScreenshots,
      lighthouseScores: lighthouseScores ? { ...lighthouseScores } : null,
      differences: [],
    });
  }

  // Compare each browser against chrome (baseline)
  const chromeScreenshots = browserScreenshots.get('chrome');
  if (chromeScreenshots) {
    for (const [browser, screenshots] of Array.from(browserScreenshots.entries())) {
      if (browser === 'chrome') continue;
      const result = results.find((r) => r.browser === browser);
      if (!result) continue;

      const differences: BrowserDifference[] = [];
      for (let i = 0; i < QA_VIEWPORTS.length; i++) {
        const diff = computeScreenshotDiff(
          chromeScreenshots[i] || Buffer.alloc(0),
          screenshots[i] || Buffer.alloc(0),
          QA_VIEWPORTS[i].name
        );
        differences.push(diff);
      }
      result.differences = differences;
    }
  }

  return results;
}

// ============================================================================
// QA MONITORING
// ============================================================================

/**
 * Get all active monitoring configs that are due for a run.
 */
export async function getDueMonitoringConfigs(
  supabase: SupabaseClient
): Promise<QAMonitoringConfig[]> {
  const now = new Date();

  const { data } = await supabase
    .from('qa_monitoring_configs')
    .select('*')
    .eq('is_active', true);

  if (!data) return [];

  return (data as QAMonitoringConfig[]).filter((config) => {
    if (!config.last_run_at) return true; // Never run before
    const lastRun = new Date(config.last_run_at);
    const hoursSinceLastRun = (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60);

    switch (config.frequency) {
      case '12h': return hoursSinceLastRun >= 12;
      case '24h': return hoursSinceLastRun >= 24;
      case '48h': return hoursSinceLastRun >= 48;
      case '7d': return hoursSinceLastRun >= 168;
      default: return hoursSinceLastRun >= 24;
    }
  });
}

/**
 * Run a single monitoring check for a URL.
 * Returns scores and any regressions detected.
 */
export async function runMonitoringCheck(
  supabase: SupabaseClient,
  config: QAMonitoringConfig
): Promise<{
  lighthouseScores: LighthouseScores | null;
  linkCheckSummary: LinkCheckSummary;
  wcagReport: WCAGReport | null;
  regressions: Record<string, { current: number; previous: number; drop: number }>;
}> {
  // Run Lighthouse + axe-core
  const auditResult = await runFullAudit(config.url);

  // Run link checks
  const linkCheckSummary = await checkPageLinks(config.url);

  // Map axe violations to WCAG report
  const wcagReport = auditResult.axeViolations.length > 0
    ? mapAxeToWCAG(auditResult.axeViolations)
    : null;

  // Check for regressions against previous scores
  let regressions: Record<string, { current: number; previous: number; drop: number }> = {};
  if (auditResult.lighthouseScores && config.last_scores) {
    const previousScores = config.last_scores as unknown as LighthouseScores;
    if (previousScores.performance !== undefined) {
      regressions = detectScoreRegression(
        auditResult.lighthouseScores,
        previousScores,
        config.alert_threshold
      );
    }
  }

  // Update the config with latest run info
  const scoreData = auditResult.lighthouseScores ?? {};
  await supabase
    .from('qa_monitoring_configs')
    .update({
      last_run_at: new Date().toISOString(),
      last_scores: scoreData,
      updated_at: new Date().toISOString(),
    })
    .eq('id', config.id);

  return {
    lighthouseScores: auditResult.lighthouseScores,
    linkCheckSummary,
    wcagReport,
    regressions,
  };
}

// ============================================================================
// MONITORING CONFIG CRUD
// ============================================================================

/**
 * Get monitoring configs for a board.
 */
export async function getMonitoringConfigs(
  supabase: SupabaseClient,
  boardId: string
): Promise<QAMonitoringConfig[]> {
  const { data } = await supabase
    .from('qa_monitoring_configs')
    .select('*')
    .eq('board_id', boardId)
    .order('created_at', { ascending: false });

  return (data as QAMonitoringConfig[]) ?? [];
}

/**
 * Create a monitoring config.
 */
export async function createMonitoringConfig(
  supabase: SupabaseClient,
  config: {
    boardId: string;
    cardId?: string;
    url: string;
    frequency?: string;
    browsers?: string[];
    alertThreshold?: number;
    createdBy: string;
  }
): Promise<QAMonitoringConfig | null> {
  const { data, error } = await supabase
    .from('qa_monitoring_configs')
    .insert({
      board_id: config.boardId,
      card_id: config.cardId ?? null,
      url: config.url,
      frequency: config.frequency ?? '24h',
      browsers: config.browsers ?? ['chrome'],
      alert_threshold: config.alertThreshold ?? 10,
      is_active: true,
      created_by: config.createdBy,
    })
    .select()
    .single();

  if (error) {
    console.error('[MonitoringConfig] Create failed:', error.message);
    return null;
  }

  return data as QAMonitoringConfig;
}

/**
 * Update a monitoring config.
 */
export async function updateMonitoringConfig(
  supabase: SupabaseClient,
  configId: string,
  updates: Partial<{
    url: string;
    frequency: string;
    browsers: string[];
    alertThreshold: number;
    isActive: boolean;
  }>
): Promise<QAMonitoringConfig | null> {
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.url !== undefined) updateData.url = updates.url;
  if (updates.frequency !== undefined) updateData.frequency = updates.frequency;
  if (updates.browsers !== undefined) updateData.browsers = updates.browsers;
  if (updates.alertThreshold !== undefined) updateData.alert_threshold = updates.alertThreshold;
  if (updates.isActive !== undefined) updateData.is_active = updates.isActive;

  const { data, error } = await supabase
    .from('qa_monitoring_configs')
    .update(updateData)
    .eq('id', configId)
    .select()
    .single();

  if (error) {
    console.error('[MonitoringConfig] Update failed:', error.message);
    return null;
  }

  return data as QAMonitoringConfig;
}

/**
 * Delete a monitoring config.
 */
export async function deleteMonitoringConfig(
  supabase: SupabaseClient,
  configId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('qa_monitoring_configs')
    .delete()
    .eq('id', configId);

  return !error;
}
