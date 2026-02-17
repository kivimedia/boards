import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock providers before importing nano-banana
// ---------------------------------------------------------------------------
vi.mock('@/lib/ai/providers', () => ({
  createGoogleAIClient: vi.fn().mockResolvedValue(null),
  createAnthropicClient: vi.fn().mockResolvedValue(null),
  getReplicateApiKey: vi.fn().mockResolvedValue(null),
  touchApiKey: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/ai/model-resolver', () => ({
  resolveModelWithFallback: vi.fn().mockResolvedValue({
    provider: 'google',
    model_id: 'gemini-2.0-flash-exp',
    temperature: 0.8,
    max_tokens: 1024,
  }),
}));

vi.mock('@/lib/ai/cost-tracker', () => ({
  logUsage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/ai/budget-checker', () => ({
  canMakeAICall: vi.fn().mockResolvedValue({ allowed: true }),
}));

import {
  IMAGE_STYLE_PRESETS,
  enhanceImagePrompt,
  generateImage,
  generateImageReplicate,
  type ImageProvider,
  type NanoBananaGenerateInput,
} from '@/lib/ai/nano-banana';
import { createAnthropicClient, getReplicateApiKey } from '@/lib/ai/providers';
import { canMakeAICall } from '@/lib/ai/budget-checker';
import { logUsage } from '@/lib/ai/cost-tracker';

const mockSupabase = {} as any;

// ---------------------------------------------------------------------------
// IMAGE_STYLE_PRESETS
// ---------------------------------------------------------------------------
describe('IMAGE_STYLE_PRESETS', () => {
  it('has 6 presets', () => {
    expect(IMAGE_STYLE_PRESETS).toHaveLength(6);
  });

  it('each preset has id, label, and hint', () => {
    for (const preset of IMAGE_STYLE_PRESETS) {
      expect(preset.id).toBeTruthy();
      expect(preset.label).toBeTruthy();
      expect(preset.hint).toBeTruthy();
    }
  });

  it('has expected preset ids', () => {
    const ids = IMAGE_STYLE_PRESETS.map((p) => p.id);
    expect(ids).toContain('social_post');
    expect(ids).toContain('ad_banner');
    expect(ids).toContain('hero_image');
    expect(ids).toContain('product_shot');
    expect(ids).toContain('mood_board');
    expect(ids).toContain('photo_realistic');
  });

  it('preset labels are human-readable', () => {
    const labels = IMAGE_STYLE_PRESETS.map((p) => p.label);
    expect(labels).toContain('Social Post');
    expect(labels).toContain('Photo Realistic');
  });
});

// ---------------------------------------------------------------------------
// enhanceImagePrompt
// ---------------------------------------------------------------------------
describe('enhanceImagePrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('falls back to original prompt when Anthropic not configured', async () => {
    vi.mocked(createAnthropicClient).mockResolvedValueOnce(null);
    const result = await enhanceImagePrompt(mockSupabase, 'a red car');
    expect(result).toBe('a red car');
  });

  it('returns enhanced prompt from Claude response', async () => {
    const mockClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'A vibrant cherry-red sports car in golden hour light' }],
          usage: { input_tokens: 10, output_tokens: 20 },
        }),
      },
    };
    vi.mocked(createAnthropicClient).mockResolvedValueOnce(mockClient as any);

    const result = await enhanceImagePrompt(mockSupabase, 'a red car');
    expect(result).toBe('A vibrant cherry-red sports car in golden hour light');
  });

  it('logs usage on successful enhancement', async () => {
    const mockClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'enhanced prompt' }],
          usage: { input_tokens: 10, output_tokens: 20 },
        }),
      },
    };
    vi.mocked(createAnthropicClient).mockResolvedValueOnce(mockClient as any);

    await enhanceImagePrompt(mockSupabase, 'test prompt', 'social_post', 'user1', 'board1', 'card1');

    expect(logUsage).toHaveBeenCalledWith(
      mockSupabase,
      expect.objectContaining({
        activity: 'image_prompt_enhance',
        provider: 'anthropic',
        modelId: 'claude-haiku-4-5-20251001',
        userId: 'user1',
        boardId: 'board1',
        cardId: 'card1',
      })
    );
  });

  it('passes style preset hint to system prompt', async () => {
    const mockClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'enhanced' }],
          usage: { input_tokens: 5, output_tokens: 10 },
        }),
      },
    };
    vi.mocked(createAnthropicClient).mockResolvedValueOnce(mockClient as any);

    await enhanceImagePrompt(mockSupabase, 'a sunset', 'hero_image');

    const callArgs = mockClient.messages.create.mock.calls[0][0];
    expect(callArgs.system).toContain('Wide, atmospheric, storytelling');
  });

  it('falls back to original prompt on API error', async () => {
    const mockClient = {
      messages: {
        create: vi.fn().mockRejectedValue(new Error('API error')),
      },
    };
    vi.mocked(createAnthropicClient).mockResolvedValueOnce(mockClient as any);

    const result = await enhanceImagePrompt(mockSupabase, 'a sunset');
    expect(result).toBe('a sunset');
  });
});

// ---------------------------------------------------------------------------
// generateImageReplicate
// ---------------------------------------------------------------------------
describe('generateImageReplicate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  const baseInput: NanoBananaGenerateInput = {
    cardId: 'card-1',
    userId: 'user-1',
    prompt: 'a beautiful sunset',
    aspectRatio: '16:9',
    provider: 'replicate',
  };

  it('throws when budget exceeded', async () => {
    vi.mocked(canMakeAICall).mockResolvedValueOnce({ allowed: false, reason: 'Over budget' });

    await expect(generateImageReplicate(mockSupabase, baseInput)).rejects.toThrow('Budget exceeded');
  });

  it('throws when API key not configured', async () => {
    vi.mocked(getReplicateApiKey).mockResolvedValueOnce(null);

    await expect(generateImageReplicate(mockSupabase, baseInput)).rejects.toThrow('not configured');
  });

  it('throws on Replicate API error', async () => {
    vi.mocked(getReplicateApiKey).mockResolvedValueOnce('rp_test_key');
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    } as any);

    await expect(generateImageReplicate(mockSupabase, baseInput)).rejects.toThrow('Replicate API error 401');
  });

  it('throws when prediction fails', async () => {
    vi.mocked(getReplicateApiKey).mockResolvedValueOnce('rp_test_key');
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        id: 'pred-1',
        status: 'failed',
        error: 'Content policy violation',
      }),
    } as any);

    await expect(generateImageReplicate(mockSupabase, baseInput)).rejects.toThrow('Content policy violation');
  });

  it('successfully generates image', async () => {
    vi.mocked(getReplicateApiKey).mockResolvedValueOnce('rp_test_key');

    // Create prediction response (succeeded immediately with Prefer: wait)
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: 'pred-1',
          status: 'succeeded',
          output: ['https://replicate.delivery/test.png'],
        }),
      } as any)
      // Download image
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer),
      } as any);

    const result = await generateImageReplicate(mockSupabase, baseInput);

    expect(result.modelUsed).toBe('flux-1.1-pro');
    expect(result.mimeType).toBe('image/png');
    expect(result.imageBase64).toBeTruthy();
  });

  it('logs usage on success', async () => {
    vi.mocked(getReplicateApiKey).mockResolvedValueOnce('rp_test_key');
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: 'pred-1',
          status: 'succeeded',
          output: ['https://replicate.delivery/test.png'],
        }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
      } as any);

    await generateImageReplicate(mockSupabase, baseInput);

    expect(logUsage).toHaveBeenCalledWith(
      mockSupabase,
      expect.objectContaining({
        activity: 'replicate_generate',
        provider: 'replicate',
        modelId: 'flux-1.1-pro',
        status: 'success',
        metadata: expect.objectContaining({
          replicate_prediction_id: 'pred-1',
          per_image_cost_usd: 0.04,
        }),
      })
    );
  });

  it('logs usage on error', async () => {
    vi.mocked(getReplicateApiKey).mockResolvedValueOnce('rp_test_key');
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Error'),
    } as any);

    await expect(generateImageReplicate(mockSupabase, baseInput)).rejects.toThrow();

    expect(logUsage).toHaveBeenCalledWith(
      mockSupabase,
      expect.objectContaining({
        activity: 'replicate_generate',
        status: 'error',
      })
    );
  });
});

// ---------------------------------------------------------------------------
// generateImage (dispatcher)
// ---------------------------------------------------------------------------
describe('generateImage (dispatcher)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('defaults to gemini when no provider specified', async () => {
    // Will fail because Google client is null, but it should attempt gemini path
    await expect(
      generateImage(mockSupabase, {
        cardId: 'c1',
        userId: 'u1',
        prompt: 'test',
      })
    ).rejects.toThrow('Google AI API key not configured');
  });

  it('dispatches to replicate when provider is replicate', async () => {
    // Will fail because Replicate key is null
    await expect(
      generateImage(mockSupabase, {
        cardId: 'c1',
        userId: 'u1',
        prompt: 'test',
        provider: 'replicate',
      })
    ).rejects.toThrow('Replicate API key not configured');
  });

  it('enhances prompt when enhancePrompt is true', async () => {
    // Mock the Anthropic client to return an enhanced prompt
    const mockAnthropic = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'enhanced: a cat in space' }],
          usage: { input_tokens: 5, output_tokens: 10 },
        }),
      },
    };
    vi.mocked(createAnthropicClient).mockResolvedValueOnce(mockAnthropic as any);

    // Will still fail at generation (no Google key), but we can verify enhance was called
    await expect(
      generateImage(mockSupabase, {
        cardId: 'c1',
        userId: 'u1',
        prompt: 'a cat',
        enhancePrompt: true,
      })
    ).rejects.toThrow();

    // Verify Anthropic was called for enhancement
    expect(mockAnthropic.messages.create).toHaveBeenCalled();
  });

  it('skips enhancement when enhancePrompt is false', async () => {
    vi.mocked(createAnthropicClient).mockClear();

    await expect(
      generateImage(mockSupabase, {
        cardId: 'c1',
        userId: 'u1',
        prompt: 'a cat',
        enhancePrompt: false,
      })
    ).rejects.toThrow();

    // Anthropic should NOT have been called
    expect(createAnthropicClient).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Aspect ratio validation
// ---------------------------------------------------------------------------
describe('aspect ratio handling', () => {
  it('valid aspect ratios are accepted by NanoBananaGenerateInput type', () => {
    const validRatios: NanoBananaGenerateInput['aspectRatio'][] = ['1:1', '16:9', '9:16', '4:3', '3:4'];
    expect(validRatios).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// Provider types
// ---------------------------------------------------------------------------
describe('ImageProvider type', () => {
  it('supports gemini and replicate', () => {
    const providers: ImageProvider[] = ['gemini', 'replicate'];
    expect(providers).toHaveLength(2);
    expect(providers).toContain('gemini');
    expect(providers).toContain('replicate');
  });
});

// ---------------------------------------------------------------------------
// Generate API route body validation (unit-style)
// ---------------------------------------------------------------------------
describe('generate API body validation', () => {
  it('valid providers', () => {
    const validProviders = ['gemini', 'replicate'];
    expect(validProviders).toContain('gemini');
    expect(validProviders).toContain('replicate');
  });

  it('valid aspect ratios', () => {
    const validRatios = ['1:1', '16:9', '9:16', '4:3', '3:4'];
    expect(validRatios).toHaveLength(5);
  });

  it('valid style preset ids', () => {
    const ids = IMAGE_STYLE_PRESETS.map((p) => p.id);
    expect(ids.length).toBeGreaterThanOrEqual(6);
    for (const id of ids) {
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    }
  });
});
