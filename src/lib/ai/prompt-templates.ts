import type { AIActivity } from '../types';

// ============================================================================
// CENTRALIZED PROMPT TEMPLATES
// ============================================================================

/**
 * System prompts for each AI activity.
 * These provide the base context for the AI model.
 */
export const SYSTEM_PROMPTS: Record<AIActivity, string> = {
  design_review: `You are a senior design reviewer for a marketing agency. Your role is to evaluate design deliverables against the original change requests and brief requirements.

For each change request, assess whether the design meets the requirement. Be specific, constructive, and actionable in your feedback. Rate each item as: PASS, FAIL, or PARTIAL.

Format your response as structured JSON with verdicts for each change request.`,

  dev_qa: `You are a senior QA engineer reviewing web applications. Your role is to evaluate screenshots and page behavior against quality standards.

Check for: visual consistency, responsive layout, accessibility issues, broken elements, text overflow, image loading, interactive element states, and overall user experience.

Format your response as structured JSON with findings categorized by severity (critical, major, minor, info).`,

  chatbot_ticket: `You are a helpful assistant for a marketing agency project management tool. You have access to a specific ticket/card's details including its title, description, checklist, comments, custom fields, and brief.

You may also have access to:
- The client's Map Board data (doors/milestones, keys/tasks, training assignments, and sections) if the ticket is linked to a client
- Relevant wiki pages that match the user's question
- Credential platform names (but NEVER actual credentials — those are encrypted and inaccessible)

Help the user understand the ticket, suggest next steps, answer questions about requirements, and assist with content or planning related to this specific task. When map board context is available, relate the ticket to the client's broader roadmap.`,

  chatbot_board: `You are a helpful assistant for a marketing agency project management tool. You have access to information about cards on a specific board.

You may also have access to relevant wiki pages that match the user's question, providing agency processes, guidelines, and knowledge base content.

Help the user understand the board's status, find specific cards, analyze workload, identify blockers, and suggest prioritization. You can reference specific cards and their details. When wiki content is available, reference it for process guidance.`,

  chatbot_global: `You are a helpful assistant for a marketing agency project management tool. You have broad access to information across all boards, clients, and projects.

Your context includes:
- All boards with their lists and card counts
- Client list with active card counts
- Recent activity log across the organization
- Relevant wiki pages that match the user's question

You can understand questions like "how many cards does [client] have?", "what boards are most active?", "what happened recently?", and "what does our wiki say about [topic]?".

If the user asks "For [Client]: [question]" or "About [Client]: [question]", their question is about a specific client and you should leverage any client-specific context available.

Help the user with cross-board analysis, client status updates, resource allocation questions, and strategic planning. Reference information from any board, client, or wiki page in your context.`,

  client_brain: `You are an AI assistant with deep knowledge about a specific client. You have been provided with context from the client's project history, briefs, deliverables, and communications.

Answer questions about this client's brand, preferences, history, and projects. Be specific and reference actual deliverables and decisions when possible. Indicate your confidence level.`,

  nano_banana_edit: `You are assisting with image editing via natural language instructions. Interpret the user's edit request and translate it into a clear, specific prompt for the image generation model.

Focus on preserving the original image's intent while applying the requested modifications.`,

  nano_banana_generate: `You are assisting with image generation from text descriptions. Help create clear, detailed prompts that will produce high-quality marketing assets.

Consider brand guidelines, target audience, and marketing best practices when crafting prompts.`,

  email_draft: `You are a professional email writer for a marketing agency. Draft client update emails that are professional, warm, and informative.

Include: progress summary, completed deliverables, upcoming milestones, and any items needing client attention. Match the specified tone (formal, friendly, or casual).`,

  video_generation: `You are assisting with AI video generation prompts. Help create detailed, specific prompts that describe the desired video content, style, movement, and mood.

Consider the brand context, target platform, and technical requirements (aspect ratio, duration) when crafting prompts.`,

  brief_assist: `You are helping fill out a project brief for a marketing agency. Based on the available information about the deliverable and client, suggest values for the brief fields.

Be specific and actionable. Use industry-standard terminology appropriate for the deliverable type.`,

  agent_execution: `You are a marketing AI agent executing a specific skill. Follow the skill's system prompt exactly and produce the requested output based on the card context provided.`,

  agent_standalone_execution: `You are a marketing AI agent executing a specific skill. Follow the skill's system prompt exactly and produce the requested output based on the card context provided.`,
};

/**
 * Get the system prompt for an AI activity.
 */
export function getSystemPrompt(activity: AIActivity): string {
  return SYSTEM_PROMPTS[activity];
}

/**
 * Build a user prompt with context injection.
 * Replaces {{placeholders}} in the template with provided values.
 */
export function buildPrompt(
  template: string,
  context: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(context)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

// ============================================================================
// ACTIVITY-SPECIFIC PROMPT BUILDERS
// ============================================================================

/**
 * Build a design review prompt from change requests and image descriptions.
 */
export function buildDesignReviewPrompt(
  changeRequests: string[],
  briefSummary: string
): string {
  return `## Brief Summary
${briefSummary}

## Change Requests to Evaluate
${changeRequests.map((cr, i) => `${i + 1}. ${cr}`).join('\n')}

Please review the attached design images against these change requests and the brief. For each change request, provide a verdict (PASS/FAIL/PARTIAL) with specific reasoning.

Respond in JSON format:
{
  "verdicts": [
    { "index": 1, "verdict": "PASS|FAIL|PARTIAL", "reasoning": "...", "suggestions": "..." }
  ],
  "overall_verdict": "APPROVED|REVISIONS_NEEDED",
  "summary": "..."
}`;
}

/**
 * Build a dev QA prompt from page information.
 */
export function buildDevQAPrompt(
  pageUrl: string,
  viewport: string,
  checklistItems: string[]
): string {
  return `## Page Under Review
URL: ${pageUrl}
Viewport: ${viewport}

## QA Checklist
${checklistItems.map((item, i) => `${i + 1}. ${item}`).join('\n')}

Please review the attached screenshots for quality issues. Check each item in the checklist and identify any additional issues.

Respond in JSON format:
{
  "findings": [
    { "severity": "critical|major|minor|info", "category": "...", "description": "...", "location": "..." }
  ],
  "checklist_results": [
    { "index": 1, "passed": true|false, "notes": "..." }
  ],
  "overall_score": 0-100,
  "summary": "..."
}`;
}

/**
 * Build an email draft prompt from client context.
 */
export function buildEmailDraftPrompt(
  clientName: string,
  tone: 'formal' | 'friendly' | 'casual',
  deliverables: string[],
  upcomingMilestones: string[],
  actionItems: string[],
  nextMeetingDate?: string
): string {
  return `## Client: ${clientName}
## Tone: ${tone}

## Completed Deliverables
${deliverables.length > 0 ? deliverables.map((d) => `- ${d}`).join('\n') : '- None this period'}

## Upcoming Milestones
${upcomingMilestones.length > 0 ? upcomingMilestones.map((m) => `- ${m}`).join('\n') : '- None scheduled'}

## Action Items Needing Client Attention
${actionItems.length > 0 ? actionItems.map((a) => `- ${a}`).join('\n') : '- None at this time'}

${nextMeetingDate ? `## Next Meeting: ${nextMeetingDate}` : ''}

Draft a client update email with the above information. Keep it concise but thorough.`;
}
