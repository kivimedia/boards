import { describe, it, expect } from 'vitest';
import {
  buildApiUrl,
  buildHeaders,
  verifyWebhookChallenge,
  validateMedia,
  MEDIA_SIZE_LIMITS,
} from '@/lib/integrations/whatsapp-business-api';

// ============================================================================
// buildApiUrl
// ============================================================================

describe('buildApiUrl', () => {
  it('builds correct API URL', () => {
    const url = buildApiUrl('123456789', 'messages');
    expect(url).toBe('https://graph.facebook.com/v21.0/123456789/messages');
  });

  it('handles different paths', () => {
    const url = buildApiUrl('123456789', 'media');
    expect(url).toBe('https://graph.facebook.com/v21.0/123456789/media');
  });
});

// ============================================================================
// buildHeaders
// ============================================================================

describe('buildHeaders', () => {
  it('includes Bearer authorization', () => {
    const headers = buildHeaders('test-token');
    expect(headers.Authorization).toBe('Bearer test-token');
  });

  it('includes JSON content type', () => {
    const headers = buildHeaders('test-token');
    expect(headers['Content-Type']).toBe('application/json');
  });
});

// ============================================================================
// verifyWebhookChallenge
// ============================================================================

describe('verifyWebhookChallenge', () => {
  const expectedToken = 'my-verify-token';

  it('validates correct challenge', () => {
    const result = verifyWebhookChallenge('subscribe', expectedToken, 'challenge-123', expectedToken);
    expect(result.valid).toBe(true);
    expect(result.challenge).toBe('challenge-123');
  });

  it('rejects wrong mode', () => {
    const result = verifyWebhookChallenge('unsubscribe', expectedToken, 'challenge-123', expectedToken);
    expect(result.valid).toBe(false);
    expect(result.challenge).toBeNull();
  });

  it('rejects wrong token', () => {
    const result = verifyWebhookChallenge('subscribe', 'wrong-token', 'challenge-123', expectedToken);
    expect(result.valid).toBe(false);
  });

  it('rejects null mode', () => {
    const result = verifyWebhookChallenge(null, expectedToken, 'challenge-123', expectedToken);
    expect(result.valid).toBe(false);
  });

  it('rejects null token', () => {
    const result = verifyWebhookChallenge('subscribe', null, 'challenge-123', expectedToken);
    expect(result.valid).toBe(false);
  });
});

// ============================================================================
// validateMedia
// ============================================================================

describe('validateMedia', () => {
  it('accepts valid image', () => {
    const result = validateMedia(1024 * 1024, 'image/jpeg', 'image');
    expect(result.valid).toBe(true);
    expect(result.error).toBeNull();
  });

  it('rejects oversized image', () => {
    const result = validateMedia(10 * 1024 * 1024, 'image/jpeg', 'image'); // 10MB > 5MB limit
    expect(result.valid).toBe(false);
    expect(result.error).toContain('exceeds');
  });

  it('accepts valid video', () => {
    const result = validateMedia(10 * 1024 * 1024, 'video/mp4', 'video');
    expect(result.valid).toBe(true);
  });

  it('rejects oversized video', () => {
    const result = validateMedia(20 * 1024 * 1024, 'video/mp4', 'video'); // 20MB > 16MB limit
    expect(result.valid).toBe(false);
  });

  it('accepts valid document', () => {
    const result = validateMedia(50 * 1024 * 1024, 'application/pdf', 'document');
    expect(result.valid).toBe(true);
  });

  it('rejects invalid MIME type for image', () => {
    const result = validateMedia(1024, 'application/pdf', 'image');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not supported');
  });

  it('rejects invalid MIME type for video', () => {
    const result = validateMedia(1024, 'image/jpeg', 'video');
    expect(result.valid).toBe(false);
  });

  it('accepts audio types', () => {
    const result = validateMedia(1024 * 1024, 'audio/mpeg', 'audio');
    expect(result.valid).toBe(true);
  });
});

// ============================================================================
// MEDIA_SIZE_LIMITS
// ============================================================================

describe('MEDIA_SIZE_LIMITS', () => {
  it('has correct image limit (5MB)', () => {
    expect(MEDIA_SIZE_LIMITS.image).toBe(5 * 1024 * 1024);
  });

  it('has correct video limit (16MB)', () => {
    expect(MEDIA_SIZE_LIMITS.video).toBe(16 * 1024 * 1024);
  });

  it('has correct document limit (100MB)', () => {
    expect(MEDIA_SIZE_LIMITS.document).toBe(100 * 1024 * 1024);
  });

  it('has correct audio limit (16MB)', () => {
    expect(MEDIA_SIZE_LIMITS.audio).toBe(16 * 1024 * 1024);
  });
});
