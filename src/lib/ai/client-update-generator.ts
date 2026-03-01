import { SupabaseClient } from '@supabase/supabase-js';
import { createAnthropicClient } from './providers';
import type { ClientActivityData } from '../client-activity-gatherer';

export interface GeneratedUpdate {
  summary: string;
  detailed_html: string;
  model_used: string;
  tokens_used: number;
}

const MODEL_ID = 'claude-sonnet-4-20250514';

function buildActivityContext(data: ClientActivityData): string {
  let text = `Client: ${data.client.name}\n`;
  text += `Company: ${data.client.company || 'N/A'}\n`;
  text += `Period: ${new Date(data.period.start).toLocaleDateString()} to ${new Date(data.period.end).toLocaleDateString()}\n\n`;

  text += `Summary: ${data.summary_stats.total_cards} total tickets, ${data.summary_stats.cards_completed} completed, ${data.summary_stats.cards_created} new, ${data.summary_stats.comments_added} comments`;
  if (data.summary_stats.meetings_held) {
    text += `, ${data.summary_stats.meetings_held} meetings held`;
  }
  text += '\n\n';

  // Meeting activity (from Fathom)
  if (data.meetings && data.meetings.length > 0) {
    text += 'Meeting Activity:\n';
    for (const meeting of data.meetings) {
      text += `\n--- Meeting: ${meeting.title} (${new Date(meeting.recorded_at).toLocaleDateString()}) ---\n`;
      if (meeting.duration_seconds) {
        const mins = Math.round(meeting.duration_seconds / 60);
        text += `Duration: ${mins} minutes\n`;
      }
      if (meeting.ai_summary) {
        text += `Summary: ${meeting.ai_summary.slice(0, 500)}\n`;
      }
      if (meeting.ai_action_items && meeting.ai_action_items.length > 0) {
        text += 'Action items:\n';
        for (const item of meeting.ai_action_items) {
          text += `  - ${typeof item === 'string' ? item : item.text}\n`;
        }
      }
    }
    text += '\n';
  }

  if (data.cards.length === 0 && (!data.meetings || data.meetings.length === 0)) {
    text += 'No significant activity this period.\n';
    return text;
  }

  if (data.cards.length > 0) {
    text += 'Ticket Activity:\n';
  }
  for (const card of data.cards) {
    text += `\n--- ${card.title} [${card.list_name}] (Priority: ${card.priority}) ---\n`;
    if (card.due_date) text += `Due: ${card.due_date}\n`;
    if (card.was_created_this_period) text += `NEW this week\n`;
    if (card.was_completed_this_period) text += `COMPLETED this week\n`;

    for (const sc of card.status_changes) {
      text += `  Moved: ${sc.from_list} -> ${sc.to_list} (${new Date(sc.changed_at).toLocaleDateString()})\n`;
    }
    for (const c of card.new_comments.slice(0, 3)) {
      text += `  Comment by ${c.author}: "${c.content.slice(0, 200)}"\n`;
    }
  }

  return text;
}

/**
 * Generate a client-friendly weekly update using Claude.
 */
export async function generateClientUpdate(
  supabase: SupabaseClient,
  activityData: ClientActivityData
): Promise<GeneratedUpdate> {
  const client = await createAnthropicClient(supabase);
  if (!client) throw new Error('Anthropic API key not configured');

  const activityContext = buildActivityContext(activityData);

  const systemPrompt = `You are a professional account manager writing a weekly progress update email to a client.

Guidelines:
- Write from the agency's perspective ("This week, our team...")
- Use professional but warm tone suitable for client communication
- Convert internal terminology to client-friendly language (e.g., "moved to QA" becomes "now in quality review")
- Do NOT include internal ticket IDs, priority levels, or technical details
- If meetings were held, include a "Meeting Highlights" section summarizing key discussions and follow-up items
- Reference meeting action items alongside ticket activity for a complete picture
- If there was no activity, write a brief reassuring message

You must output valid JSON with this exact structure:
{
  "summary": "A 2-3 sentence TL;DR of the week's progress",
  "sections": [
    {
      "heading": "Section name (e.g., 'Completed', 'In Progress', 'Coming Up')",
      "items": [
        {
          "title": "Brief item title",
          "description": "1-2 sentence description of the update"
        }
      ]
    }
  ]
}

Group updates by status: Completed items first, then In Progress, then Coming Up (based on due dates). Only include sections that have items.`;

  const response = await client.messages.create({
    model: MODEL_ID,
    max_tokens: 2048,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Generate a weekly update email for this client activity:\n\n${activityContext}`,
      },
    ],
  });

  const responseText = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('');

  const tokensUsed = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

  // Parse the JSON response
  let parsed: { summary: string; sections: { heading: string; items: { title: string; description: string }[] }[] };
  try {
    // Handle possible markdown code block wrapping
    const jsonStr = responseText.replace(/^```json?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
    parsed = JSON.parse(jsonStr);
  } catch {
    // Fallback: use raw text as summary
    return {
      summary: responseText.slice(0, 500),
      detailed_html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.6;color:#1a1a2e;max-width:600px;"><p>${responseText.replace(/\n/g, '<br>')}</p></div>`,
      model_used: MODEL_ID,
      tokens_used: tokensUsed,
    };
  }

  // Convert structured response to HTML email
  const detailedHtml = buildEmailHtml(activityData.client.name, parsed);

  return {
    summary: parsed.summary,
    detailed_html: detailedHtml,
    model_used: MODEL_ID,
    tokens_used: tokensUsed,
  };
}

function buildEmailHtml(
  clientName: string,
  parsed: { summary: string; sections: { heading: string; items: { title: string; description: string }[] }[] }
): string {
  const sectionHtml = parsed.sections
    .map(section => {
      const itemsHtml = section.items
        .map(item => `
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;">
              <strong style="color:#1a1a2e;">${escapeHtml(item.title)}</strong>
              <br><span style="color:#666;">${escapeHtml(item.description)}</span>
            </td>
          </tr>`)
        .join('');

      return `
        <div style="margin-bottom:24px;">
          <h3 style="color:#1a1a2e;font-size:16px;margin:0 0 12px 0;padding-bottom:8px;border-bottom:2px solid #3b82f6;">
            ${escapeHtml(section.heading)}
          </h3>
          <table style="width:100%;border-collapse:collapse;">${itemsHtml}</table>
        </div>`;
    })
    .join('');

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.6;color:#1a1a2e;max-width:600px;">
      <div style="background:#f8fafc;border-radius:8px;padding:16px;margin-bottom:24px;">
        <h2 style="margin:0 0 8px 0;font-size:14px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">TL;DR</h2>
        <p style="margin:0;color:#1a1a2e;font-size:15px;">${escapeHtml(parsed.summary)}</p>
      </div>
      ${sectionHtml}
      <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;color:#999;font-size:12px;">
        This update was automatically generated for ${escapeHtml(clientName)}.
      </div>
    </div>`.trim();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
