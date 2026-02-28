import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { createAnthropicClient, touchApiKey } from '@/lib/ai/providers';
import { scrapeSiteContext } from '@/lib/seo/scrape-site-context';

interface GenerateBody {
  team_config_id: string;
  months?: number;
  posts_per_week?: number;
}

function getPublishDates(startDate: Date, endDate: Date, publishDays: string[], postsPerWeek: number): Date[] {
  const dayMap: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
    thursday: 4, friday: 5, saturday: 6,
  };
  const targetDays = publishDays.length > 0
    ? publishDays.map(d => dayMap[d.toLowerCase()]).filter(d => d !== undefined)
    : [1, 4]; // Default: Monday + Thursday

  const dates: Date[] = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    if (targetDays.includes(current.getDay())) {
      dates.push(new Date(current));
    }
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<GenerateBody>(request);
  if (!body.ok) return body.response;

  const { team_config_id, months = 3, posts_per_week } = body.body;
  if (!team_config_id?.trim()) return errorResponse('team_config_id is required');

  const { supabase, userId } = auth.ctx;

  // Fetch config
  const { data: config, error: configErr } = await supabase
    .from('seo_team_configs')
    .select('*')
    .eq('id', team_config_id)
    .single();
  if (configErr || !config) return errorResponse('Config not found', 404);

  const silos: string[] = config.config?.content_targets || [];
  if (silos.length === 0) return errorResponse('No content silos configured. Add silos in SEO Settings first.', 400);

  const ppw = posts_per_week || config.config?.schedule?.posts_per_week || 2;
  const totalPosts = ppw * 4 * months; // approximate

  // Get AI client
  const anthropic = await createAnthropicClient(supabase);
  if (!anthropic) return errorResponse('Anthropic API key not configured. Add it in Settings > AI Keys.', 400);

  // Scrape site context
  const siteContext = await scrapeSiteContext(config.site_url);

  // Get existing topics for deduplication
  const { data: existingRuns } = await supabase
    .from('seo_pipeline_runs')
    .select('topic, silo')
    .eq('team_config_id', team_config_id)
    .not('status', 'in', '("failed","scrapped")');
  const existingTopics = (existingRuns || []).map((r: { topic: string }) => r.topic).filter(Boolean);

  const { data: existingItems } = await supabase
    .from('seo_calendar_items')
    .select('topic')
    .eq('team_config_id', team_config_id)
    .eq('status', 'planned');
  const existingCalendarTopics = (existingItems || []).map((i: { topic: string }) => i.topic);

  // Build prompt
  const prompt = `You are an expert SEO content strategist. Generate a content calendar for "${config.site_name}" (${config.site_url}).

SITE CONTEXT (scraped from the actual site):
${siteContext || '(Could not scrape site)'}

CONTENT SILOS (distribute posts evenly across these):
${silos.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}

SCHEDULE: ${ppw} posts per week, ${totalPosts} total posts needed for ${months} months.

ALREADY PUBLISHED OR IN-PROGRESS (do NOT repeat these):
${existingTopics.length > 0 ? existingTopics.map((t: string) => `- ${t}`).join('\n') : '(none)'}

ALREADY IN OTHER CALENDARS (avoid duplicates):
${existingCalendarTopics.length > 0 ? existingCalendarTopics.map((t: string) => `- ${t}`).join('\n') : '(none)'}

REQUIREMENTS:
- Generate exactly ${totalPosts} unique blog post topics
- Distribute topics evenly across all silos
- Topics should target real search intent from potential customers
- Include a mix of: how-to guides, comparison posts, listicles, case studies, and educational content
- Each topic should be specific enough to write a full article about
- Include 2-4 target keywords per topic
- Suggest a brief angle/hook for each post (1-2 sentences)
- Suggest a target word count (1000-2500 range)

Return ONLY a JSON array with this exact shape:
[{"topic":"Blog post title","silo":"Silo name from the list above","keywords":["primary","secondary"],"outline_notes":"Brief angle description","target_word_count":1500}]`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    });
    await touchApiKey(supabase, 'anthropic');

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return errorResponse('Failed to parse AI response', 500);

    const items: Array<{
      topic: string;
      silo: string;
      keywords: string[];
      outline_notes: string;
      target_word_count: number;
    }> = JSON.parse(jsonMatch[0]);

    // Calculate cost
    const inputTokens = response.usage?.input_tokens || 0;
    const outputTokens = response.usage?.output_tokens || 0;
    const costUsd = (inputTokens * 0.003 + outputTokens * 0.015) / 1000;

    // Generate publish dates
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + (7 - startDate.getDay()) + 1); // Next Monday
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + months);

    const publishDays: string[] = config.config?.schedule?.publish_days || ['monday', 'thursday'];
    const dates = getPublishDates(startDate, endDate, publishDays, ppw);

    // Create calendar record
    const { data: calendar, error: calErr } = await supabase
      .from('seo_calendars')
      .insert({
        team_config_id,
        client_id: config.client_id || null,
        name: `${config.site_name} - ${months}mo Calendar`,
        status: 'draft',
        date_range_start: startDate.toISOString().split('T')[0],
        date_range_end: endDate.toISOString().split('T')[0],
        generation_prompt: prompt.slice(0, 10000),
        generation_model: 'claude-sonnet-4-20250514',
        generation_cost_usd: costUsd,
        items_count: items.length,
        created_by: userId,
      })
      .select()
      .single();

    if (calErr || !calendar) return errorResponse(calErr?.message || 'Failed to create calendar', 500);

    // Insert items with dates
    const calendarItems = items.map((item, idx) => ({
      calendar_id: calendar.id,
      team_config_id,
      topic: item.topic,
      silo: item.silo || null,
      keywords: item.keywords || [],
      outline_notes: item.outline_notes || null,
      target_word_count: item.target_word_count || 1500,
      scheduled_date: dates[idx % dates.length].toISOString().split('T')[0],
      sort_order: idx,
      status: 'planned',
    }));

    const { data: insertedItems, error: itemsErr } = await supabase
      .from('seo_calendar_items')
      .insert(calendarItems)
      .select();

    if (itemsErr) return errorResponse(itemsErr.message, 500);

    return successResponse({ calendar, items: insertedItems }, 201);
  } catch (err) {
    console.error('[seo] Calendar generation failed:', err);
    return errorResponse(err instanceof Error ? err.message : 'AI call failed', 500);
  }
}
