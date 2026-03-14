import { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import type { AgentSkill, BoardAgent, AgentToolDefinition } from '../types';
import { gatherBoardContext, boardContextToText, type BoardContext } from '../board-context';
import * as gadsAccount from '../integrations/google-ads-account';
import * as gadsIntel from '../integrations/google-ads-intel';

// ============================================================================
// AGENT TOOL DEFINITIONS (Board-scoped, multi-turn)
// ============================================================================

const AGENT_TOOL_DEFINITIONS: (Anthropic.Tool & { _meta: { category: string; needs_confirmation: boolean } })[] = [
  {
    name: 'think',
    description:
      'Use this tool for internal reasoning. Think through a problem step-by-step before acting. Your thoughts are NOT shown to the user, only a brief indicator.',
    input_schema: {
      type: 'object' as const,
      properties: {
        reasoning: { type: 'string', description: 'Your chain-of-thought reasoning' },
      },
      required: ['reasoning'],
    },
    _meta: { category: 'internal', needs_confirmation: false },
  },
  {
    name: 'list_cards',
    description:
      'List cards from a specific list or the entire board. Supports filtering by priority, assignee, label, or due date.',
    input_schema: {
      type: 'object' as const,
      properties: {
        list_name: { type: 'string', description: 'Filter to a specific list name (optional)' },
        priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low', 'none'], description: 'Filter by priority (optional)' },
        assignee_name: { type: 'string', description: 'Filter by assignee display name (optional)' },
        label_name: { type: 'string', description: 'Filter by label name (optional)' },
        has_due_date: { type: 'boolean', description: 'Filter to cards with/without due dates (optional)' },
        is_overdue: { type: 'boolean', description: 'Filter to overdue cards only (optional)' },
        limit: { type: 'number', description: 'Max cards to return (default 50)' },
      },
      required: [],
    },
    _meta: { category: 'read', needs_confirmation: false },
  },
  {
    name: 'get_card',
    description:
      'Get full details of a specific card including description, checklists, comments, labels, assignees, and custom fields.',
    input_schema: {
      type: 'object' as const,
      properties: {
        card_id: { type: 'string', description: 'The UUID of the card' },
      },
      required: ['card_id'],
    },
    _meta: { category: 'read', needs_confirmation: false },
  },
  {
    name: 'search_cards',
    description:
      'Full-text search across card titles and descriptions on the board.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query text' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
      required: ['query'],
    },
    _meta: { category: 'read', needs_confirmation: false },
  },
  {
    name: 'get_board_summary',
    description:
      'Get a high-level overview of the board: list counts, priority breakdown, overdue cards, workload distribution by assignee.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
    _meta: { category: 'read', needs_confirmation: false },
  },
  {
    name: 'create_card',
    description:
      'Create a new card in a specific list. Returns the created card ID.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Card title' },
        list_name: { type: 'string', description: 'Target list name' },
        description: { type: 'string', description: 'Card description (optional)' },
        priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low', 'none'], description: 'Priority (optional, default none)' },
        due_date: { type: 'string', description: 'Due date in YYYY-MM-DD format (optional)' },
      },
      required: ['title', 'list_name'],
    },
    _meta: { category: 'write', needs_confirmation: true },
  },
  {
    name: 'update_card',
    description:
      'Update fields on an existing card (title, description, priority, due_date).',
    input_schema: {
      type: 'object' as const,
      properties: {
        card_id: { type: 'string', description: 'The UUID of the card to update' },
        title: { type: 'string', description: 'New title (optional)' },
        description: { type: 'string', description: 'New description (optional)' },
        priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low', 'none'], description: 'New priority (optional)' },
        due_date: { type: 'string', description: 'New due date in YYYY-MM-DD (optional, null to clear)' },
      },
      required: ['card_id'],
    },
    _meta: { category: 'write', needs_confirmation: true },
  },
  {
    name: 'move_card',
    description:
      'Move a card to a different list on the board.',
    input_schema: {
      type: 'object' as const,
      properties: {
        card_id: { type: 'string', description: 'The UUID of the card to move' },
        target_list_name: { type: 'string', description: 'The name of the target list' },
      },
      required: ['card_id', 'target_list_name'],
    },
    _meta: { category: 'write', needs_confirmation: true },
  },
  {
    name: 'add_comment',
    description:
      'Add a comment to a card. Use for leaving notes, updates, or analysis results.',
    input_schema: {
      type: 'object' as const,
      properties: {
        card_id: { type: 'string', description: 'The UUID of the card' },
        content: { type: 'string', description: 'The comment text' },
      },
      required: ['card_id', 'content'],
    },
    _meta: { category: 'write', needs_confirmation: false },
  },

  // =========================================================================
  // GOOGLE ADS - ACCOUNT MANAGEMENT TOOLS
  // =========================================================================
  {
    name: 'gads_list_campaigns',
    description:
      'List Google Ads campaigns with 30-day performance metrics (spend, impressions, clicks, conversions, CTR, CPC).',
    input_schema: {
      type: 'object' as const,
      properties: {
        team_config_id: { type: 'string', description: 'The SEO team config UUID' },
        customer_id: { type: 'string', description: 'Google Ads customer ID (optional, uses default from config)' },
      },
      required: ['team_config_id'],
    },
    _meta: { category: 'google_ads', needs_confirmation: false },
  },
  {
    name: 'gads_keyword_performance',
    description:
      'Get keyword-level performance data including quality scores, impressions, clicks, cost, and conversions.',
    input_schema: {
      type: 'object' as const,
      properties: {
        team_config_id: { type: 'string', description: 'The SEO team config UUID' },
        campaign_id: { type: 'string', description: 'Filter to a specific campaign (optional)' },
      },
      required: ['team_config_id'],
    },
    _meta: { category: 'google_ads', needs_confirmation: false },
  },
  {
    name: 'gads_search_terms_report',
    description:
      'Pull the search terms report - shows actual user queries that triggered ads. Gold mine for SEO content ideas.',
    input_schema: {
      type: 'object' as const,
      properties: {
        team_config_id: { type: 'string', description: 'The SEO team config UUID' },
        campaign_id: { type: 'string', description: 'Filter to a specific campaign (optional)' },
        days: { type: 'number', description: 'Lookback period in days (default 30)' },
      },
      required: ['team_config_id'],
    },
    _meta: { category: 'google_ads', needs_confirmation: false },
  },
  {
    name: 'gads_budget_overview',
    description:
      'Get budget utilization analysis across all campaigns - daily budget, spend today, 30-day spend, utilization percentage.',
    input_schema: {
      type: 'object' as const,
      properties: {
        team_config_id: { type: 'string', description: 'The SEO team config UUID' },
      },
      required: ['team_config_id'],
    },
    _meta: { category: 'google_ads', needs_confirmation: false },
  },
  {
    name: 'gads_update_budget',
    description:
      'Update a campaign daily budget. REQUIRES HUMAN CONFIRMATION before execution.',
    input_schema: {
      type: 'object' as const,
      properties: {
        team_config_id: { type: 'string', description: 'The SEO team config UUID' },
        campaign_id: { type: 'string', description: 'The campaign to update' },
        new_daily_budget_micros: { type: 'number', description: 'New daily budget in micros (1 USD = 1,000,000 micros)' },
      },
      required: ['team_config_id', 'campaign_id', 'new_daily_budget_micros'],
    },
    _meta: { category: 'google_ads', needs_confirmation: true },
  },
  {
    name: 'gads_pause_keyword',
    description:
      'Pause or enable a keyword. REQUIRES HUMAN CONFIRMATION before execution.',
    input_schema: {
      type: 'object' as const,
      properties: {
        team_config_id: { type: 'string', description: 'The SEO team config UUID' },
        keyword_id: { type: 'string', description: 'The keyword resource ID' },
        status: { type: 'string', enum: ['ENABLED', 'PAUSED'], description: 'New keyword status' },
      },
      required: ['team_config_id', 'keyword_id', 'status'],
    },
    _meta: { category: 'google_ads', needs_confirmation: true },
  },

  // =========================================================================
  // GOOGLE ADS - COMPETITIVE INTELLIGENCE TOOLS
  // =========================================================================
  {
    name: 'gads_competitor_ads',
    description:
      'Pull live ads from a competitor domain via Google Ads Transparency Library. Shows headlines, descriptions, regions, and platforms.',
    input_schema: {
      type: 'object' as const,
      properties: {
        team_config_id: { type: 'string', description: 'The SEO team config UUID' },
        domain: { type: 'string', description: 'Competitor domain to analyze (e.g. "competitor.com")' },
        keyword: { type: 'string', description: 'Filter to ads mentioning this keyword (optional)' },
        limit: { type: 'number', description: 'Max ads to return (default 20)' },
      },
      required: ['team_config_id', 'domain'],
    },
    _meta: { category: 'google_ads_intel', needs_confirmation: false },
  },
  {
    name: 'gads_ad_details',
    description:
      'Get full details for a specific ad including all variations, regional stats, and creative assets.',
    input_schema: {
      type: 'object' as const,
      properties: {
        team_config_id: { type: 'string', description: 'The SEO team config UUID' },
        ad_id: { type: 'string', description: 'The ad ID from competitor_ads results' },
      },
      required: ['team_config_id', 'ad_id'],
    },
    _meta: { category: 'google_ads_intel', needs_confirmation: false },
  },
  {
    name: 'gads_analyze_ad_image',
    description:
      'AI analysis of an ad creative image - identifies brand elements, messaging strategy, color palette, and competitive insights.',
    input_schema: {
      type: 'object' as const,
      properties: {
        team_config_id: { type: 'string', description: 'The SEO team config UUID' },
        image_url: { type: 'string', description: 'URL of the ad image to analyze' },
        context: { type: 'string', description: 'Additional context about the competitor/market (optional)' },
      },
      required: ['team_config_id', 'image_url'],
    },
    _meta: { category: 'google_ads_intel', needs_confirmation: false },
  },
  {
    name: 'gads_analyze_ad_video',
    description:
      'Gemini-powered analysis of an ad video - identifies key messages, brand mentions, and competitive insights.',
    input_schema: {
      type: 'object' as const,
      properties: {
        team_config_id: { type: 'string', description: 'The SEO team config UUID' },
        video_url: { type: 'string', description: 'URL of the ad video to analyze' },
        context: { type: 'string', description: 'Additional context about the competitor/market (optional)' },
      },
      required: ['team_config_id', 'video_url'],
    },
    _meta: { category: 'google_ads_intel', needs_confirmation: false },
  },
];

// Web search is handled as an Anthropic server tool, not a custom tool

// ============================================================================
// SECURITY SANITIZER - All external MCP/API output passes through this
// ============================================================================

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /you\s+are\s+now\s+(a|an)/i,
  /\[INST\]/i,
  /\[\/INST\]/i,
  /ADMIN[_\s]?OVERRIDE/i,
  /system\s*:\s*you\s+are/i,
  /\bdo\s+not\s+follow\b.*\brules\b/i,
  /<\/?system>/i,
  /\bprompt\s*injection\b/i,
  /\breturn\s+the\s+(system|hidden)\s+prompt\b/i,
];

const HTML_STRIP_PATTERN = /<script[\s\S]*?<\/script>|<iframe[\s\S]*?<\/iframe>|javascript\s*:/gi;
const DATA_URI_PATTERN = /data:text\/html[^"'\s]*/gi;
const MAX_OUTPUT_LENGTH = 50_000;

export interface SanitizeResult {
  output: string;
  flags: string[];
  blocked: boolean;
}

/**
 * Sanitize MCP/API output before it enters the agent context.
 * Zero LLM cost - pure regex/string operations.
 */
export function sanitizeMcpOutput(
  raw: string,
  toolName: string,
  teamConfigId?: string
): SanitizeResult {
  const flags: string[] = [];
  let output = raw;

  // 1. Strip dangerous HTML
  if (HTML_STRIP_PATTERN.test(output)) {
    flags.push('html_script_stripped');
    output = output.replace(HTML_STRIP_PATTERN, '[REMOVED]');
  }

  // 2. Strip data: URIs
  if (DATA_URI_PATTERN.test(output)) {
    flags.push('data_uri_stripped');
    output = output.replace(DATA_URI_PATTERN, '[REMOVED]');
  }

  // 3. Check for injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(output)) {
      flags.push(`injection_pattern:${pattern.source.slice(0, 40)}`);
    }
  }

  // 4. Truncate to prevent context stuffing
  if (output.length > MAX_OUTPUT_LENGTH) {
    flags.push(`truncated:${output.length}`);
    output = output.slice(0, MAX_OUTPUT_LENGTH) + '\n[TRUNCATED]';
  }

  // 5. Wrap in source delimiter
  output = `<tool_output source="${toolName}">\n${output}\n</tool_output>`;

  const blocked = flags.some(f => f.startsWith('injection_pattern:'));

  return { output, flags, blocked };
}

/**
 * Log sanitization events to security_audit_log table.
 */
export async function logSanitizationEvent(
  supabase: SupabaseClient,
  toolName: string,
  teamConfigId: string | undefined,
  rawPreview: string,
  flags: string[],
  action: string
): Promise<void> {
  if (flags.length === 0) return;
  try {
    await supabase.from('security_audit_log').insert({
      tool_name: toolName,
      team_config_id: teamConfigId || null,
      raw_output_preview: rawPreview.slice(0, 500),
      flags,
      action_taken: action,
    });
  } catch {
    // Non-critical - don't fail the tool call over audit logging
  }
}

// ============================================================================
// TOOL FILTERING
// ============================================================================

/**
 * Get filtered tool definitions based on skill capabilities and board agent config.
 */
export function getAgentToolDefinitions(
  skill: AgentSkill,
  boardAgent?: BoardAgent | null
): Anthropic.Tool[] {
  const supportedTools = skill.supported_tools ?? [];
  if (supportedTools.length === 0) return [];

  // Filter to tools the skill supports
  let tools = AGENT_TOOL_DEFINITIONS.filter(
    (t) => supportedTools.includes(t.name)
  );

  // Further filter by board agent custom_tools if set
  if (boardAgent?.custom_tools && boardAgent.custom_tools.length > 0) {
    tools = tools.filter((t) => boardAgent.custom_tools!.includes(t.name));
  }

  // 'think' is always available if any tools are enabled
  const hasThink = tools.some((t) => t.name === 'think');
  if (!hasThink && tools.length > 0) {
    const thinkTool = AGENT_TOOL_DEFINITIONS.find((t) => t.name === 'think');
    if (thinkTool) tools.unshift(thinkTool);
  }

  // Strip _meta before returning to Anthropic SDK
  return tools.map(({ _meta, ...tool }) => tool as Anthropic.Tool);
}

/**
 * Check if a tool needs user confirmation based on the board agent config.
 */
export function needsAgentConfirmation(
  toolName: string,
  boardAgent?: BoardAgent | null
): boolean {
  // If board agent doesn't require confirmation, skip
  if (boardAgent && !boardAgent.requires_confirmation) return false;

  // Find the tool definition
  const toolDef = AGENT_TOOL_DEFINITIONS.find((t) => t.name === toolName);
  if (!toolDef) return false;

  return toolDef._meta.needs_confirmation;
}

/**
 * Check whether web_search server tool should be included.
 */
export function shouldIncludeWebSearch(skill: AgentSkill): boolean {
  return (skill.supported_tools ?? []).includes('web_search');
}

/**
 * Build confirmation message for a tool call.
 */
export function buildAgentConfirmationMessage(
  toolName: string,
  toolInput: Record<string, unknown>
): string {
  switch (toolName) {
    case 'create_card':
      return `Create card "${toolInput.title}" in list "${toolInput.list_name}"?`;
    case 'update_card':
      return `Update card ${toolInput.card_id}? Changes: ${Object.keys(toolInput).filter(k => k !== 'card_id').join(', ')}`;
    case 'move_card':
      return `Move card to "${toolInput.target_list_name}"?`;
    case 'gads_update_budget':
      return `Update campaign ${toolInput.campaign_id} budget to ${((toolInput.new_daily_budget_micros as number) / 1_000_000).toFixed(2)} USD/day?`;
    case 'gads_pause_keyword':
      return `${toolInput.status === 'PAUSED' ? 'Pause' : 'Enable'} keyword ${toolInput.keyword_id}?`;
    default:
      return `Execute ${toolName}?`;
  }
}

// ============================================================================
// TOOL EXECUTORS
// ============================================================================

export interface AgentToolResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

/**
 * Execute a board-scoped agent tool.
 */
export async function executeAgentTool(
  supabase: SupabaseClient,
  userId: string,
  boardId: string,
  toolName: string,
  toolInput: Record<string, unknown>,
  boardContext?: BoardContext | null
): Promise<AgentToolResult> {
  try {
    switch (toolName) {
      case 'think':
        return executeThink(toolInput);
      case 'list_cards':
        return await executeListCards(supabase, boardId, toolInput, boardContext);
      case 'get_card':
        return await executeGetCard(supabase, toolInput);
      case 'search_cards':
        return await executeSearchCards(supabase, boardId, toolInput);
      case 'get_board_summary':
        return await executeGetBoardSummary(boardContext, boardId, supabase);
      case 'create_card':
        return await executeCreateCard(supabase, userId, boardId, toolInput);
      case 'update_card':
        return await executeUpdateCard(supabase, toolInput);
      case 'move_card':
        return await executeMoveCard(supabase, boardId, toolInput);
      case 'add_comment':
        return await executeAddComment(supabase, userId, toolInput);

      // Google Ads - Account Management
      case 'gads_list_campaigns':
        return await executeGadsTool(supabase, toolName, toolInput, () =>
          gadsAccount.listCampaigns({ teamConfigId: toolInput.team_config_id as string, customerId: toolInput.customer_id as string | undefined }));
      case 'gads_keyword_performance':
        return await executeGadsTool(supabase, toolName, toolInput, () =>
          gadsAccount.getKeywordPerformance({ teamConfigId: toolInput.team_config_id as string }, toolInput.campaign_id as string | undefined));
      case 'gads_search_terms_report':
        return await executeGadsTool(supabase, toolName, toolInput, () =>
          gadsAccount.getSearchTermsReport({ teamConfigId: toolInput.team_config_id as string }, toolInput.campaign_id as string | undefined, toolInput.days as number | undefined));
      case 'gads_budget_overview':
        return await executeGadsTool(supabase, toolName, toolInput, () =>
          gadsAccount.getBudgetOverview({ teamConfigId: toolInput.team_config_id as string }));
      case 'gads_update_budget':
        return await executeGadsTool(supabase, toolName, toolInput, () =>
          gadsAccount.updateBudget({ teamConfigId: toolInput.team_config_id as string }, toolInput.campaign_id as string, toolInput.new_daily_budget_micros as number));
      case 'gads_pause_keyword':
        return await executeGadsTool(supabase, toolName, toolInput, () =>
          gadsAccount.updateKeywordStatus({ teamConfigId: toolInput.team_config_id as string }, toolInput.keyword_id as string, toolInput.status as 'ENABLED' | 'PAUSED'));

      // Google Ads - Competitive Intelligence
      case 'gads_competitor_ads':
        return await executeGadsTool(supabase, toolName, toolInput, () =>
          gadsIntel.getCompetitorAds({ teamConfigId: toolInput.team_config_id as string }, toolInput.domain as string, toolInput.keyword as string | undefined, toolInput.limit as number | undefined));
      case 'gads_ad_details':
        return await executeGadsTool(supabase, toolName, toolInput, () =>
          gadsIntel.getAdDetails({ teamConfigId: toolInput.team_config_id as string }, toolInput.ad_id as string));
      case 'gads_analyze_ad_image':
        return await executeGadsTool(supabase, toolName, toolInput, () =>
          gadsIntel.analyzeAdImage({ teamConfigId: toolInput.team_config_id as string }, toolInput.image_url as string, toolInput.context as string | undefined));
      case 'gads_analyze_ad_video':
        return await executeGadsTool(supabase, toolName, toolInput, () =>
          gadsIntel.analyzeAdVideo({ teamConfigId: toolInput.team_config_id as string }, toolInput.video_url as string, toolInput.context as string | undefined));

      default:
        return { success: false, message: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    return {
      success: false,
      message: `Tool execution failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ============================================================================
// INDIVIDUAL TOOL IMPLEMENTATIONS
// ============================================================================

function executeThink(input: Record<string, unknown>): AgentToolResult {
  // Think tool does nothing externally; reasoning is recorded but not shown
  return { success: true, message: 'Reasoning recorded.', data: { reasoning: String(input.reasoning ?? '') } };
}

async function executeListCards(
  supabase: SupabaseClient,
  boardId: string,
  input: Record<string, unknown>,
  boardContext?: BoardContext | null
): Promise<AgentToolResult> {
  // Use cached board context if available
  const ctx = boardContext ?? (await gatherBoardContext(supabase, boardId));
  if (!ctx) return { success: false, message: 'Board not found' };

  let cards = [...ctx.cards];
  const listName = input.list_name as string | undefined;
  const priority = input.priority as string | undefined;
  const assigneeName = input.assignee_name as string | undefined;
  const labelName = input.label_name as string | undefined;
  const hasDueDate = input.has_due_date as boolean | undefined;
  const isOverdue = input.is_overdue as boolean | undefined;
  const limit = Math.min((input.limit as number) || 50, 100);

  if (listName) {
    cards = cards.filter((c) => c.list_name.toLowerCase() === listName.toLowerCase());
  }
  if (priority) {
    cards = cards.filter((c) => c.priority === priority);
  }
  if (assigneeName) {
    cards = cards.filter((c) =>
      c.assignee_names.some((a) => a.toLowerCase().includes(assigneeName.toLowerCase()))
    );
  }
  if (labelName) {
    cards = cards.filter((c) =>
      c.labels.some((l) => l.toLowerCase().includes(labelName.toLowerCase()))
    );
  }
  if (hasDueDate !== undefined) {
    cards = cards.filter((c) => hasDueDate ? c.due_date !== null : c.due_date === null);
  }
  if (isOverdue) {
    const now = new Date().toISOString().split('T')[0];
    cards = cards.filter((c) => c.due_date && c.due_date < now);
  }

  const sliced = cards.slice(0, limit);
  const lines = sliced.map((c) => {
    const parts = [`[${c.list_name}] ${c.title} (id: ${c.id})`];
    if (c.priority !== 'none') parts.push(`priority: ${c.priority}`);
    if (c.due_date) parts.push(`due: ${c.due_date}`);
    if (c.assignee_names.length) parts.push(`assigned: ${c.assignee_names.join(', ')}`);
    if (c.labels.length) parts.push(`labels: ${c.labels.join(', ')}`);
    return parts.join(' | ');
  });

  return {
    success: true,
    message: `Found ${cards.length} cards${cards.length > limit ? ` (showing first ${limit})` : ''}:\n${lines.join('\n')}`,
    data: { total: cards.length, shown: sliced.length },
  };
}

async function executeGetCard(
  supabase: SupabaseClient,
  input: Record<string, unknown>
): Promise<AgentToolResult> {
  const cardId = input.card_id as string;
  if (!cardId) return { success: false, message: 'card_id is required' };

  const { data: card } = await supabase
    .from('cards')
    .select('id, title, description, priority, due_date, created_at, updated_at')
    .eq('id', cardId)
    .single();
  if (!card) return { success: false, message: 'Card not found' };

  const [
    { data: labels },
    { data: comments },
    { data: checklists },
    { data: assignees },
  ] = await Promise.all([
    supabase.from('card_labels').select('label:labels(name)').eq('card_id', cardId),
    supabase.from('comments').select('content, created_at, profile:profiles(display_name)').eq('card_id', cardId).order('created_at', { ascending: false }).limit(10),
    supabase.from('checklists').select('title, items:checklist_items(title, is_completed)').eq('card_id', cardId),
    supabase.from('card_assignees').select('user:profiles(display_name)').eq('card_id', cardId),
  ]);

  const parts: string[] = [];
  parts.push(`# ${card.title} (${card.id})`);
  if (card.description) parts.push(`Description: ${card.description}`);
  if (card.priority !== 'none') parts.push(`Priority: ${card.priority}`);
  if (card.due_date) parts.push(`Due: ${card.due_date}`);
  const assigneeNames = (assignees ?? []).map((a: any) => a.user?.display_name).filter(Boolean);
  if (assigneeNames.length) parts.push(`Assigned to: ${assigneeNames.join(', ')}`);
  const labelNames = (labels ?? []).map((l: any) => l.label?.name).filter(Boolean);
  if (labelNames.length) parts.push(`Labels: ${labelNames.join(', ')}`);
  if (checklists?.length) {
    for (const cl of checklists as any[]) {
      const items = cl.items ?? [];
      const done = items.filter((i: any) => i.is_completed).length;
      parts.push(`Checklist "${cl.title}": ${done}/${items.length} done`);
    }
  }
  if (comments?.length) {
    parts.push(`Recent comments (${comments.length}):`);
    for (const c of (comments as any[]).slice(0, 5)) {
      parts.push(`  - ${c.profile?.display_name ?? 'Unknown'}: ${c.content.slice(0, 200)}`);
    }
  }

  return { success: true, message: parts.join('\n'), data: { card_id: cardId } };
}

async function executeSearchCards(
  supabase: SupabaseClient,
  boardId: string,
  input: Record<string, unknown>
): Promise<AgentToolResult> {
  const query = input.query as string;
  if (!query) return { success: false, message: 'query is required' };
  const limit = Math.min((input.limit as number) || 20, 50);

  // Get list IDs for this board
  const { data: lists } = await supabase
    .from('lists')
    .select('id, name')
    .eq('board_id', boardId);
  if (!lists?.length) return { success: true, message: 'No lists on this board.' };

  const listIds = lists.map((l: any) => l.id);
  const listNameMap = new Map(lists.map((l: any) => [l.id, l.name]));

  // Search in placements
  const { data: placements } = await supabase
    .from('card_placements')
    .select('list_id, card:cards(id, title, description, priority)')
    .in('list_id', listIds)
    .limit(500);

  if (!placements?.length) return { success: true, message: 'No cards found.' };

  const lowerQ = query.toLowerCase();
  const matches = (placements as any[])
    .filter((p) => p.card && (
      p.card.title?.toLowerCase().includes(lowerQ) ||
      p.card.description?.toLowerCase().includes(lowerQ)
    ))
    .slice(0, limit);

  if (matches.length === 0) return { success: true, message: `No cards matching "${query}" found.` };

  const lines = matches.map((m: any) => {
    const listName = listNameMap.get(m.list_id) || 'Unknown';
    return `[${listName}] ${m.card.title} (id: ${m.card.id})`;
  });

  return {
    success: true,
    message: `Found ${matches.length} matching cards:\n${lines.join('\n')}`,
    data: { count: matches.length },
  };
}

async function executeGetBoardSummary(
  boardContext: BoardContext | null | undefined,
  boardId: string,
  supabase: SupabaseClient
): Promise<AgentToolResult> {
  const ctx = boardContext ?? (await gatherBoardContext(supabase, boardId));
  if (!ctx) return { success: false, message: 'Board not found' };

  const summary = boardContextToText(ctx);

  // Add priority breakdown
  const priorityCounts: Record<string, number> = {};
  let overdueCount = 0;
  const now = new Date().toISOString().split('T')[0];
  const workloadMap: Record<string, number> = {};

  for (const card of ctx.cards) {
    priorityCounts[card.priority] = (priorityCounts[card.priority] || 0) + 1;
    if (card.due_date && card.due_date < now) overdueCount++;
    for (const assignee of card.assignee_names) {
      workloadMap[assignee] = (workloadMap[assignee] || 0) + 1;
    }
  }

  const parts: string[] = [summary];
  parts.push(`\nPriority breakdown: ${JSON.stringify(priorityCounts)}`);
  parts.push(`Overdue cards: ${overdueCount}`);
  parts.push(`Total cards: ${ctx.cards.length}`);
  if (Object.keys(workloadMap).length > 0) {
    parts.push(`Workload: ${Object.entries(workloadMap).map(([name, count]) => `${name}: ${count}`).join(', ')}`);
  }

  return { success: true, message: parts.join('\n'), data: { total_cards: ctx.cards.length, overdue: overdueCount } };
}

async function executeCreateCard(
  supabase: SupabaseClient,
  userId: string,
  boardId: string,
  input: Record<string, unknown>
): Promise<AgentToolResult> {
  const title = input.title as string;
  const listName = input.list_name as string;
  if (!title || !listName) return { success: false, message: 'title and list_name are required' };

  // Find the list
  const { data: list } = await supabase
    .from('lists')
    .select('id, name')
    .eq('board_id', boardId)
    .ilike('name', listName)
    .limit(1)
    .single();

  if (!list) {
    const { data: allLists } = await supabase.from('lists').select('name').eq('board_id', boardId);
    const names = (allLists || []).map((l: any) => l.name);
    return { success: false, message: `List "${listName}" not found. Available: ${names.join(', ')}` };
  }

  // Create card
  const cardId = crypto.randomUUID();
  const { error: cardError } = await supabase.from('cards').insert({
    id: cardId,
    title,
    description: (input.description as string) || '',
    priority: (input.priority as string) || 'none',
    due_date: (input.due_date as string) || null,
    created_by: userId,
  });

  if (cardError) return { success: false, message: `Failed to create card: ${cardError.message}` };

  // Create placement
  const { data: maxPos } = await supabase
    .from('card_placements')
    .select('position')
    .eq('list_id', list.id)
    .order('position', { ascending: false })
    .limit(1);

  const nextPos = maxPos?.length ? (maxPos[0] as any).position + 1 : 0;

  const { error: placementError } = await supabase.from('card_placements').insert({
    card_id: cardId,
    list_id: list.id,
    position: nextPos,
    is_mirror: false,
  });

  if (placementError) return { success: false, message: `Card created but placement failed: ${placementError.message}` };

  return {
    success: true,
    message: `Card "${title}" created in "${list.name}" (id: ${cardId})`,
    data: { card_id: cardId, list_id: list.id },
  };
}

async function executeUpdateCard(
  supabase: SupabaseClient,
  input: Record<string, unknown>
): Promise<AgentToolResult> {
  const cardId = input.card_id as string;
  if (!cardId) return { success: false, message: 'card_id is required' };

  const updates: Record<string, unknown> = {};
  if (input.title !== undefined) updates.title = input.title;
  if (input.description !== undefined) updates.description = input.description;
  if (input.priority !== undefined) updates.priority = input.priority;
  if (input.due_date !== undefined) updates.due_date = input.due_date;

  if (Object.keys(updates).length === 0) {
    return { success: false, message: 'No fields to update. Provide title, description, priority, or due_date.' };
  }

  const { error } = await supabase.from('cards').update(updates).eq('id', cardId);
  if (error) return { success: false, message: `Failed to update card: ${error.message}` };

  return {
    success: true,
    message: `Card updated. Changed: ${Object.keys(updates).join(', ')}`,
    data: { card_id: cardId, updated_fields: Object.keys(updates) },
  };
}

async function executeMoveCard(
  supabase: SupabaseClient,
  boardId: string,
  input: Record<string, unknown>
): Promise<AgentToolResult> {
  const cardId = input.card_id as string;
  const targetListName = input.target_list_name as string;
  if (!cardId || !targetListName) return { success: false, message: 'card_id and target_list_name are required' };

  // Find current placement
  const { data: placement } = await supabase
    .from('card_placements')
    .select('id, list_id')
    .eq('card_id', cardId)
    .limit(1)
    .single();
  if (!placement) return { success: false, message: 'Card placement not found' };

  // Find target list
  const { data: targetList } = await supabase
    .from('lists')
    .select('id, name')
    .eq('board_id', boardId)
    .ilike('name', targetListName)
    .limit(1)
    .single();

  if (!targetList) {
    const { data: allLists } = await supabase.from('lists').select('name').eq('board_id', boardId);
    const names = (allLists || []).map((l: any) => l.name);
    return { success: false, message: `List "${targetListName}" not found. Available: ${names.join(', ')}` };
  }

  const { error } = await supabase
    .from('card_placements')
    .update({ list_id: targetList.id })
    .eq('id', placement.id);

  if (error) return { success: false, message: `Failed to move card: ${error.message}` };

  return {
    success: true,
    message: `Card moved to "${targetList.name}"`,
    data: { card_id: cardId, new_list: targetList.name, new_list_id: targetList.id },
  };
}

async function executeAddComment(
  supabase: SupabaseClient,
  userId: string,
  input: Record<string, unknown>
): Promise<AgentToolResult> {
  const cardId = input.card_id as string;
  const content = input.content as string;
  if (!cardId || !content) return { success: false, message: 'card_id and content are required' };

  const { error } = await supabase.from('comments').insert({
    id: crypto.randomUUID(),
    card_id: cardId,
    user_id: userId,
    content: `[Agent] ${content}`,
    is_external: false,
  });

  if (error) return { success: false, message: `Failed to add comment: ${error.message}` };

  return { success: true, message: 'Comment added to card.' };
}

// ============================================================================
// GOOGLE ADS TOOL EXECUTOR (generic wrapper with sanitization)
// ============================================================================

async function executeGadsTool(
  supabase: SupabaseClient,
  toolName: string,
  toolInput: Record<string, unknown>,
  fetcher: () => Promise<{ data: unknown | null; error: string | null }>
): Promise<AgentToolResult> {
  const teamConfigId = toolInput.team_config_id as string | undefined;

  const { data, error } = await fetcher();
  if (error) {
    return { success: false, message: `${toolName} failed: ${error}` };
  }

  const raw = JSON.stringify(data, null, 2);
  const sanitized = sanitizeMcpOutput(raw, toolName, teamConfigId);

  // Log if any flags were raised
  if (sanitized.flags.length > 0) {
    await logSanitizationEvent(
      supabase,
      toolName,
      teamConfigId,
      raw,
      sanitized.flags,
      sanitized.blocked ? 'blocked' : 'sanitized'
    );
  }

  if (sanitized.blocked) {
    return {
      success: false,
      message: `${toolName} output was blocked by security sanitizer. Flags: ${sanitized.flags.join(', ')}. The security team has been notified.`,
    };
  }

  return {
    success: true,
    message: sanitized.output,
    data: data as Record<string, unknown>,
  };
}

// ============================================================================
// EXPORTS FOR TESTING
// ============================================================================

export {
  AGENT_TOOL_DEFINITIONS as _AGENT_TOOL_DEFINITIONS_FOR_TESTING,
};
