import { describe, it, expect } from 'vitest';

/**
 * PerformanceMonitor utility function tests.
 *
 * The PerformanceMonitor component (src/components/performance/PerformanceMonitor.tsx)
 * defines three pure utility functions inline (not exported):
 *   - formatMetricName(name) -> formatted display name
 *   - getStatusColor(metric) -> Tailwind class
 *   - getStatusText(metric) -> status string
 *
 * Since these are not exported, we replicate the logic here to verify
 * expected behavior and test the PerformanceMetric interface shape.
 */

interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  threshold: number;
}

// Replicated from PerformanceMonitor.tsx
function formatMetricName(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace('Ms', '(ms)')
    .replace('Fps', '(FPS)');
}

function getStatusColor(metric: PerformanceMetric): string {
  if (metric.value === 0) return 'bg-navy/20';
  const isFps = metric.unit === 'fps';
  const isGood = isFps ? metric.value >= metric.threshold : metric.value <= metric.threshold;
  return isGood ? 'bg-green-500' : 'bg-red-500';
}

function getStatusText(metric: PerformanceMetric): string {
  if (metric.value === 0) return 'Not measured';
  const isFps = metric.unit === 'fps';
  const isGood = isFps ? metric.value >= metric.threshold : metric.value <= metric.threshold;
  return isGood ? 'Within threshold' : 'Exceeds threshold';
}

describe('Performance Monitor Utilities', () => {
  describe('formatMetricName', () => {
    it('replaces underscores with spaces', () => {
      expect(formatMetricName('first_paint')).toContain(' ');
      expect(formatMetricName('first_paint')).not.toContain('_');
    });

    it('capitalizes first letter of each word', () => {
      const result = formatMetricName('load_time');
      expect(result).toBe('Load Time');
    });

    it('replaces Ms with (ms)', () => {
      const result = formatMetricName('load_time_ms');
      expect(result).toContain('(ms)');
    });

    it('replaces Fps with (FPS)', () => {
      const result = formatMetricName('render_fps');
      expect(result).toContain('(FPS)');
    });

    it('handles single word names', () => {
      const result = formatMetricName('latency');
      expect(result).toBe('Latency');
    });
  });

  describe('getStatusColor', () => {
    it('returns bg-navy/20 when value is 0', () => {
      const metric: PerformanceMetric = { name: 'test', value: 0, unit: 'ms', threshold: 100 };
      expect(getStatusColor(metric)).toBe('bg-navy/20');
    });

    it('returns bg-green-500 when ms value is within threshold', () => {
      const metric: PerformanceMetric = { name: 'load', value: 50, unit: 'ms', threshold: 100 };
      expect(getStatusColor(metric)).toBe('bg-green-500');
    });

    it('returns bg-red-500 when ms value exceeds threshold', () => {
      const metric: PerformanceMetric = { name: 'load', value: 200, unit: 'ms', threshold: 100 };
      expect(getStatusColor(metric)).toBe('bg-red-500');
    });

    it('returns bg-green-500 when fps value meets threshold', () => {
      const metric: PerformanceMetric = { name: 'fps', value: 60, unit: 'fps', threshold: 30 };
      expect(getStatusColor(metric)).toBe('bg-green-500');
    });

    it('returns bg-red-500 when fps value is below threshold', () => {
      const metric: PerformanceMetric = { name: 'fps', value: 15, unit: 'fps', threshold: 30 };
      expect(getStatusColor(metric)).toBe('bg-red-500');
    });
  });

  describe('getStatusText', () => {
    it('returns "Not measured" when value is 0', () => {
      const metric: PerformanceMetric = { name: 'test', value: 0, unit: 'ms', threshold: 100 };
      expect(getStatusText(metric)).toBe('Not measured');
    });

    it('returns "Within threshold" for good ms metrics', () => {
      const metric: PerformanceMetric = { name: 'load', value: 80, unit: 'ms', threshold: 100 };
      expect(getStatusText(metric)).toBe('Within threshold');
    });

    it('returns "Exceeds threshold" for bad ms metrics', () => {
      const metric: PerformanceMetric = { name: 'load', value: 150, unit: 'ms', threshold: 100 };
      expect(getStatusText(metric)).toBe('Exceeds threshold');
    });

    it('returns "Within threshold" for good fps metrics', () => {
      const metric: PerformanceMetric = { name: 'render', value: 60, unit: 'fps', threshold: 30 };
      expect(getStatusText(metric)).toBe('Within threshold');
    });

    it('returns "Exceeds threshold" for bad fps metrics', () => {
      const metric: PerformanceMetric = { name: 'render', value: 10, unit: 'fps', threshold: 30 };
      expect(getStatusText(metric)).toBe('Exceeds threshold');
    });

    it('fps exactly at threshold is within threshold', () => {
      const metric: PerformanceMetric = { name: 'render', value: 30, unit: 'fps', threshold: 30 };
      expect(getStatusText(metric)).toBe('Within threshold');
    });

    it('ms exactly at threshold is within threshold', () => {
      const metric: PerformanceMetric = { name: 'load', value: 100, unit: 'ms', threshold: 100 };
      expect(getStatusText(metric)).toBe('Within threshold');
    });
  });

  describe('PerformanceMetric interface shape', () => {
    it('can create a valid metric object', () => {
      const metric: PerformanceMetric = {
        name: 'dom_content_loaded_ms',
        value: 450,
        unit: 'ms',
        threshold: 500,
      };

      expect(metric.name).toBe('dom_content_loaded_ms');
      expect(metric.value).toBe(450);
      expect(metric.unit).toBe('ms');
      expect(metric.threshold).toBe(500);
    });
  });
});
