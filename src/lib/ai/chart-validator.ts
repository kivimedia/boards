import type { BoardChartData } from '@/lib/types';

const VALID_CHART_TYPES = ['bar', 'pie', 'line'] as const;

/**
 * Validates and normalizes chart_data from AI response.
 * Returns null if data is invalid or missing.
 */
export function validateChartData(raw: unknown): BoardChartData | null {
  if (!raw || typeof raw !== 'object') return null;

  const obj = raw as Record<string, unknown>;

  // Validate chartType
  if (!obj.chartType || !VALID_CHART_TYPES.includes(obj.chartType as any)) return null;

  // Validate title
  if (typeof obj.title !== 'string' || !obj.title.trim()) return null;

  // Validate data array
  if (!Array.isArray(obj.data) || obj.data.length < 2 || obj.data.length > 12) return null;

  const validatedData: BoardChartData['data'] = [];
  for (const item of obj.data) {
    if (!item || typeof item !== 'object') return null;
    const point = item as Record<string, unknown>;
    if (typeof point.label !== 'string' || !point.label.trim()) return null;
    if (typeof point.value !== 'number' || !isFinite(point.value) || point.value < 0) return null;

    validatedData.push({
      label: point.label.trim().slice(0, 40),
      value: Math.round(point.value * 100) / 100,
      ...(typeof point.color === 'string' && point.color.trim() ? { color: point.color.trim() } : {}),
    });
  }

  return {
    chartType: obj.chartType as BoardChartData['chartType'],
    title: (obj.title as string).trim().slice(0, 80),
    data: validatedData,
    ...(typeof obj.valueLabel === 'string' && obj.valueLabel.trim() ? { valueLabel: obj.valueLabel.trim().slice(0, 30) } : {}),
    ...(typeof obj.trend === 'string' && obj.trend.trim() ? { trend: obj.trend.trim().slice(0, 60) } : {}),
  };
}
