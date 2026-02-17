import { describe, it, expect, beforeEach } from 'vitest';
import {
  getCachedSignedUrl,
  setCachedSignedUrl,
  signedUrlCache,
  SIGNED_URL_TTL_MS,
} from '@/lib/board-data';

/**
 * Board Data signed URL cache tests (P8.2 Performance Optimization).
 *
 * Tests the in-memory cache used to avoid re-signing Supabase Storage URLs
 * on every board load. Cache has a 50-minute TTL.
 */

describe('Board Data - Signed URL Cache (P8.2)', () => {
  beforeEach(() => {
    signedUrlCache.clear();
  });

  describe('module exports', () => {
    it('signedUrlCache is a Map', () => {
      expect(signedUrlCache).toBeInstanceOf(Map);
    });

    it('SIGNED_URL_TTL_MS is 50 minutes in milliseconds', () => {
      expect(SIGNED_URL_TTL_MS).toBe(50 * 60 * 1000);
    });

    it('getCachedSignedUrl is a function', () => {
      expect(typeof getCachedSignedUrl).toBe('function');
    });

    it('setCachedSignedUrl is a function', () => {
      expect(typeof setCachedSignedUrl).toBe('function');
    });
  });

  describe('getCachedSignedUrl', () => {
    it('returns null for a path not in cache (cache miss)', () => {
      expect(getCachedSignedUrl('covers/abc.jpg')).toBeNull();
    });

    it('returns the URL for a non-expired cached entry (cache hit)', () => {
      setCachedSignedUrl('covers/abc.jpg', 'https://signed.example.com/abc');
      expect(getCachedSignedUrl('covers/abc.jpg')).toBe('https://signed.example.com/abc');
    });

    it('returns null and deletes entry when expired', () => {
      setCachedSignedUrl('covers/old.jpg', 'https://signed.example.com/old');
      // Manually expire the entry
      const entry = signedUrlCache.get('covers/old.jpg')!;
      entry.expiresAt = Date.now() - 1;
      signedUrlCache.set('covers/old.jpg', entry);

      expect(getCachedSignedUrl('covers/old.jpg')).toBeNull();
      expect(signedUrlCache.has('covers/old.jpg')).toBe(false);
    });

    it('returns null for entries not yet set (does not crash)', () => {
      expect(getCachedSignedUrl('nonexistent/path.png')).toBeNull();
    });
  });

  describe('setCachedSignedUrl', () => {
    it('stores entry in the cache map', () => {
      setCachedSignedUrl('covers/new.jpg', 'https://signed.example.com/new');
      expect(signedUrlCache.has('covers/new.jpg')).toBe(true);
    });

    it('stored entry has URL and expiresAt fields', () => {
      const before = Date.now();
      setCachedSignedUrl('covers/test.jpg', 'https://signed.example.com/test');
      const after = Date.now();

      const entry = signedUrlCache.get('covers/test.jpg')!;
      expect(entry.url).toBe('https://signed.example.com/test');
      expect(entry.expiresAt).toBeGreaterThanOrEqual(before + SIGNED_URL_TTL_MS);
      expect(entry.expiresAt).toBeLessThanOrEqual(after + SIGNED_URL_TTL_MS);
    });

    it('overwrites existing entry for the same path', () => {
      setCachedSignedUrl('covers/x.jpg', 'https://old.com');
      setCachedSignedUrl('covers/x.jpg', 'https://new.com');
      expect(getCachedSignedUrl('covers/x.jpg')).toBe('https://new.com');
      expect(signedUrlCache.size).toBe(1);
    });

    it('stores multiple independent paths', () => {
      setCachedSignedUrl('covers/a.jpg', 'https://a.com');
      setCachedSignedUrl('covers/b.jpg', 'https://b.com');
      expect(signedUrlCache.size).toBe(2);
      expect(getCachedSignedUrl('covers/a.jpg')).toBe('https://a.com');
      expect(getCachedSignedUrl('covers/b.jpg')).toBe('https://b.com');
    });
  });

  describe('cache round-trip', () => {
    it('set then get returns the URL within TTL', () => {
      setCachedSignedUrl('covers/round.jpg', 'https://round.com');
      const result = getCachedSignedUrl('covers/round.jpg');
      expect(result).toBe('https://round.com');
    });

    it('simulated expiry returns null', () => {
      setCachedSignedUrl('covers/expire.jpg', 'https://expire.com');
      // Simulate passage of time beyond TTL
      const entry = signedUrlCache.get('covers/expire.jpg')!;
      entry.expiresAt = Date.now() - 1000;
      signedUrlCache.set('covers/expire.jpg', entry);

      expect(getCachedSignedUrl('covers/expire.jpg')).toBeNull();
    });

    it('clear() removes all entries', () => {
      setCachedSignedUrl('covers/1.jpg', 'https://1.com');
      setCachedSignedUrl('covers/2.jpg', 'https://2.com');
      signedUrlCache.clear();
      expect(signedUrlCache.size).toBe(0);
      expect(getCachedSignedUrl('covers/1.jpg')).toBeNull();
    });
  });
});
