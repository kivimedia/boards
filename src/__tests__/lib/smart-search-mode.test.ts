import { describe, it, expect } from 'vitest';
import { detectMode } from '@/hooks/useSmartSearch';
import type { SearchMode } from '@/hooks/useSmartSearch';

/**
 * Tests for the detectMode() pure function from useSmartSearch hook (P8.3).
 *
 * Rules:
 * - Has question mark -> 'ai'
 * - Starts with AI question/command word -> 'ai'
 * - 4+ words -> 'ai'
 * - Otherwise -> 'search'
 */

const AI_QUESTION_WORDS = [
  'what', 'who', 'when', 'where', 'how', 'show', 'list',
  'summarize', 'find', 'tell', 'why', 'which', 'describe', 'explain', 'count',
];

describe('Smart Search - detectMode (P8.3)', () => {
  describe('module exports', () => {
    it('detectMode is a function', () => {
      expect(typeof detectMode).toBe('function');
    });

    it('returns a string', () => {
      const result = detectMode('test');
      expect(typeof result).toBe('string');
    });
  });

  describe('empty/trivial input returns "search"', () => {
    it('returns "search" for empty string', () => {
      expect(detectMode('')).toBe('search');
    });

    it('returns "search" for whitespace-only', () => {
      expect(detectMode('   ')).toBe('search');
    });
  });

  describe('question mark triggers AI mode', () => {
    it('returns "ai" for "what time?"', () => {
      expect(detectMode('what time?')).toBe('ai');
    });

    it('returns "ai" for "priority?"', () => {
      expect(detectMode('priority?')).toBe('ai');
    });

    it('returns "ai" for embedded question mark', () => {
      expect(detectMode('is this working?')).toBe('ai');
    });
  });

  describe('AI question/command words trigger AI mode', () => {
    for (const word of AI_QUESTION_WORDS) {
      it(`"${word} something" returns "ai"`, () => {
        expect(detectMode(`${word} something`)).toBe('ai');
      });
    }
  });

  describe('4+ words trigger AI mode', () => {
    it('returns "ai" for "this is a test"', () => {
      expect(detectMode('this is a test')).toBe('ai');
    });

    it('returns "command" for "assign task to glen today" (starts with command verb)', () => {
      expect(detectMode('assign task to glen today')).toBe('command');
    });

    it('returns "ai" for exactly 4 words', () => {
      expect(detectMode('one two three four')).toBe('ai');
    });
  });

  describe('short keyword queries return "search"', () => {
    it('returns "search" for single word "login"', () => {
      expect(detectMode('login')).toBe('search');
    });

    it('returns "search" for 2 words "fix bug"', () => {
      expect(detectMode('fix bug')).toBe('search');
    });

    it('returns "search" for 3 words "deploy new version"', () => {
      expect(detectMode('deploy new version')).toBe('search');
    });

    it('returns "search" for single word "design"', () => {
      expect(detectMode('design')).toBe('search');
    });
  });

  describe('case sensitivity', () => {
    it('detectMode is case-insensitive for question words', () => {
      // detectMode lowercases input before checking first word
      expect(detectMode('What tasks')).toBe('ai');
    });

    it('handles all-caps question words', () => {
      expect(detectMode('HOW many cards')).toBe('ai');
    });

    it('handles mixed case', () => {
      expect(detectMode('Show me the board')).toBe('ai');
    });
  });

  describe('edge cases', () => {
    it('returns "search" for a single character', () => {
      expect(detectMode('a')).toBe('search');
    });

    it('returns "ai" for question mark alone', () => {
      expect(detectMode('?')).toBe('ai');
    });

    it('handles leading/trailing whitespace', () => {
      expect(detectMode('  what is this  ')).toBe('ai');
    });

    it('returns correct type values', () => {
      const searchResult: SearchMode = detectMode('test');
      const aiResult: SearchMode = detectMode('what is this?');
      expect(searchResult).toBe('search');
      expect(aiResult).toBe('ai');
    });
  });
});
