import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { calculateNextRun } from '@/lib/qa-scheduler';
import type { QASchedule } from '@/lib/qa-scheduler';

// ===========================================================================
// calculateNextRun
// ===========================================================================

describe('QA Scheduler - calculateNextRun', () => {
  beforeEach(() => {
    // Fix "now" to 2025-03-15T12:00:00.000Z for deterministic tests
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-03-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds 1 day for daily frequency', () => {
    const result = calculateNextRun('daily');
    const date = new Date(result);
    expect(date.getDate()).toBe(16); // March 16
  });

  it('adds 7 days for weekly frequency', () => {
    const result = calculateNextRun('weekly');
    const date = new Date(result);
    expect(date.getDate()).toBe(22); // March 22
  });

  it('adds 14 days for biweekly frequency', () => {
    const result = calculateNextRun('biweekly');
    const date = new Date(result);
    expect(date.getDate()).toBe(29); // March 29
  });

  it('sets time to 6:00 AM for daily', () => {
    const result = calculateNextRun('daily');
    const date = new Date(result);
    expect(date.getHours()).toBe(6);
    expect(date.getMinutes()).toBe(0);
    expect(date.getSeconds()).toBe(0);
    expect(date.getMilliseconds()).toBe(0);
  });

  it('sets time to 6:00 AM for weekly', () => {
    const result = calculateNextRun('weekly');
    const date = new Date(result);
    expect(date.getHours()).toBe(6);
    expect(date.getMinutes()).toBe(0);
    expect(date.getSeconds()).toBe(0);
  });

  it('sets time to 6:00 AM for biweekly', () => {
    const result = calculateNextRun('biweekly');
    const date = new Date(result);
    expect(date.getHours()).toBe(6);
    expect(date.getMinutes()).toBe(0);
    expect(date.getSeconds()).toBe(0);
  });

  it('returns a valid ISO date string', () => {
    const result = calculateNextRun('daily');
    expect(() => new Date(result)).not.toThrow();
    // ISO strings end with Z or have timezone offset
    expect(result).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('handles month rollover correctly', () => {
    // Set to March 31
    vi.setSystemTime(new Date('2025-03-31T12:00:00.000Z'));
    const result = calculateNextRun('daily');
    const date = new Date(result);
    expect(date.getMonth()).toBe(3); // April (0-indexed)
    expect(date.getDate()).toBe(1);
  });

  it('handles year rollover correctly', () => {
    // Set to December 30
    vi.setSystemTime(new Date('2025-12-30T12:00:00.000Z'));
    const result = calculateNextRun('weekly');
    const date = new Date(result);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(0); // January
    expect(date.getDate()).toBe(6);
  });

  it('result is always in the future relative to now', () => {
    const now = new Date('2025-03-15T12:00:00.000Z');
    for (const freq of ['daily', 'weekly', 'biweekly'] as const) {
      const result = new Date(calculateNextRun(freq));
      // The date part should be in the future (the 6AM time could make it
      // technically "earlier" on a future day, but the day itself is ahead)
      expect(result.getDate()).toBeGreaterThan(now.getDate());
    }
  });
});

// ===========================================================================
// Module exports validation
// ===========================================================================

describe('QA Scheduler - module exports', () => {
  it('exports getSchedule as a function', async () => {
    const mod = await import('@/lib/qa-scheduler');
    expect(typeof mod.getSchedule).toBe('function');
  });

  it('exports upsertSchedule as a function', async () => {
    const mod = await import('@/lib/qa-scheduler');
    expect(typeof mod.upsertSchedule).toBe('function');
  });

  it('exports getDueSchedules as a function', async () => {
    const mod = await import('@/lib/qa-scheduler');
    expect(typeof mod.getDueSchedules).toBe('function');
  });

  it('exports markScheduleRun as a function', async () => {
    const mod = await import('@/lib/qa-scheduler');
    expect(typeof mod.markScheduleRun).toBe('function');
  });

  it('exports calculateNextRun as a function', async () => {
    const mod = await import('@/lib/qa-scheduler');
    expect(typeof mod.calculateNextRun).toBe('function');
  });
});
