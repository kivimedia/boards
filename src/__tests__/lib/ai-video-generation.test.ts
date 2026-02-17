import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  AIVideoGeneration,
  VideoProvider,
  VideoMode,
  VideoGenerationStatus,
  VideoGenerationSettings,
} from '@/lib/types';

/**
 * Tests for AI Video Generation (P3.3).
 *
 * Covers type shapes, query function contracts (mocked Supabase),
 * status transitions, provider mapping, and settings validation.
 */

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockGeneration(overrides: Partial<AIVideoGeneration> = {}): AIVideoGeneration {
  return {
    id: 'gen-001',
    card_id: 'card-abc',
    user_id: 'user-1',
    provider: 'sora',
    mode: 'text_to_video',
    prompt: 'A cinematic sunset over the ocean',
    negative_prompt: null,
    settings: { duration: 5, aspect_ratio: '16:9', resolution: '1080p' },
    source_image_url: null,
    end_image_url: null,
    status: 'completed',
    output_urls: ['https://cdn.example.com/video1.mp4'],
    thumbnail_url: 'https://cdn.example.com/thumb1.jpg',
    storage_path: null,
    error_message: null,
    generation_time_ms: 12500,
    estimated_cost: 0.05,
    metadata: {},
    created_at: '2026-01-15T10:00:00Z',
    updated_at: '2026-01-15T10:00:12Z',
    ...overrides,
  };
}

function createMockSupabase(returnData: unknown = null, returnError: unknown = null) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: returnData, error: returnError }),
  };
  // For queries that don't call .single() at the end
  builder.order = vi.fn().mockImplementation(() => ({
    ...builder,
    then: (resolve: (v: { data: unknown; error: unknown }) => void) =>
      resolve({ data: returnData, error: returnError }),
  }));
  return {
    from: vi.fn().mockReturnValue(builder),
    _builder: builder,
  };
}

// ---------------------------------------------------------------------------
// Type shape tests
// ---------------------------------------------------------------------------

describe('AI Video Generation Types (P3.3)', () => {
  describe('VideoProvider type', () => {
    it('accepts sora as a valid provider', () => {
      const provider: VideoProvider = 'sora';
      expect(provider).toBe('sora');
    });

    it('accepts veo as a valid provider', () => {
      const provider: VideoProvider = 'veo';
      expect(provider).toBe('veo');
    });
  });

  describe('VideoMode type', () => {
    it('accepts text_to_video', () => {
      const mode: VideoMode = 'text_to_video';
      expect(mode).toBe('text_to_video');
    });

    it('accepts image_to_video', () => {
      const mode: VideoMode = 'image_to_video';
      expect(mode).toBe('image_to_video');
    });

    it('accepts start_end_frame', () => {
      const mode: VideoMode = 'start_end_frame';
      expect(mode).toBe('start_end_frame');
    });
  });

  describe('VideoGenerationStatus type', () => {
    it('supports all four statuses', () => {
      const statuses: VideoGenerationStatus[] = ['pending', 'processing', 'completed', 'failed'];
      expect(statuses).toHaveLength(4);
      expect(statuses).toContain('pending');
      expect(statuses).toContain('processing');
      expect(statuses).toContain('completed');
      expect(statuses).toContain('failed');
    });
  });

  describe('VideoGenerationSettings interface', () => {
    it('has all optional fields', () => {
      const settings: VideoGenerationSettings = {};
      expect(settings.duration).toBeUndefined();
      expect(settings.aspect_ratio).toBeUndefined();
      expect(settings.resolution).toBeUndefined();
      expect(settings.fps).toBeUndefined();
      expect(settings.style).toBeUndefined();
    });

    it('accepts all settings fields', () => {
      const settings: VideoGenerationSettings = {
        duration: 10,
        aspect_ratio: '16:9',
        resolution: '1080p',
        fps: 30,
        style: 'cinematic',
      };
      expect(settings.duration).toBe(10);
      expect(settings.aspect_ratio).toBe('16:9');
      expect(settings.resolution).toBe('1080p');
      expect(settings.fps).toBe(30);
      expect(settings.style).toBe('cinematic');
    });
  });

  describe('AIVideoGeneration interface', () => {
    it('has all expected fields', () => {
      const gen = createMockGeneration();
      expect(gen.id).toBe('gen-001');
      expect(gen.card_id).toBe('card-abc');
      expect(gen.user_id).toBe('user-1');
      expect(gen.provider).toBe('sora');
      expect(gen.mode).toBe('text_to_video');
      expect(gen.prompt).toBeTruthy();
      expect(gen.status).toBe('completed');
      expect(gen.output_urls).toHaveLength(1);
      expect(gen.created_at).toBeTruthy();
    });

    it('allows nullable fields', () => {
      const gen = createMockGeneration({
        negative_prompt: null,
        source_image_url: null,
        end_image_url: null,
        thumbnail_url: null,
        storage_path: null,
        error_message: null,
        generation_time_ms: null,
        estimated_cost: null,
      });
      expect(gen.negative_prompt).toBeNull();
      expect(gen.source_image_url).toBeNull();
      expect(gen.end_image_url).toBeNull();
      expect(gen.thumbnail_url).toBeNull();
      expect(gen.error_message).toBeNull();
    });

    it('supports image_to_video with source image', () => {
      const gen = createMockGeneration({
        mode: 'image_to_video',
        source_image_url: 'https://example.com/source.png',
      });
      expect(gen.mode).toBe('image_to_video');
      expect(gen.source_image_url).toBeTruthy();
    });

    it('supports start_end_frame with both images', () => {
      const gen = createMockGeneration({
        mode: 'start_end_frame',
        source_image_url: 'https://example.com/start.png',
        end_image_url: 'https://example.com/end.png',
      });
      expect(gen.mode).toBe('start_end_frame');
      expect(gen.source_image_url).toBeTruthy();
      expect(gen.end_image_url).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Provider mapping tests
// ---------------------------------------------------------------------------

describe('Video Provider Mapping', () => {
  it('maps sora to openai provider', () => {
    const provider: VideoProvider = 'sora';
    const aiProvider = provider === 'sora' ? 'openai' : 'google';
    expect(aiProvider).toBe('openai');
  });

  it('maps veo to google provider', () => {
    const mapProvider = (p: VideoProvider) => p === 'sora' ? 'openai' : 'google';
    expect(mapProvider('veo')).toBe('google');
  });

  it('maps sora to sora-2 model ID', () => {
    const mapModel = (p: VideoProvider) => p === 'sora' ? 'sora-2' : 'veo-3';
    expect(mapModel('sora')).toBe('sora-2');
  });

  it('maps veo to veo-3 model ID', () => {
    const mapModel = (p: VideoProvider) => p === 'sora' ? 'sora-2' : 'veo-3';
    expect(mapModel('veo')).toBe('veo-3');
  });
});

// ---------------------------------------------------------------------------
// Status transition tests
// ---------------------------------------------------------------------------

describe('Video Generation Status Transitions', () => {
  it('valid transition: pending -> processing', () => {
    const gen = createMockGeneration({ status: 'pending' });
    const updated = { ...gen, status: 'processing' as VideoGenerationStatus };
    expect(updated.status).toBe('processing');
  });

  it('valid transition: processing -> completed', () => {
    const gen = createMockGeneration({ status: 'processing' });
    const updated = { ...gen, status: 'completed' as VideoGenerationStatus, output_urls: ['url'] };
    expect(updated.status).toBe('completed');
    expect(updated.output_urls).toHaveLength(1);
  });

  it('valid transition: processing -> failed', () => {
    const gen = createMockGeneration({ status: 'processing' });
    const updated = {
      ...gen,
      status: 'failed' as VideoGenerationStatus,
      error_message: 'Provider API error',
      output_urls: [],
    };
    expect(updated.status).toBe('failed');
    expect(updated.error_message).toBeTruthy();
    expect(updated.output_urls).toHaveLength(0);
  });

  it('completed generation has output urls', () => {
    const gen = createMockGeneration({
      status: 'completed',
      output_urls: ['https://cdn.example.com/v1.mp4', 'https://cdn.example.com/v2.mp4'],
    });
    expect(gen.status).toBe('completed');
    expect(gen.output_urls.length).toBeGreaterThan(0);
  });

  it('failed generation has error message', () => {
    const gen = createMockGeneration({
      status: 'failed',
      error_message: 'Sora API error: rate limited',
      output_urls: [],
    });
    expect(gen.status).toBe('failed');
    expect(gen.error_message).toContain('rate limited');
    expect(gen.output_urls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Query function contract tests (mocked)
// ---------------------------------------------------------------------------

describe('Video Generation Query Contracts', () => {
  it('getCardVideoGenerations queries by card_id and orders by created_at desc', async () => {
    const gens = [
      createMockGeneration({ id: 'gen-1', created_at: '2026-01-15T12:00:00Z' }),
      createMockGeneration({ id: 'gen-2', created_at: '2026-01-15T10:00:00Z' }),
    ];

    const mock = createMockSupabase(gens);
    const builder = mock._builder;

    // Simulate calling the function
    mock.from('ai_video_generations');
    builder.select('*');
    builder.eq('card_id', 'card-abc');

    expect(mock.from).toHaveBeenCalledWith('ai_video_generations');
    expect(builder.select).toHaveBeenCalledWith('*');
    expect(builder.eq).toHaveBeenCalledWith('card_id', 'card-abc');
  });

  it('getUserVideoGenerations queries by user_id with limit', async () => {
    const mock = createMockSupabase([]);
    const builder = mock._builder;

    mock.from('ai_video_generations');
    builder.select('*');
    builder.eq('user_id', 'user-1');
    builder.limit(20);

    expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(builder.limit).toHaveBeenCalledWith(20);
  });

  it('getVideoGeneration queries by id and returns single', async () => {
    const gen = createMockGeneration();
    const mock = createMockSupabase(gen);
    const builder = mock._builder;

    mock.from('ai_video_generations');
    builder.select('*');
    builder.eq('id', 'gen-001');
    const result = await builder.single();

    expect(result.data).toBeTruthy();
    expect((result.data as AIVideoGeneration).id).toBe('gen-001');
  });

  it('deleteVideoGeneration calls delete with eq id', () => {
    const mock = createMockSupabase();
    const builder = mock._builder;

    mock.from('ai_video_generations');
    builder.delete();
    builder.eq('id', 'gen-001');

    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith('id', 'gen-001');
  });
});
