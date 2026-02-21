import { describe, it, expect } from 'vitest';
import { parseBoolean, parseDate, parseNumber } from '@/lib/performance-sync';

describe('Performance Sync - Parsers', () => {
  describe('parseBoolean', () => {
    it('returns true for positive values', () => {
      expect(parseBoolean('yes')).toBe(true);
      expect(parseBoolean('Yes')).toBe(true);
      expect(parseBoolean('YES')).toBe(true);
      expect(parseBoolean('true')).toBe(true);
      expect(parseBoolean('TRUE')).toBe(true);
      expect(parseBoolean('done')).toBe(true);
      expect(parseBoolean('Done')).toBe(true);
      expect(parseBoolean('1')).toBe(true);
      expect(parseBoolean('completed')).toBe(true);
    });

    it('returns false for negative values', () => {
      expect(parseBoolean('no')).toBe(false);
      expect(parseBoolean('No')).toBe(false);
      expect(parseBoolean('false')).toBe(false);
      expect(parseBoolean('0')).toBe(false);
      expect(parseBoolean('not done')).toBe(false);
      expect(parseBoolean('pending')).toBe(false);
    });

    it('returns null for empty/undefined/unrecognized values', () => {
      expect(parseBoolean(undefined)).toBeNull();
      expect(parseBoolean('')).toBeNull();
      expect(parseBoolean('maybe')).toBeNull();
      expect(parseBoolean('N/A')).toBeNull();
    });

    it('trims whitespace', () => {
      expect(parseBoolean('  yes  ')).toBe(true);
      expect(parseBoolean('  no  ')).toBe(false);
    });
  });

  describe('parseDate', () => {
    it('parses ISO date strings', () => {
      expect(parseDate('2025-03-15')).toBe('2025-03-15');
    });

    it('parses ISO datetime strings to date only', () => {
      const result = parseDate('2025-03-15T10:30:00Z');
      expect(result).toBe('2025-03-15');
    });

    it('parses MM/DD/YYYY format', () => {
      expect(parseDate('3/15/2025')).toBe('2025-03-15');
      expect(parseDate('03/15/2025')).toBe('2025-03-15');
      expect(parseDate('12/01/2025')).toBe('2025-12-01');
    });

    it('returns null for empty/undefined values', () => {
      expect(parseDate(undefined)).toBeNull();
      expect(parseDate('')).toBeNull();
      expect(parseDate('   ')).toBeNull();
    });

    it('returns null for invalid date strings', () => {
      expect(parseDate('not a date')).toBeNull();
      expect(parseDate('abc123')).toBeNull();
    });
  });

  describe('parseNumber', () => {
    it('parses integers', () => {
      expect(parseNumber('42')).toBe(42);
      expect(parseNumber('0')).toBe(0);
      expect(parseNumber('-5')).toBe(-5);
    });

    it('parses decimals', () => {
      expect(parseNumber('3.14')).toBe(3.14);
      expect(parseNumber('0.5')).toBe(0.5);
    });

    it('strips percent signs', () => {
      expect(parseNumber('85%')).toBe(85);
      expect(parseNumber('100%')).toBe(100);
    });

    it('strips commas from large numbers', () => {
      expect(parseNumber('1,000')).toBe(1000);
      expect(parseNumber('1,234,567')).toBe(1234567);
    });

    it('returns null for empty/undefined/non-numeric values', () => {
      expect(parseNumber(undefined)).toBeNull();
      expect(parseNumber('')).toBeNull();
      expect(parseNumber('N/A')).toBeNull();
      expect(parseNumber('abc')).toBeNull();
    });

    it('trims whitespace', () => {
      expect(parseNumber('  42  ')).toBe(42);
    });
  });
});
