import { describe, it, expect } from 'vitest';
import { validateChartData } from '@/lib/ai/chart-validator';
import type { BoardChartData, BoardChartDataPoint } from '@/lib/types';

// ─── validateChartData ─────────────────────────────────────

describe('validateChartData', () => {
  const validBar: BoardChartData = {
    chartType: 'bar',
    title: 'Cards per List',
    data: [
      { label: 'To Do', value: 5 },
      { label: 'In Progress', value: 3 },
      { label: 'Done', value: 8 },
    ],
  };

  // ── null/invalid inputs ──

  it('returns null for null', () => {
    expect(validateChartData(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(validateChartData(undefined)).toBeNull();
  });

  it('returns null for a string', () => {
    expect(validateChartData('hello')).toBeNull();
  });

  it('returns null for a number', () => {
    expect(validateChartData(42)).toBeNull();
  });

  it('returns null for an array', () => {
    expect(validateChartData([1, 2])).toBeNull();
  });

  it('returns null for empty object', () => {
    expect(validateChartData({})).toBeNull();
  });

  // ── chartType validation ──

  it('returns null for invalid chartType', () => {
    expect(validateChartData({ ...validBar, chartType: 'scatter' })).toBeNull();
  });

  it('returns null for missing chartType', () => {
    const { chartType, ...rest } = validBar;
    expect(validateChartData(rest)).toBeNull();
  });

  it('accepts bar chartType', () => {
    expect(validateChartData(validBar)?.chartType).toBe('bar');
  });

  it('accepts pie chartType', () => {
    expect(validateChartData({ ...validBar, chartType: 'pie' })?.chartType).toBe('pie');
  });

  it('accepts line chartType', () => {
    expect(validateChartData({ ...validBar, chartType: 'line' })?.chartType).toBe('line');
  });

  // ── title validation ──

  it('returns null for missing title', () => {
    const { title, ...rest } = validBar;
    expect(validateChartData(rest)).toBeNull();
  });

  it('returns null for empty title', () => {
    expect(validateChartData({ ...validBar, title: '   ' })).toBeNull();
  });

  it('truncates title to 80 chars', () => {
    const longTitle = 'A'.repeat(120);
    const result = validateChartData({ ...validBar, title: longTitle });
    expect(result?.title).toHaveLength(80);
  });

  it('trims title whitespace', () => {
    const result = validateChartData({ ...validBar, title: '  My Chart  ' });
    expect(result?.title).toBe('My Chart');
  });

  // ── data length bounds ──

  it('returns null for data with 1 item', () => {
    expect(validateChartData({
      ...validBar,
      data: [{ label: 'Only', value: 1 }],
    })).toBeNull();
  });

  it('accepts data with exactly 2 items', () => {
    const result = validateChartData({
      ...validBar,
      data: [
        { label: 'A', value: 1 },
        { label: 'B', value: 2 },
      ],
    });
    expect(result?.data).toHaveLength(2);
  });

  it('accepts data with exactly 12 items', () => {
    const data = Array.from({ length: 12 }, (_, i) => ({
      label: `Item ${i}`, value: i + 1,
    }));
    const result = validateChartData({ ...validBar, data });
    expect(result?.data).toHaveLength(12);
  });

  it('returns null for data with 13 items', () => {
    const data = Array.from({ length: 13 }, (_, i) => ({
      label: `Item ${i}`, value: i + 1,
    }));
    expect(validateChartData({ ...validBar, data })).toBeNull();
  });

  it('returns null for empty data array', () => {
    expect(validateChartData({ ...validBar, data: [] })).toBeNull();
  });

  it('returns null for non-array data', () => {
    expect(validateChartData({ ...validBar, data: 'not-array' })).toBeNull();
  });

  // ── data point validation ──

  it('returns null if a point has non-string label', () => {
    expect(validateChartData({
      ...validBar,
      data: [
        { label: 123, value: 5 },
        { label: 'B', value: 3 },
      ],
    })).toBeNull();
  });

  it('returns null if a point has empty label', () => {
    expect(validateChartData({
      ...validBar,
      data: [
        { label: '', value: 5 },
        { label: 'B', value: 3 },
      ],
    })).toBeNull();
  });

  it('returns null if a point has non-number value', () => {
    expect(validateChartData({
      ...validBar,
      data: [
        { label: 'A', value: 'five' },
        { label: 'B', value: 3 },
      ],
    })).toBeNull();
  });

  it('returns null if a point has negative value', () => {
    expect(validateChartData({
      ...validBar,
      data: [
        { label: 'A', value: -1 },
        { label: 'B', value: 3 },
      ],
    })).toBeNull();
  });

  it('returns null if a point has NaN value', () => {
    expect(validateChartData({
      ...validBar,
      data: [
        { label: 'A', value: NaN },
        { label: 'B', value: 3 },
      ],
    })).toBeNull();
  });

  it('returns null if a point has Infinity value', () => {
    expect(validateChartData({
      ...validBar,
      data: [
        { label: 'A', value: Infinity },
        { label: 'B', value: 3 },
      ],
    })).toBeNull();
  });

  it('returns null if data contains null item', () => {
    expect(validateChartData({
      ...validBar,
      data: [null, { label: 'B', value: 3 }],
    })).toBeNull();
  });

  // ── label truncation ──

  it('truncates data labels to 40 chars', () => {
    const result = validateChartData({
      ...validBar,
      data: [
        { label: 'X'.repeat(60), value: 1 },
        { label: 'Short', value: 2 },
      ],
    });
    expect(result?.data[0].label).toHaveLength(40);
    expect(result?.data[1].label).toBe('Short');
  });

  // ── value rounding ──

  it('rounds values to 2 decimal places', () => {
    const result = validateChartData({
      ...validBar,
      data: [
        { label: 'A', value: 3.14159 },
        { label: 'B', value: 2.71828 },
      ],
    });
    expect(result?.data[0].value).toBe(3.14);
    expect(result?.data[1].value).toBe(2.72);
  });

  it('keeps integer values unchanged', () => {
    const result = validateChartData(validBar);
    expect(result?.data[0].value).toBe(5);
    expect(result?.data[1].value).toBe(3);
    expect(result?.data[2].value).toBe(8);
  });

  // ── color preservation ──

  it('preserves color when provided', () => {
    const result = validateChartData({
      ...validBar,
      data: [
        { label: 'A', value: 1, color: '#ff0000' },
        { label: 'B', value: 2, color: '#00ff00' },
      ],
    });
    expect(result?.data[0].color).toBe('#ff0000');
    expect(result?.data[1].color).toBe('#00ff00');
  });

  it('omits color when not provided', () => {
    const result = validateChartData(validBar);
    expect(result?.data[0]).not.toHaveProperty('color');
  });

  it('omits color when empty string', () => {
    const result = validateChartData({
      ...validBar,
      data: [
        { label: 'A', value: 1, color: '' },
        { label: 'B', value: 2 },
      ],
    });
    expect(result?.data[0]).not.toHaveProperty('color');
  });

  // ── optional fields ──

  it('includes valueLabel when provided', () => {
    const result = validateChartData({ ...validBar, valueLabel: 'cards' });
    expect(result?.valueLabel).toBe('cards');
  });

  it('omits valueLabel when not provided', () => {
    const result = validateChartData(validBar);
    expect(result).not.toHaveProperty('valueLabel');
  });

  it('truncates valueLabel to 30 chars', () => {
    const result = validateChartData({ ...validBar, valueLabel: 'V'.repeat(50) });
    expect(result?.valueLabel).toHaveLength(30);
  });

  it('includes trend when provided', () => {
    const result = validateChartData({ ...validBar, trend: '+3 this week' });
    expect(result?.trend).toBe('+3 this week');
  });

  it('omits trend when not provided', () => {
    const result = validateChartData(validBar);
    expect(result).not.toHaveProperty('trend');
  });

  it('truncates trend to 60 chars', () => {
    const result = validateChartData({ ...validBar, trend: 'T'.repeat(80) });
    expect(result?.trend).toHaveLength(60);
  });

  it('omits valueLabel when empty string', () => {
    const result = validateChartData({ ...validBar, valueLabel: '  ' });
    expect(result).not.toHaveProperty('valueLabel');
  });

  it('omits trend when empty string', () => {
    const result = validateChartData({ ...validBar, trend: '   ' });
    expect(result).not.toHaveProperty('trend');
  });

  // ── full valid chart shapes ──

  it('validates a complete bar chart', () => {
    const result = validateChartData({
      chartType: 'bar',
      title: 'Cards per List',
      data: [
        { label: 'To Do', value: 12 },
        { label: 'In Progress', value: 5 },
        { label: 'Done', value: 20 },
      ],
      valueLabel: 'cards',
      trend: '+5 this week',
    });
    expect(result).toEqual({
      chartType: 'bar',
      title: 'Cards per List',
      data: [
        { label: 'To Do', value: 12 },
        { label: 'In Progress', value: 5 },
        { label: 'Done', value: 20 },
      ],
      valueLabel: 'cards',
      trend: '+5 this week',
    });
  });

  it('validates a complete pie chart', () => {
    const result = validateChartData({
      chartType: 'pie',
      title: 'Priority Distribution',
      data: [
        { label: 'Urgent', value: 3 },
        { label: 'High', value: 7 },
        { label: 'Medium', value: 15 },
        { label: 'Low', value: 10 },
      ],
    });
    expect(result?.chartType).toBe('pie');
    expect(result?.data).toHaveLength(4);
  });

  it('validates a complete line chart', () => {
    const result = validateChartData({
      chartType: 'line',
      title: 'Cards Created Over Time',
      data: [
        { label: 'Mon', value: 3 },
        { label: 'Tue', value: 5 },
        { label: 'Wed', value: 2 },
        { label: 'Thu', value: 8 },
        { label: 'Fri', value: 4 },
      ],
      valueLabel: 'cards',
    });
    expect(result?.chartType).toBe('line');
    expect(result?.data).toHaveLength(5);
  });
});

// ─── Type shape validation ─────────────────────────────────

describe('BoardChartData type shapes', () => {
  it('BoardChartDataPoint accepts minimal shape', () => {
    const point: BoardChartDataPoint = { label: 'Test', value: 10 };
    expect(point.label).toBe('Test');
    expect(point.value).toBe(10);
    expect(point.color).toBeUndefined();
  });

  it('BoardChartDataPoint accepts color', () => {
    const point: BoardChartDataPoint = { label: 'Test', value: 10, color: '#ff0000' };
    expect(point.color).toBe('#ff0000');
  });

  it('BoardChartData accepts minimal shape', () => {
    const chart: BoardChartData = {
      chartType: 'bar',
      title: 'Test',
      data: [
        { label: 'A', value: 1 },
        { label: 'B', value: 2 },
      ],
    };
    expect(chart.chartType).toBe('bar');
    expect(chart.valueLabel).toBeUndefined();
    expect(chart.trend).toBeUndefined();
  });

  it('BoardChartData accepts all optional fields', () => {
    const chart: BoardChartData = {
      chartType: 'pie',
      title: 'Distribution',
      data: [
        { label: 'A', value: 1 },
        { label: 'B', value: 2 },
      ],
      valueLabel: 'items',
      trend: '+10%',
    };
    expect(chart.valueLabel).toBe('items');
    expect(chart.trend).toBe('+10%');
  });
});

// ─── SSE done event parsing ────────────────────────────────

describe('SSE done event chart_data parsing', () => {
  it('parses done event without chart_data', () => {
    const data: Record<string, unknown> = {
      response: 'There are 5 overdue tasks.',
      thinking: 'Checking due dates.',
      user_mood: 'curious',
      suggested_questions: ['Which tasks?'],
      matched_categories: ['deadlines'],
      redirect_to_owner: { should_redirect: false },
    };
    // Simulating what the hook does
    const chartData = data.chart_data || null;
    expect(chartData).toBeNull();
  });

  it('parses done event with valid chart_data', () => {
    const data: any = {
      response: 'Here is the distribution.',
      chart_data: {
        chartType: 'pie',
        title: 'Priority Mix',
        data: [
          { label: 'High', value: 5 },
          { label: 'Low', value: 10 },
        ],
      },
    };
    const chartData = data.chart_data || null;
    expect(chartData).not.toBeNull();
    expect(chartData.chartType).toBe('pie');
  });

  it('handles null chart_data in done event', () => {
    const data: any = {
      response: 'Answer here.',
      chart_data: null,
    };
    const chartData = data.chart_data || null;
    expect(chartData).toBeNull();
  });
});

// ─── Chart data preparation helpers ────────────────────────

describe('Chart data preparation', () => {
  it('computes max value for bar chart', () => {
    const data: BoardChartDataPoint[] = [
      { label: 'A', value: 5 },
      { label: 'B', value: 12 },
      { label: 'C', value: 3 },
    ];
    const maxVal = Math.max(...data.map(d => d.value));
    expect(maxVal).toBe(12);
  });

  it('computes total for pie chart', () => {
    const data: BoardChartDataPoint[] = [
      { label: 'A', value: 10 },
      { label: 'B', value: 20 },
      { label: 'C', value: 30 },
    ];
    const total = data.reduce((s, d) => s + d.value, 0);
    expect(total).toBe(60);
  });

  it('arc angles sum to 360 for pie chart', () => {
    const data: BoardChartDataPoint[] = [
      { label: 'A', value: 1 },
      { label: 'B', value: 2 },
      { label: 'C', value: 3 },
    ];
    const total = data.reduce((s, d) => s + d.value, 0);
    const angles = data.map(d => (d.value / total) * 360);
    const sum = angles.reduce((s, a) => s + a, 0);
    expect(sum).toBeCloseTo(360, 5);
  });

  it('handles all-zero values gracefully', () => {
    const data: BoardChartDataPoint[] = [
      { label: 'A', value: 0 },
      { label: 'B', value: 0 },
    ];
    const maxVal = Math.max(...data.map(d => d.value), 1);
    expect(maxVal).toBe(1); // Fallback to 1 to avoid division by zero
  });

  it('allows zero-value data points', () => {
    const result = validateChartData({
      chartType: 'bar',
      title: 'Test',
      data: [
        { label: 'A', value: 0 },
        { label: 'B', value: 5 },
      ],
    });
    expect(result?.data[0].value).toBe(0);
    expect(result?.data[1].value).toBe(5);
  });
});
