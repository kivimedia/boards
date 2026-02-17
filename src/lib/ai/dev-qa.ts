import { SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { createAnthropicClient, touchApiKey } from './providers';
import { resolveModelWithFallback } from './model-resolver';
import { logUsage } from './cost-tracker';
import { canMakeAICall } from './budget-checker';
import { getSystemPrompt, buildDevQAPrompt } from './prompt-templates';
import { runFullAudit } from './lighthouse-audit';
import type { LighthouseScores, AxeViolation } from './lighthouse-audit';
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
