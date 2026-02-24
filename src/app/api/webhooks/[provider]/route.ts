import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createWebhookEvent, markWebhookProcessed } from '@/lib/integrations';

interface RouteParams {
  params: Promise<{ provider: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { provider } = await params;

  if (!['slack', 'github', 'figma'].includes(provider)) {
    return NextResponse.json({ error: 'Unknown provider' }, { status: 400 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  // Slack URL verification challenge
  if (provider === 'slack' && payload.type === 'url_verification') {
    return NextResponse.json({ challenge: payload.challenge });
  }

  const supabase = createServerSupabaseClient();

  // Determine event type from provider-specific payload
  let eventType = 'unknown';

  if (provider === 'slack') {
    const event = payload.event as Record<string, unknown> | undefined;
    eventType = (event?.type as string) ?? (payload.type as string) ?? 'unknown';
  } else if (provider === 'github') {
    eventType = request.headers.get('x-github-event') ?? 'unknown';
  } else if (provider === 'figma') {
    eventType = (payload.event_type as string) ?? 'unknown';
  }

  // Store the webhook event
  const webhookEvent = await createWebhookEvent(supabase, {
    provider,
    eventType,
    payload,
  });

  if (!webhookEvent) {
    return NextResponse.json({ error: 'Failed to store webhook event' }, { status: 500 });
  }

  // Process the event based on provider
  try {
    if (provider === 'github') {
      await processGitHubEvent(supabase, eventType, payload);
    }
    // Mark as processed
    await markWebhookProcessed(supabase, webhookEvent.id);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    await markWebhookProcessed(supabase, webhookEvent.id, errorMessage);
  }

  return NextResponse.json({ ok: true, event_id: webhookEvent.id });
}

async function processGitHubEvent(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  // Update linked GitHub card links when PR/issue state changes
  if (eventType === 'pull_request' || eventType === 'issues') {
    const action = payload.action as string | undefined;
    if (!action) return;

    const item = (payload.pull_request ?? payload.issue) as Record<string, unknown> | undefined;
    if (!item) return;

    const githubId = item.id as number;
    const state = item.state as string;
    const title = item.title as string;

    if (githubId && state) {
      await supabase
        .from('github_card_links')
        .update({
          state,
          title: title ?? null,
          last_synced_at: new Date().toISOString(),
        })
        .eq('github_id', githubId);
    }
  }
}
