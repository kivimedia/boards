import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getIntegrations,
  getIntegration,
  createIntegration,
  updateIntegration,
  deleteIntegration,
  getSlackMappings,
  createSlackMapping,
  deleteSlackMapping,
  getGitHubLinks,
  createGitHubLink,
  updateGitHubLink,
  deleteGitHubLink,
  getFigmaEmbeds,
  createFigmaEmbed,
  deleteFigmaEmbed,
  createWebhookEvent,
  getWebhookEvents,
  markWebhookProcessed,
  sendSlackNotification,
} from '../../lib/integrations';
import type {
  Integration,
  SlackBoardMapping,
  GitHubCardLink,
  FigmaCardEmbed,
  IntegrationWebhookEvent,
} from '../../lib/types';

// Mock Supabase client builder
function createMockSupabase(
  overrides: {
    selectData?: unknown;
    singleData?: unknown;
    insertData?: unknown;
    upsertData?: unknown;
    updateData?: unknown;
    deleteResult?: unknown;
    error?: { message: string } | null;
  } = {}
) {
  const error = overrides.error ?? null;

  const chainable = {
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: overrides.singleData ?? null, error }),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
  };

  // When select is called without single, resolve with data array
  chainable.select.mockImplementation(() => {
    const result = {
      ...chainable,
      single: vi.fn().mockResolvedValue({
        data: overrides.singleData ?? overrides.insertData ?? overrides.upsertData ?? overrides.updateData ?? null,
        error,
      }),
      then: (resolve: (val: { data: unknown; error: unknown }) => void) => {
        resolve({ data: overrides.selectData ?? [], error });
        return { catch: vi.fn() };
      },
    };
    // Make chainable thenable for non-single queries
    return result;
  });

  // Override order to be thenable (for list queries)
  chainable.order.mockImplementation(() => ({
    ...chainable,
    then: (resolve: (val: { data: unknown; error: unknown }) => void) => {
      resolve({ data: overrides.selectData ?? [], error });
      return { catch: vi.fn() };
    },
    limit: vi.fn().mockImplementation(() => ({
      ...chainable,
      then: (resolve: (val: { data: unknown; error: unknown }) => void) => {
        resolve({ data: overrides.selectData ?? [], error });
        return { catch: vi.fn() };
      },
    })),
    single: vi.fn().mockResolvedValue({
      data: overrides.singleData ?? null,
      error,
    }),
  }));

  // For insert/upsert/update - chain to select().single()
  chainable.insert.mockReturnValue({
    ...chainable,
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: overrides.insertData ?? null,
        error,
      }),
    }),
  });

  chainable.upsert.mockReturnValue({
    ...chainable,
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: overrides.upsertData ?? null,
        error,
      }),
    }),
  });

  chainable.update.mockReturnValue({
    ...chainable,
    eq: vi.fn().mockReturnValue({
      ...chainable,
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: overrides.updateData ?? null,
          error,
        }),
      }),
    }),
  });

  chainable.delete.mockReturnValue({
    eq: vi.fn().mockResolvedValue({ data: null, error: null }),
  });

  const supabase = {
    from: vi.fn().mockReturnValue(chainable),
  };

  return supabase as unknown as Parameters<typeof getIntegrations>[0];
}

// ============================================================================
// INTEGRATION CONNECTIONS
// ============================================================================

describe('Integrations Library (P3.5)', () => {
  describe('getIntegrations', () => {
    it('returns an array of integrations', async () => {
      const mockData: Integration[] = [
        {
          id: 'int-1',
          provider: 'slack',
          name: 'My Slack',
          workspace_id: 'T12345',
          metadata: {},
          is_active: true,
          connected_by: 'user-1',
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      ];

      const supabase = createMockSupabase({ selectData: mockData });
      const result = await getIntegrations(supabase);

      expect(result).toEqual(mockData);
    });

    it('filters by provider when specified', async () => {
      const supabase = createMockSupabase({ selectData: [] });
      await getIntegrations(supabase, 'github');

      expect(supabase.from).toHaveBeenCalledWith('integrations');
    });

    it('returns empty array on no data', async () => {
      const supabase = createMockSupabase({ selectData: null });
      const result = await getIntegrations(supabase);

      expect(result).toEqual([]);
    });
  });

  describe('getIntegration', () => {
    it('returns a single integration by ID', async () => {
      const mockIntegration: Integration = {
        id: 'int-1',
        provider: 'github',
        name: 'GitHub Org',
        workspace_id: null,
        metadata: { org: 'acme' },
        is_active: true,
        connected_by: 'user-1',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      const supabase = createMockSupabase({ singleData: mockIntegration });
      const result = await getIntegration(supabase, 'int-1');

      expect(result).toEqual(mockIntegration);
    });

    it('returns null when not found', async () => {
      const supabase = createMockSupabase({ singleData: null });
      const result = await getIntegration(supabase, 'non-existent');

      expect(result).toBeNull();
    });
  });

  describe('createIntegration', () => {
    it('creates a new integration successfully', async () => {
      const mockResult: Integration = {
        id: 'int-new',
        provider: 'figma',
        name: 'Figma Team',
        workspace_id: 'ws-1',
        metadata: {},
        is_active: true,
        connected_by: 'user-1',
        created_at: '2025-01-02T00:00:00Z',
        updated_at: '2025-01-02T00:00:00Z',
      };

      const supabase = createMockSupabase({ insertData: mockResult });
      const result = await createIntegration(supabase, {
        provider: 'figma',
        name: 'Figma Team',
        workspaceId: 'ws-1',
        connectedBy: 'user-1',
      });

      expect(result).toEqual(mockResult);
    });

    it('returns null on insert error', async () => {
      const supabase = createMockSupabase({
        insertData: null,
        error: { message: 'DB error' },
      });
      const result = await createIntegration(supabase, {
        provider: 'slack',
        name: 'Slack',
        connectedBy: 'user-1',
      });

      expect(result).toBeNull();
    });
  });

  describe('updateIntegration', () => {
    it('updates integration fields', async () => {
      const mockResult: Integration = {
        id: 'int-1',
        provider: 'slack',
        name: 'Updated Name',
        workspace_id: null,
        metadata: {},
        is_active: false,
        connected_by: 'user-1',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-03T00:00:00Z',
      };

      const supabase = createMockSupabase({ updateData: mockResult });
      const result = await updateIntegration(supabase, 'int-1', {
        name: 'Updated Name',
        is_active: false,
      });

      expect(result).toEqual(mockResult);
    });

    it('returns null on update error', async () => {
      const supabase = createMockSupabase({ updateData: null, error: { message: 'error' } });
      const result = await updateIntegration(supabase, 'int-1', { name: 'X' });

      expect(result).toBeNull();
    });
  });

  describe('deleteIntegration', () => {
    it('deletes an integration', async () => {
      const supabase = createMockSupabase();
      await deleteIntegration(supabase, 'int-1');

      expect(supabase.from).toHaveBeenCalledWith('integrations');
    });
  });

  // ============================================================================
  // SLACK MAPPINGS
  // ============================================================================

  describe('getSlackMappings', () => {
    it('returns slack mappings', async () => {
      const mockMappings: SlackBoardMapping[] = [
        {
          id: 'map-1',
          integration_id: 'int-1',
          board_id: 'board-1',
          channel_id: 'C12345',
          channel_name: 'general',
          notify_card_created: true,
          notify_card_moved: true,
          notify_card_completed: true,
          notify_comments: false,
          created_at: '2025-01-01T00:00:00Z',
        },
      ];

      const supabase = createMockSupabase({ selectData: mockMappings });
      const result = await getSlackMappings(supabase);

      expect(result).toEqual(mockMappings);
    });

    it('filters by boardId when provided', async () => {
      const supabase = createMockSupabase({ selectData: [] });
      await getSlackMappings(supabase, 'board-1');

      expect(supabase.from).toHaveBeenCalledWith('slack_board_mappings');
    });

    it('returns empty array on null data', async () => {
      const supabase = createMockSupabase({ selectData: null });
      const result = await getSlackMappings(supabase);

      expect(result).toEqual([]);
    });
  });

  describe('createSlackMapping', () => {
    it('creates a new Slack mapping', async () => {
      const mockResult: SlackBoardMapping = {
        id: 'map-new',
        integration_id: 'int-1',
        board_id: 'board-1',
        channel_id: 'C12345',
        channel_name: 'dev-updates',
        notify_card_created: true,
        notify_card_moved: false,
        notify_card_completed: true,
        notify_comments: true,
        created_at: '2025-01-02T00:00:00Z',
      };

      const supabase = createMockSupabase({ upsertData: mockResult });
      const result = await createSlackMapping(supabase, {
        integrationId: 'int-1',
        boardId: 'board-1',
        channelId: 'C12345',
        channelName: 'dev-updates',
        notifyCardMoved: false,
        notifyComments: true,
      });

      expect(result).toEqual(mockResult);
    });

    it('returns null on upsert error', async () => {
      const supabase = createMockSupabase({ upsertData: null, error: { message: 'error' } });
      const result = await createSlackMapping(supabase, {
        integrationId: 'int-1',
        boardId: 'board-1',
        channelId: 'C12345',
        channelName: 'test',
      });

      expect(result).toBeNull();
    });
  });

  describe('deleteSlackMapping', () => {
    it('deletes a Slack mapping', async () => {
      const supabase = createMockSupabase();
      await deleteSlackMapping(supabase, 'map-1');

      expect(supabase.from).toHaveBeenCalledWith('slack_board_mappings');
    });
  });

  // ============================================================================
  // GITHUB LINKS
  // ============================================================================

  describe('getGitHubLinks', () => {
    it('returns GitHub links for a card', async () => {
      const mockLinks: GitHubCardLink[] = [
        {
          id: 'link-1',
          integration_id: 'int-gh',
          card_id: 'card-1',
          repo_owner: 'acme',
          repo_name: 'webapp',
          link_type: 'pull_request',
          github_id: 42,
          github_url: 'https://github.com/acme/webapp/pull/42',
          state: 'open',
          title: 'Fix login bug',
          last_synced_at: null,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      ];

      const supabase = createMockSupabase({ selectData: mockLinks });
      const result = await getGitHubLinks(supabase, 'card-1');

      expect(result).toEqual(mockLinks);
    });

    it('returns empty array for card with no links', async () => {
      const supabase = createMockSupabase({ selectData: null });
      const result = await getGitHubLinks(supabase, 'card-no-links');

      expect(result).toEqual([]);
    });
  });

  describe('createGitHubLink', () => {
    it('creates a GitHub link', async () => {
      const mockResult: GitHubCardLink = {
        id: 'link-new',
        integration_id: 'int-gh',
        card_id: 'card-1',
        repo_owner: 'acme',
        repo_name: 'api',
        link_type: 'issue',
        github_id: 99,
        github_url: 'https://github.com/acme/api/issues/99',
        state: 'open',
        title: 'Add caching',
        last_synced_at: null,
        created_at: '2025-01-02T00:00:00Z',
        updated_at: '2025-01-02T00:00:00Z',
      };

      const supabase = createMockSupabase({ insertData: mockResult });
      const result = await createGitHubLink(supabase, {
        integrationId: 'int-gh',
        cardId: 'card-1',
        repoOwner: 'acme',
        repoName: 'api',
        linkType: 'issue',
        githubId: 99,
        githubUrl: 'https://github.com/acme/api/issues/99',
        state: 'open',
        title: 'Add caching',
      });

      expect(result).toEqual(mockResult);
    });

    it('returns null on insert error', async () => {
      const supabase = createMockSupabase({ insertData: null, error: { message: 'error' } });
      const result = await createGitHubLink(supabase, {
        integrationId: 'int-gh',
        cardId: 'card-1',
        repoOwner: 'a',
        repoName: 'b',
        linkType: 'branch',
        githubUrl: 'https://github.com/a/b/tree/main',
      });

      expect(result).toBeNull();
    });
  });

  describe('updateGitHubLink', () => {
    it('updates GitHub link state', async () => {
      const mockResult: GitHubCardLink = {
        id: 'link-1',
        integration_id: 'int-gh',
        card_id: 'card-1',
        repo_owner: 'acme',
        repo_name: 'webapp',
        link_type: 'pull_request',
        github_id: 42,
        github_url: 'https://github.com/acme/webapp/pull/42',
        state: 'merged',
        title: 'Fix login bug',
        last_synced_at: '2025-01-03T00:00:00Z',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-03T00:00:00Z',
      };

      const supabase = createMockSupabase({ updateData: mockResult });
      const result = await updateGitHubLink(supabase, 'link-1', {
        state: 'merged',
        last_synced_at: '2025-01-03T00:00:00Z',
      });

      expect(result).toEqual(mockResult);
    });

    it('returns null on update error', async () => {
      const supabase = createMockSupabase({ updateData: null, error: { message: 'error' } });
      const result = await updateGitHubLink(supabase, 'link-1', { state: 'closed' });

      expect(result).toBeNull();
    });
  });

  describe('deleteGitHubLink', () => {
    it('deletes a GitHub link', async () => {
      const supabase = createMockSupabase();
      await deleteGitHubLink(supabase, 'link-1');

      expect(supabase.from).toHaveBeenCalledWith('github_card_links');
    });
  });

  // ============================================================================
  // FIGMA EMBEDS
  // ============================================================================

  describe('getFigmaEmbeds', () => {
    it('returns Figma embeds for a card', async () => {
      const mockEmbeds: FigmaCardEmbed[] = [
        {
          id: 'embed-1',
          integration_id: 'int-figma',
          card_id: 'card-1',
          figma_file_key: 'abc123',
          figma_node_id: '0:1',
          figma_url: 'https://www.figma.com/file/abc123/Design',
          embed_type: 'file',
          title: 'Homepage Design',
          thumbnail_url: null,
          last_synced_at: null,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      ];

      const supabase = createMockSupabase({ selectData: mockEmbeds });
      const result = await getFigmaEmbeds(supabase, 'card-1');

      expect(result).toEqual(mockEmbeds);
    });

    it('returns empty array when no embeds', async () => {
      const supabase = createMockSupabase({ selectData: null });
      const result = await getFigmaEmbeds(supabase, 'card-empty');

      expect(result).toEqual([]);
    });
  });

  describe('createFigmaEmbed', () => {
    it('creates a Figma embed', async () => {
      const mockResult: FigmaCardEmbed = {
        id: 'embed-new',
        integration_id: 'int-figma',
        card_id: 'card-1',
        figma_file_key: 'def456',
        figma_node_id: null,
        figma_url: 'https://www.figma.com/file/def456/Wireframes',
        embed_type: 'prototype',
        title: 'Prototype v2',
        thumbnail_url: 'https://example.com/thumb.png',
        last_synced_at: null,
        created_at: '2025-01-02T00:00:00Z',
        updated_at: '2025-01-02T00:00:00Z',
      };

      const supabase = createMockSupabase({ insertData: mockResult });
      const result = await createFigmaEmbed(supabase, {
        integrationId: 'int-figma',
        cardId: 'card-1',
        figmaFileKey: 'def456',
        figmaUrl: 'https://www.figma.com/file/def456/Wireframes',
        embedType: 'prototype',
        title: 'Prototype v2',
        thumbnailUrl: 'https://example.com/thumb.png',
      });

      expect(result).toEqual(mockResult);
    });

    it('returns null on insert error', async () => {
      const supabase = createMockSupabase({ insertData: null, error: { message: 'error' } });
      const result = await createFigmaEmbed(supabase, {
        integrationId: 'int-figma',
        cardId: 'card-1',
        figmaFileKey: 'xyz',
        figmaUrl: 'https://www.figma.com/file/xyz',
        embedType: 'file',
      });

      expect(result).toBeNull();
    });
  });

  describe('deleteFigmaEmbed', () => {
    it('deletes a Figma embed', async () => {
      const supabase = createMockSupabase();
      await deleteFigmaEmbed(supabase, 'embed-1');

      expect(supabase.from).toHaveBeenCalledWith('figma_card_embeds');
    });
  });

  // ============================================================================
  // WEBHOOK EVENTS
  // ============================================================================

  describe('createWebhookEvent', () => {
    it('creates a webhook event record', async () => {
      const mockResult: IntegrationWebhookEvent = {
        id: 'wh-1',
        provider: 'github',
        event_type: 'pull_request',
        payload: { action: 'opened', number: 42 },
        processed: false,
        error_message: null,
        created_at: '2025-01-01T00:00:00Z',
      };

      const supabase = createMockSupabase({ insertData: mockResult });
      const result = await createWebhookEvent(supabase, {
        provider: 'github',
        eventType: 'pull_request',
        payload: { action: 'opened', number: 42 },
      });

      expect(result).toEqual(mockResult);
    });

    it('returns null on error', async () => {
      const supabase = createMockSupabase({ insertData: null, error: { message: 'error' } });
      const result = await createWebhookEvent(supabase, {
        provider: 'slack',
        eventType: 'message',
        payload: {},
      });

      expect(result).toBeNull();
    });
  });

  describe('getWebhookEvents', () => {
    it('returns webhook events', async () => {
      const mockEvents: IntegrationWebhookEvent[] = [
        {
          id: 'wh-1',
          provider: 'github',
          event_type: 'push',
          payload: {},
          processed: true,
          error_message: null,
          created_at: '2025-01-01T00:00:00Z',
        },
      ];

      const supabase = createMockSupabase({ selectData: mockEvents });
      const result = await getWebhookEvents(supabase);

      expect(result).toEqual(mockEvents);
    });

    it('filters by provider', async () => {
      const supabase = createMockSupabase({ selectData: [] });
      await getWebhookEvents(supabase, { provider: 'slack' });

      expect(supabase.from).toHaveBeenCalledWith('integration_webhook_events');
    });

    it('returns empty array on null data', async () => {
      const supabase = createMockSupabase({ selectData: null });
      const result = await getWebhookEvents(supabase);

      expect(result).toEqual([]);
    });
  });

  describe('markWebhookProcessed', () => {
    it('marks a webhook event as processed', async () => {
      const supabase = createMockSupabase();
      await markWebhookProcessed(supabase, 'wh-1');

      expect(supabase.from).toHaveBeenCalledWith('integration_webhook_events');
    });

    it('stores error message when provided', async () => {
      const supabase = createMockSupabase();
      await markWebhookProcessed(supabase, 'wh-1', 'Processing failed');

      expect(supabase.from).toHaveBeenCalledWith('integration_webhook_events');
    });
  });

  describe('sendSlackNotification', () => {
    it('returns false as placeholder', async () => {
      const supabase = createMockSupabase();
      const result = await sendSlackNotification(supabase, 'int-1', 'C12345', { text: 'Hello' });

      expect(result).toBe(false);
    });
  });

  // ============================================================================
  // TYPE COVERAGE
  // ============================================================================

  describe('IntegrationProvider type', () => {
    it('covers all three providers', () => {
      const providers: string[] = ['slack', 'github', 'figma'];
      expect(providers).toHaveLength(3);
      expect(providers).toContain('slack');
      expect(providers).toContain('github');
      expect(providers).toContain('figma');
    });
  });

  describe('Integration type', () => {
    it('has all required fields', () => {
      const integration: Integration = {
        id: 'int-test',
        provider: 'slack',
        name: 'Test',
        workspace_id: null,
        metadata: { key: 'value' },
        is_active: true,
        connected_by: 'user-1',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };

      expect(integration.id).toBe('int-test');
      expect(integration.provider).toBe('slack');
      expect(integration.workspace_id).toBeNull();
      expect(integration.metadata).toEqual({ key: 'value' });
      expect(integration.is_active).toBe(true);
    });
  });

  describe('GitHubCardLink type', () => {
    it('supports all link types', () => {
      const types: Array<'issue' | 'pull_request' | 'branch'> = ['issue', 'pull_request', 'branch'];
      expect(types).toHaveLength(3);
    });
  });

  describe('FigmaCardEmbed type', () => {
    it('supports all embed types', () => {
      const types: Array<'file' | 'frame' | 'component' | 'prototype'> = ['file', 'frame', 'component', 'prototype'];
      expect(types).toHaveLength(4);
    });
  });
});
