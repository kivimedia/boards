import { SupabaseClient } from '@supabase/supabase-js';
import type {
  Integration,
  IntegrationProvider,
  SlackBoardMapping,
  GitHubCardLink,
  FigmaCardEmbed,
  IntegrationWebhookEvent,
} from './types';

// ============================================================================
// INTEGRATION CONNECTIONS
// ============================================================================

export async function getIntegrations(
  supabase: SupabaseClient,
  provider?: IntegrationProvider
): Promise<Integration[]> {
  let query = supabase
    .from('integrations')
    .select('*')
    .order('created_at', { ascending: false });

  if (provider) query = query.eq('provider', provider);

  const { data } = await query;
  return (data as Integration[]) ?? [];
}

export async function getIntegration(
  supabase: SupabaseClient,
  integrationId: string
): Promise<Integration | null> {
  const { data } = await supabase
    .from('integrations')
    .select('*')
    .eq('id', integrationId)
    .single();

  return data as Integration | null;
}

export async function createIntegration(
  supabase: SupabaseClient,
  integration: {
    provider: IntegrationProvider;
    name: string;
    workspaceId?: string;
    metadata?: Record<string, unknown>;
    connectedBy: string;
  }
): Promise<Integration | null> {
  const { data, error } = await supabase
    .from('integrations')
    .insert({
      provider: integration.provider,
      name: integration.name,
      workspace_id: integration.workspaceId ?? null,
      metadata: integration.metadata ?? {},
      is_active: true,
      connected_by: integration.connectedBy,
    })
    .select()
    .single();

  if (error) return null;
  return data as Integration;
}

export async function updateIntegration(
  supabase: SupabaseClient,
  integrationId: string,
  updates: Partial<Pick<Integration, 'name' | 'is_active' | 'metadata'>>
): Promise<Integration | null> {
  const { data, error } = await supabase
    .from('integrations')
    .update(updates)
    .eq('id', integrationId)
    .select()
    .single();

  if (error) return null;
  return data as Integration;
}

export async function deleteIntegration(
  supabase: SupabaseClient,
  integrationId: string
): Promise<void> {
  await supabase.from('integrations').delete().eq('id', integrationId);
}

// ============================================================================
// SLACK
// ============================================================================

export async function getSlackMappings(
  supabase: SupabaseClient,
  boardId?: string
): Promise<SlackBoardMapping[]> {
  let query = supabase
    .from('slack_board_mappings')
    .select('*')
    .order('created_at', { ascending: false });

  if (boardId) query = query.eq('board_id', boardId);

  const { data } = await query;
  return (data as SlackBoardMapping[]) ?? [];
}

export async function createSlackMapping(
  supabase: SupabaseClient,
  mapping: {
    integrationId: string;
    boardId: string;
    channelId: string;
    channelName: string;
    notifyCardCreated?: boolean;
    notifyCardMoved?: boolean;
    notifyCardCompleted?: boolean;
    notifyComments?: boolean;
  }
): Promise<SlackBoardMapping | null> {
  const { data, error } = await supabase
    .from('slack_board_mappings')
    .upsert({
      integration_id: mapping.integrationId,
      board_id: mapping.boardId,
      channel_id: mapping.channelId,
      channel_name: mapping.channelName,
      notify_card_created: mapping.notifyCardCreated ?? true,
      notify_card_moved: mapping.notifyCardMoved ?? true,
      notify_card_completed: mapping.notifyCardCompleted ?? true,
      notify_comments: mapping.notifyComments ?? false,
    })
    .select()
    .single();

  if (error) return null;
  return data as SlackBoardMapping;
}

export async function deleteSlackMapping(
  supabase: SupabaseClient,
  mappingId: string
): Promise<void> {
  await supabase.from('slack_board_mappings').delete().eq('id', mappingId);
}

export async function sendSlackNotification(
  _supabase: SupabaseClient,
  integrationId: string,
  channelId: string,
  message: { text: string; blocks?: Record<string, unknown>[] }
): Promise<boolean> {
  // Placeholder: requires Slack Web API with bot token from integration record
  void integrationId;
  void channelId;
  void message;
  return false;
}

// ============================================================================
// GITHUB
// ============================================================================

export async function getGitHubLinks(
  supabase: SupabaseClient,
  cardId: string
): Promise<GitHubCardLink[]> {
  const { data } = await supabase
    .from('github_card_links')
    .select('*')
    .eq('card_id', cardId)
    .order('created_at', { ascending: false });

  return (data as GitHubCardLink[]) ?? [];
}

export async function createGitHubLink(
  supabase: SupabaseClient,
  link: {
    integrationId: string;
    cardId: string;
    repoOwner: string;
    repoName: string;
    linkType: 'issue' | 'pull_request' | 'branch';
    githubId?: number;
    githubUrl: string;
    state?: string;
    title?: string;
  }
): Promise<GitHubCardLink | null> {
  const { data, error } = await supabase
    .from('github_card_links')
    .insert({
      integration_id: link.integrationId,
      card_id: link.cardId,
      repo_owner: link.repoOwner,
      repo_name: link.repoName,
      link_type: link.linkType,
      github_id: link.githubId ?? null,
      github_url: link.githubUrl,
      state: link.state ?? null,
      title: link.title ?? null,
    })
    .select()
    .single();

  if (error) return null;
  return data as GitHubCardLink;
}

export async function updateGitHubLink(
  supabase: SupabaseClient,
  linkId: string,
  updates: Partial<Pick<GitHubCardLink, 'state' | 'title' | 'last_synced_at'>>
): Promise<GitHubCardLink | null> {
  const { data, error } = await supabase
    .from('github_card_links')
    .update(updates)
    .eq('id', linkId)
    .select()
    .single();

  if (error) return null;
  return data as GitHubCardLink;
}

export async function deleteGitHubLink(
  supabase: SupabaseClient,
  linkId: string
): Promise<void> {
  await supabase.from('github_card_links').delete().eq('id', linkId);
}

// ============================================================================
// FIGMA
// ============================================================================

export async function getFigmaEmbeds(
  supabase: SupabaseClient,
  cardId: string
): Promise<FigmaCardEmbed[]> {
  const { data } = await supabase
    .from('figma_card_embeds')
    .select('*')
    .eq('card_id', cardId)
    .order('created_at', { ascending: false });

  return (data as FigmaCardEmbed[]) ?? [];
}

export async function createFigmaEmbed(
  supabase: SupabaseClient,
  embed: {
    integrationId: string;
    cardId: string;
    figmaFileKey: string;
    figmaNodeId?: string;
    figmaUrl: string;
    embedType: 'file' | 'frame' | 'component' | 'prototype';
    title?: string;
    thumbnailUrl?: string;
  }
): Promise<FigmaCardEmbed | null> {
  const { data, error } = await supabase
    .from('figma_card_embeds')
    .insert({
      integration_id: embed.integrationId,
      card_id: embed.cardId,
      figma_file_key: embed.figmaFileKey,
      figma_node_id: embed.figmaNodeId ?? null,
      figma_url: embed.figmaUrl,
      embed_type: embed.embedType,
      title: embed.title ?? null,
      thumbnail_url: embed.thumbnailUrl ?? null,
    })
    .select()
    .single();

  if (error) return null;
  return data as FigmaCardEmbed;
}

export async function deleteFigmaEmbed(
  supabase: SupabaseClient,
  embedId: string
): Promise<void> {
  await supabase.from('figma_card_embeds').delete().eq('id', embedId);
}

// ============================================================================
// WEBHOOK EVENTS
// ============================================================================

export async function createWebhookEvent(
  supabase: SupabaseClient,
  event: {
    provider: string;
    eventType: string;
    payload: Record<string, unknown>;
  }
): Promise<IntegrationWebhookEvent | null> {
  const { data, error } = await supabase
    .from('integration_webhook_events')
    .insert({
      provider: event.provider,
      event_type: event.eventType,
      payload: event.payload,
    })
    .select()
    .single();

  if (error) return null;
  return data as IntegrationWebhookEvent;
}

export async function getWebhookEvents(
  supabase: SupabaseClient,
  filters?: { provider?: string; processed?: boolean; limit?: number }
): Promise<IntegrationWebhookEvent[]> {
  let query = supabase
    .from('integration_webhook_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(filters?.limit ?? 50);

  if (filters?.provider) query = query.eq('provider', filters.provider);
  if (filters?.processed !== undefined) query = query.eq('processed', filters.processed);

  const { data } = await query;
  return (data as IntegrationWebhookEvent[]) ?? [];
}

export async function markWebhookProcessed(
  supabase: SupabaseClient,
  eventId: string,
  errorMessage?: string
): Promise<void> {
  await supabase
    .from('integration_webhook_events')
    .update({
      processed: true,
      error_message: errorMessage ?? null,
    })
    .eq('id', eventId);
}
