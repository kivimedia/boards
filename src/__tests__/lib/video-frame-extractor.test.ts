import { describe, it, expect } from 'vitest';
import {
  generateTimestamps,
  extractFramesFromVideo,
} from '@/lib/ai/video-frame-extractor';
import type { ExtractedFrame } from '@/lib/ai/video-frame-extractor';

describe('video-frame-extractor', () => {
  // =========================================================================
  // Exports verification
  // =========================================================================

  describe('exports', () => {
    it('exports generateTimestamps as a function', () => {
      expect(typeof generateTimestamps).toBe('function');
    });

    it('exports extractFramesFromVideo as a function', () => {
      expect(typeof extractFramesFromVideo).toBe('function');
    });
  });

  // =========================================================================
  // ExtractedFrame interface shape
  // =========================================================================

  describe('ExtractedFrame interface shape', () => {
    it('has timestamp, buffer, and storagePath fields', () => {
      const frame: ExtractedFrame = {
        timestamp: 10,
        buffer: Buffer.from('test'),
        storagePath: 'video-frames/card-1/10s.png',
      };

      expect(frame).toHaveProperty('timestamp');
      expect(frame).toHaveProperty('buffer');
      expect(frame).toHaveProperty('storagePath');
      expect(typeof frame.timestamp).toBe('number');
      expect(Buffer.isBuffer(frame.buffer)).toBe(true);
      expect(typeof frame.storagePath).toBe('string');
    });
  });

  // =========================================================================
  // generateTimestamps — pure function tests
  // =========================================================================

  describe('generateTimestamps', () => {
    it('generates default 5s interval with 10 frames: [0,5,10,...,45]', () => {
      const result = generateTimestamps(5, 10);
      expect(result).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45]);
    });

    it('returns [0] when maxFrames is 1', () => {
      const result = generateTimestamps(5, 1);
      expect(result).toEqual([0]);
    });

    it('returns empty array when maxFrames is 0', () => {
      const result = generateTimestamps(5, 0);
      expect(result).toEqual([]);
    });

    it('uses custom interval (e.g., 10s with 4 frames)', () => {
      const result = generateTimestamps(10, 4);
      expect(result).toEqual([0, 10, 20, 30]);
    });

    it('uses 1-second interval correctly', () => {
      const result = generateTimestamps(1, 5);
      expect(result).toEqual([0, 1, 2, 3, 4]);
    });

    it('returns correct length matching maxFrames', () => {
      const result = generateTimestamps(3, 7);
      expect(result).toHaveLength(7);
    });

    it('always starts at timestamp 0', () => {
      const result = generateTimestamps(15, 3);
      expect(result[0]).toBe(0);
    });
  });
});
