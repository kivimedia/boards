import { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import { createAnthropicClient } from './providers';
import { calculateCost, logUsage } from './cost-tracker';
import { getWebResearchPrompt } from './web-research-prompts';
import {
  BrowserlessClient,
  createBrowserlessClient,
  isAllowedDomain,
  sanitizeUrl,
  estimateBrowserCost,
} from '../integrations/browserless';
import type { WebResearchTaskType, WebResearchExtractedItem } from '../types';

// ============================================================================
// WEB RESEARCH AGENT ENGINE
// Agentic loop: Claude decides what to browse, Browserless executes.
// ============================================================================

const MAX_ITERATIONS = 15;
const MAX_SCREENSHOTS = 10;
const MAX_AI_TOKENS = 100_000;
const MAX_BROWSER_SECONDS = 120;
const MODEL_ID = 'claude-sonnet-4-5-20250929';

// ============================================================================
// TOOL DEFINITIONS (given to Claude)
// ============================================================================

const WEB_RESEARCH_TOOLS: Anthropic.Tool[] = [
  {
    name: 'navigate_and_extract',
    description:
      'Navigate to a URL and extract the rendered text content. Returns the page title and text content (up to 30KB). Use this to read web pages.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'The URL to navigate to' },
      },
      required: ['url'],
    },
  },
  {
    name: 'scrape_elements',
    description:
      'Extract specific elements from a page using CSS selectors. Useful when you know the page structure and want specific data.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'The URL to scrape' },
        selectors: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              selector: { type: 'string', description: 'CSS selector (e.g., "h2.title", ".testimonial")' },
              attribute: { type: 'string', description: 'Optional attribute to extract instead of text (e.g., "href", "src")' },
            },
            required: ['selector'],
          },
          description: 'CSS selectors to extract',
        },
      },
      required: ['url', 'selectors'],
    },
  },
  {
    name: 'take_screenshot',
    description:
      'Capture a screenshot of a web page. Returns a description of the screenshot.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'The URL to screenshot' },
        full_page: { type: 'boolean', description: 'Capture full page (default false)' },
      },
      required: ['url'],
    },
  },
  {
    name: 'check_link',
    description:
      'Check if a URL is reachable. Returns HTTP status, redirect info. Lightweight - no browser needed.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'The URL to check' },
      },
      required: ['url'],
    },
  },
];

// ============================================================================
// CALLBACKS
// ============================================================================

export interface WebResearchCallbacks {
  onToken: (text: string) => void;
  onProgress: (iteration: number, maxIterations: number) => void;
  onToolCall: (toolName: string, toolInput: Record<string, unknown>) => void;
  onToolResult: (toolName: string, result: string, success: boolean) => void;
  onScreenshot: (url: string, screenshotUrl: string) => void;
  onComplete: (output: string) => void;
  onError: (error: string) => void;
}

export interface WebResearchParams {
  sessionId: string;
  taskType: WebResearchTaskType;
  inputPrompt: string;
  inputUrls: string[];
  domainAllowlist: string[];
  boardId?: string;
  cardId?: string;
  userId: string;
  maxIterations?: number;
}

// ============================================================================
// MAIN ENGINE
// ============================================================================

/**
 * Run a web research session. Claude controls browsing via tools.
 */
export async function runWebResearch(
  supabase: SupabaseClient,
  params: WebResearchParams,
  callbacks: WebResearchCallbacks
): Promise<void> {
  const startTime = Date.now();
  const maxIter = Math.min(params.maxIterations || MAX_ITERATIONS, MAX_ITERATIONS);

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let toolCallCount = 0;
  let pagesVisited = 0;
  let screenshotsTaken = 0;
  let browserSecondsUsed = 0;

  try {
    // 1. Create Anthropic client
    const client = await createAnthropicClient(supabase);
    if (!client) throw new Error('Anthropic API key not configured');

    // 2. Create Browserless client
    const browser = await createBrowserlessClient(supabase);
    // browser is optional -- tools degrade gracefully without it

    // 3. Build system prompt
    const systemPrompt = getWebResearchPrompt(params.taskType);

    // 4. Build user message
    let userMessage = params.inputPrompt;
    if (params.inputUrls.length > 0) {
      userMessage += `\n\nURLs to investigate:\n${params.inputUrls.map((u) => `- ${u}`).join('\n')}`;
    }
    if (params.domainAllowlist.length > 0) {
      userMessage += `\n\nNote: You may only visit these domains: ${params.domainAllowlist.join(', ')}`;
    }

    // 5. Update session to running
    await supabase.from('web_research_sessions').update({
      status: 'running',
      model_used: MODEL_ID,
    }).eq('id', params.sessionId);

    // 6. Build tools (include web_search as server tool)
    const tools: Anthropic.Tool[] = [...WEB_RESEARCH_TOOLS];

    // 7. Agentic loop
    let fullOutput = '';
    let currentMessages: Anthropic.MessageParam[] = [
      { role: 'user', content: userMessage },
    ];

    let iteration = 0;
    while (iteration < maxIter) {
      iteration++;
      callbacks.onProgress(iteration, maxIter);

      // Check cost caps
      if (totalInputTokens + totalOutputTokens > MAX_AI_TOKENS) {
        fullOutput += '\n\n[Reached token limit. Stopping research.]';
        callbacks.onToken('\n\n[Reached token limit. Stopping research.]');
        break;
      }
      if (browserSecondsUsed > MAX_BROWSER_SECONDS) {
        fullOutput += '\n\n[Reached browser time limit. Stopping research.]';
        callbacks.onToken('\n\n[Reached browser time limit. Stopping research.]');
        break;
      }

      const stream = client.messages.stream({
        model: MODEL_ID,
        max_tokens: 4096,
        system: systemPrompt,
        messages: currentMessages,
        tools,
      });

      let streamText = '';
      const toolUseBlocks: { id: string; name: string; input: Record<string, unknown> }[] = [];
      let currentToolName = '';
      let currentToolId = '';
      let currentToolInput = '';

      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            currentToolName = event.content_block.name;
            currentToolId = event.content_block.id;
            currentToolInput = '';
          }
        } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          const text = event.delta.text;
          streamText += text;
          fullOutput += text;
          callbacks.onToken(text);
        } else if (event.type === 'content_block_delta' && event.delta.type === 'input_json_delta') {
          currentToolInput += event.delta.partial_json;
        } else if (event.type === 'content_block_stop') {
          if (currentToolName && currentToolId) {
            try {
              toolUseBlocks.push({ id: currentToolId, name: currentToolName, input: JSON.parse(currentToolInput || '{}') });
            } catch {}
            currentToolName = '';
            currentToolId = '';
            currentToolInput = '';
          }
        }
      }

      const finalMessage = await stream.finalMessage();
      totalInputTokens += finalMessage.usage.input_tokens;
      totalOutputTokens += finalMessage.usage.output_tokens;

      if (toolUseBlocks.length === 0 || finalMessage.stop_reason !== 'tool_use') {
        break;
      }

      // Process tool calls
      const assistantContent: Anthropic.ContentBlockParam[] = [];
      if (streamText) assistantContent.push({ type: 'text', text: streamText });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const tool of toolUseBlocks) {
        assistantContent.push({ type: 'tool_use', id: tool.id, name: tool.name, input: tool.input });
        toolCallCount++;
        callbacks.onToolCall(tool.name, tool.input);

        const toolStart = Date.now();
        const result = await executeWebResearchTool(
          supabase,
          browser,
          params,
          tool.name,
          tool.input,
          screenshotsTaken,
          callbacks
        );
        const toolDurationMs = Date.now() - toolStart;
        const toolDurationSec = toolDurationMs / 1000;

        // Track browser time for browsing tools
        if (['navigate_and_extract', 'scrape_elements', 'take_screenshot'].includes(tool.name)) {
          browserSecondsUsed += toolDurationSec;
        }
        if (tool.name === 'navigate_and_extract' || tool.name === 'scrape_elements') {
          pagesVisited++;
        }
        if (tool.name === 'take_screenshot' && result.success) {
          screenshotsTaken++;
        }

        callbacks.onToolResult(tool.name, result.message.slice(0, 200), result.success);

        // Record tool call in DB
        await supabase.from('web_research_tool_calls').insert({
          session_id: params.sessionId,
          tool_name: tool.name,
          tool_input: tool.input,
          tool_result: { message: result.message.slice(0, 5000), data: result.data },
          status: result.success ? 'success' : 'failed',
          error_message: result.success ? null : result.message,
          duration_ms: toolDurationMs,
          call_order: toolCallCount,
        });

        toolResults.push({
          type: 'tool_result',
          tool_use_id: tool.id,
          content: result.success ? result.message : `ERROR: ${result.message}`,
        });
      }

      // Update session progress
      await supabase.from('web_research_sessions').update({
        current_iteration: iteration,
        pages_visited: pagesVisited,
        screenshots_taken: screenshotsTaken,
        tool_calls_count: toolCallCount,
        ai_tokens_used: totalInputTokens + totalOutputTokens,
      }).eq('id', params.sessionId);

      currentMessages = [
        ...currentMessages,
        { role: 'assistant', content: assistantContent },
        { role: 'user', content: toolResults },
      ];
    }

    // 8. Calculate costs
    const aiCost = calculateCost('anthropic', MODEL_ID, totalInputTokens, totalOutputTokens);
    const browserCost = estimateBrowserCost(browserSecondsUsed);
    const totalCost = Math.round((aiCost + browserCost) * 1_000_000) / 1_000_000;
    const durationMs = Date.now() - startTime;

    // 9. Parse structured output
    const extractedItems = parseExtractedItems(fullOutput);

    // 10. Complete session
    await supabase.from('web_research_sessions').update({
      status: 'completed',
      output_summary: fullOutput.slice(0, 5000),
      extracted_items: extractedItems,
      current_iteration: iteration,
      pages_visited: pagesVisited,
      screenshots_taken: screenshotsTaken,
      ai_tokens_used: totalInputTokens + totalOutputTokens,
      ai_cost_usd: aiCost,
      browser_seconds_used: Math.round(browserSecondsUsed),
      browser_cost_usd: browserCost,
      total_cost_usd: totalCost,
      duration_ms: durationMs,
      tool_calls_count: toolCallCount,
      completed_at: new Date().toISOString(),
    }).eq('id', params.sessionId);

    // 11. Log usage
    await logUsage(supabase, {
      userId: params.userId,
      boardId: params.boardId,
      cardId: params.cardId,
      activity: 'web_research',
      provider: 'anthropic',
      modelId: MODEL_ID,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      latencyMs: durationMs,
      status: 'success',
      metadata: {
        session_id: params.sessionId,
        task_type: params.taskType,
        pages_visited: pagesVisited,
        screenshots_taken: screenshotsTaken,
        tool_calls: toolCallCount,
        browser_cost: browserCost,
      },
    });

    callbacks.onComplete(fullOutput);
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    const errorMsg = err.message ?? 'Unknown error';

    await supabase.from('web_research_sessions').update({
      status: 'failed',
      error_message: errorMsg,
      duration_ms: durationMs,
      ai_tokens_used: totalInputTokens + totalOutputTokens,
      ai_cost_usd: calculateCost('anthropic', MODEL_ID, totalInputTokens, totalOutputTokens),
      completed_at: new Date().toISOString(),
    }).eq('id', params.sessionId);

    callbacks.onError(errorMsg);
  }
}

// ============================================================================
// TOOL EXECUTOR
// ============================================================================

interface ToolResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

async function executeWebResearchTool(
  supabase: SupabaseClient,
  browser: BrowserlessClient | null,
  params: WebResearchParams,
  toolName: string,
  toolInput: Record<string, unknown>,
  currentScreenshots: number,
  callbacks: WebResearchCallbacks
): Promise<ToolResult> {
  try {
    switch (toolName) {
      case 'navigate_and_extract':
        return await toolNavigateAndExtract(browser, params, toolInput);
      case 'scrape_elements':
        return await toolScrapeElements(browser, params, toolInput);
      case 'take_screenshot':
        return await toolTakeScreenshot(supabase, browser, params, toolInput, currentScreenshots, callbacks);
      case 'check_link':
        return await toolCheckLink(browser, toolInput);
      default:
        return { success: false, message: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    return { success: false, message: `Tool failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ============================================================================
// INDIVIDUAL TOOL IMPLEMENTATIONS
// ============================================================================

async function toolNavigateAndExtract(
  browser: BrowserlessClient | null,
  params: WebResearchParams,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const url = input.url as string;
  if (!url) return { success: false, message: 'url is required' };

  // Domain check
  if (!isAllowedDomain(url, params.domainAllowlist)) {
    return { success: false, message: `Domain not in allowlist. Allowed: ${params.domainAllowlist.join(', ')}` };
  }

  // URL safety check
  const check = sanitizeUrl(url);
  if (!check.valid) return { success: false, message: `URL blocked: ${check.reason}` };

  if (!browser) {
    // Fallback: simple fetch
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      const response = await fetch(check.url, { signal: controller.signal });
      clearTimeout(timer);
      const text = (await response.text()).slice(0, 30_000);
      return { success: true, message: `Page content (${text.length} chars):\n${text}`, data: { url: check.url } };
    } catch (err) {
      return { success: false, message: `Failed to fetch: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  const result = await browser.getContent(check.url);
  return {
    success: true,
    message: `Title: ${result.title}\nURL: ${result.url}\nContent (${result.content.length} chars):\n${result.content}`,
    data: { url: result.url, title: result.title },
  };
}

async function toolScrapeElements(
  browser: BrowserlessClient | null,
  params: WebResearchParams,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const url = input.url as string;
  const selectors = input.selectors as { selector: string; attribute?: string }[];
  if (!url || !selectors?.length) return { success: false, message: 'url and selectors are required' };

  if (!isAllowedDomain(url, params.domainAllowlist)) {
    return { success: false, message: `Domain not in allowlist` };
  }

  if (!browser) {
    return { success: false, message: 'Browserless not configured. Use navigate_and_extract instead.' };
  }

  const result = await browser.scrape(url, selectors);
  const parts: string[] = [];
  for (const group of result.data) {
    parts.push(`## ${group.selector}`);
    for (const r of group.results.slice(0, 50)) {
      parts.push(`- ${r.text || r.href || r.src || '(empty)'}`);
    }
  }

  return {
    success: true,
    message: parts.join('\n').slice(0, 10_000),
    data: { url: result.url, selectors: selectors.map((s) => s.selector) },
  };
}

async function toolTakeScreenshot(
  supabase: SupabaseClient,
  browser: BrowserlessClient | null,
  params: WebResearchParams,
  input: Record<string, unknown>,
  currentScreenshots: number,
  callbacks: WebResearchCallbacks
): Promise<ToolResult> {
  const url = input.url as string;
  if (!url) return { success: false, message: 'url is required' };

  if (currentScreenshots >= MAX_SCREENSHOTS) {
    return { success: false, message: `Maximum screenshots (${MAX_SCREENSHOTS}) reached` };
  }

  if (!isAllowedDomain(url, params.domainAllowlist)) {
    return { success: false, message: 'Domain not in allowlist' };
  }

  if (!browser) {
    return { success: false, message: 'Browserless not configured. Cannot take screenshots.' };
  }

  const result = await browser.screenshot(url, { fullPage: (input.full_page as boolean) ?? false });

  // Upload to Supabase Storage
  const filename = `web-research/${params.sessionId}/${Date.now()}.png`;
  const { error: uploadError } = await supabase.storage
    .from('card-attachments')
    .upload(filename, result.screenshot, { contentType: 'image/png' });

  if (uploadError) {
    return { success: false, message: `Screenshot captured but upload failed: ${uploadError.message}` };
  }

  const { data: urlData } = supabase.storage.from('card-attachments').getPublicUrl(filename);
  const screenshotUrl = urlData?.publicUrl || filename;

  callbacks.onScreenshot(url, screenshotUrl);

  return {
    success: true,
    message: `Screenshot captured for ${url}. Saved to storage.`,
    data: { url, screenshot_url: screenshotUrl },
  };
}

async function toolCheckLink(
  browser: BrowserlessClient | null,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const url = input.url as string;
  if (!url) return { success: false, message: 'url is required' };

  const check = sanitizeUrl(url);
  if (!check.valid) return { success: false, message: `URL blocked: ${check.reason}` };

  // Use BrowserlessClient's checkLink (doesn't need actual browser)
  if (browser) {
    const result = await browser.checkLink(check.url);
    const statusText = result.ok ? 'healthy' : result.status >= 400 ? 'broken' : result.status >= 300 ? 'redirected' : 'unreachable';
    return {
      success: true,
      message: `${check.url} -> ${result.status} (${statusText})${result.redirected ? ` -> ${result.finalUrl}` : ''}`,
      data: { status: result.status, redirected: result.redirected, final_url: result.finalUrl, ok: result.ok },
    };
  }

  // Fallback: direct fetch
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const response = await fetch(check.url, { method: 'HEAD', redirect: 'follow', signal: controller.signal });
    clearTimeout(timer);
    return {
      success: true,
      message: `${check.url} -> ${response.status} (${response.ok ? 'healthy' : 'error'})${response.redirected ? ` -> ${response.url}` : ''}`,
      data: { status: response.status, redirected: response.redirected, final_url: response.url, ok: response.ok },
    };
  } catch {
    return { success: true, message: `${check.url} -> 0 (unreachable)`, data: { status: 0, ok: false } };
  }
}

// ============================================================================
// OUTPUT PARSING
// ============================================================================

/**
 * Attempt to extract structured items from the agent's output.
 * Looks for JSON blocks or structured lists.
 */
function parseExtractedItems(output: string): WebResearchExtractedItem[] {
  const items: WebResearchExtractedItem[] = [];

  // Try to find JSON arrays in the output
  const jsonMatches = output.match(/```json\n([\s\S]*?)\n```/g);
  if (jsonMatches) {
    for (const match of jsonMatches) {
      try {
        const json = match.replace(/```json\n/, '').replace(/\n```/, '');
        const parsed = JSON.parse(json);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            items.push({
              type: item.type || 'page_content',
              title: item.title || item.name || '',
              content: item.content || item.text || item.description || '',
              url: item.url || item.source || '',
              metadata: item,
            });
          }
        }
      } catch {}
    }
  }

  return items;
}
