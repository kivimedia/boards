import { SupabaseClient } from '@supabase/supabase-js';
import { createAnthropicClient } from './ai/providers';
import type { MeetingPrepTicket } from './types';

export interface MeetingPrepData {
  client: { id: string; name: string; company: string | null };
  meeting: { title: string; time: string; link: string | null };
  executive_summary: string;
  tickets: MeetingPrepTicket[];
  last_update: {
    id: string;
    sent_at: string | null;
    summary: string;
  } | null;
  relevant_links: { label: string; url: string }[];
}

const DONE_LIST_PATTERNS = ['done', 'complete', 'completed', 'delivered', 'finished', 'approved'];
const IN_PROGRESS_PATTERNS = ['in progress', 'working', 'active', 'doing'];
const BLOCKED_PATTERNS = ['blocked', 'stuck', 'waiting', 'on hold'];

function inferStatusLabel(listName: string): string {
  const lower = listName.toLowerCase();
  if (DONE_LIST_PATTERNS.some(p => lower.includes(p))) return 'Done';
  if (BLOCKED_PATTERNS.some(p => lower.includes(p))) return 'Blocked';
  if (IN_PROGRESS_PATTERNS.some(p => lower.includes(p))) return 'In Progress';
  if (lower.includes('review') || lower.includes('qa')) return 'In Review';
  if (lower.includes('backlog') || lower.includes('todo') || lower.includes('to do')) return 'To Do';
  return 'In Progress';
}

/**
 * Build the full meeting prep data for a client.
 */
export async function buildMeetingPrep(
  supabase: SupabaseClient,
  clientId: string,
  meetingTitle: string = 'Client Meeting',
  meetingTime: string = new Date().toISOString(),
  eventLink: string | null = null
): Promise<MeetingPrepData> {
  // 1. Fetch client
  const { data: client } = await supabase
    .from('clients')
    .select('id, name, company')
    .eq('id', clientId)
    .single();

  if (!client) throw new Error(`Client ${clientId} not found`);

  // 2. Fetch all cards with placements
  const { data: cards } = await supabase
    .from('cards')
    .select('id, title, priority, due_date')
    .eq('client_id', clientId);

  const cardIds = (cards || []).map(c => c.id);

  // 3. Fetch placements for list names
  let cardListMap: Record<string, string> = {};
  if (cardIds.length > 0) {
    const { data: placements } = await supabase
      .from('card_placements')
      .select('card_id, list:lists(name)')
      .in('card_id', cardIds);

    for (const p of (placements || [])) {
      cardListMap[p.card_id] = (p as any).list?.name || 'Unknown';
    }
  }

  // 4. Fetch recent comments (last 5 per card, up to 100 total)
  let commentsByCard: Record<string, { author: string; content: string; date: string }[]> = {};
  if (cardIds.length > 0) {
    const { data: comments } = await supabase
      .from('comments')
      .select('card_id, content, created_at, user:profiles(display_name)')
      .in('card_id', cardIds)
      .order('created_at', { ascending: false })
      .limit(100);

    for (const c of (comments || [])) {
      if (!commentsByCard[c.card_id]) commentsByCard[c.card_id] = [];
      if (commentsByCard[c.card_id].length < 5) {
        commentsByCard[c.card_id].push({
          author: (c as any).user?.display_name || 'Unknown',
          content: c.content.slice(0, 300),
          date: c.created_at,
        });
      }
    }
  }

  // 5. Build tickets
  const tickets: MeetingPrepTicket[] = (cards || []).map(card => {
    const listName = cardListMap[card.id] || 'Unknown';
    return {
      card_id: card.id,
      title: card.title,
      list_name: listName,
      priority: card.priority || 'none',
      due_date: card.due_date,
      status_label: inferStatusLabel(listName),
      recent_comments: commentsByCard[card.id] || [],
    };
  });

  // Sort: blocked first, then in progress, then to do, then done
  const statusOrder: Record<string, number> = { 'Blocked': 0, 'In Review': 1, 'In Progress': 2, 'To Do': 3, 'Done': 4 };
  tickets.sort((a, b) => (statusOrder[a.status_label] ?? 3) - (statusOrder[b.status_label] ?? 3));

  // 6. Fetch most recent sent update
  const { data: lastUpdate } = await supabase
    .from('client_weekly_updates')
    .select('id, sent_at, ai_summary')
    .eq('client_id', clientId)
    .eq('status', 'sent')
    .order('sent_at', { ascending: false })
    .limit(1)
    .single();

  // 7. Generate executive summary via Claude
  let executiveSummary = '';
  try {
    const aiClient = await createAnthropicClient(supabase);
    if (aiClient && tickets.length > 0) {
      const ticketContext = tickets
        .slice(0, 15)
        .map(t => `- ${t.title} [${t.status_label}]${t.due_date ? `, due ${t.due_date}` : ''}`)
        .join('\n');

      const response = await aiClient.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        system: 'You are a meeting prep assistant. Write a 3-4 sentence executive brief summarizing the current state of work for this client. Be concise, highlight anything blocked or overdue, and mention key wins. Do not use bullet points, just flowing sentences.',
        messages: [{
          role: 'user',
          content: `Client: ${client.name}\nCompany: ${client.company || 'N/A'}\nMeeting: ${meetingTitle}\n\nCurrent tickets:\n${ticketContext}${lastUpdate?.ai_summary ? `\n\nLast update summary: ${lastUpdate.ai_summary}` : ''}`,
        }],
      });

      executiveSummary = response.content
        .filter(b => b.type === 'text')
        .map(b => (b as { type: 'text'; text: string }).text)
        .join('');
    }
  } catch (err) {
    console.error('[MeetingPrep] AI summary generation failed:', err);
  }

  if (!executiveSummary) {
    const activeCount = tickets.filter(t => t.status_label !== 'Done').length;
    const blockedCount = tickets.filter(t => t.status_label === 'Blocked').length;
    executiveSummary = `${client.name} has ${tickets.length} total tickets, ${activeCount} active${blockedCount > 0 ? `, ${blockedCount} blocked` : ''}. Review the ticket details below for specifics.`;
  }

  // 8. Build relevant links
  const relevant_links: { label: string; url: string }[] = [];
  // Try to find the Account Manager board for a direct link
  const { data: amBoard } = await supabase
    .from('boards')
    .select('id')
    .eq('type', 'account_manager')
    .limit(1)
    .single();

  if (amBoard) {
    relevant_links.push({ label: 'Account Manager Board', url: `/board/${amBoard.id}` });
  }
  relevant_links.push({ label: 'Client Strategy Map', url: `/clients/${clientId}` });

  return {
    client: { id: client.id, name: client.name, company: client.company },
    meeting: { title: meetingTitle, time: meetingTime, link: eventLink },
    executive_summary: executiveSummary,
    tickets,
    last_update: lastUpdate ? {
      id: lastUpdate.id,
      sent_at: lastUpdate.sent_at,
      summary: lastUpdate.ai_summary || '',
    } : null,
    relevant_links,
  };
}
