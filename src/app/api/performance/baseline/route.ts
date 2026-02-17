import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { PERFORMANCE_THRESHOLDS, checkPerformanceRegression } from '@/lib/performance';
import type { PerformanceMetric } from '@/lib/performance';

/**
 * GET /api/performance/baseline
 * Returns the current performance thresholds / baseline metrics.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  return successResponse({ thresholds: PERFORMANCE_THRESHOLDS });
}

interface RegressionCheckBody {
  current: PerformanceMetric[];
  baseline?: PerformanceMetric[];
  maxDegradationPct?: number;
}

/**
 * POST /api/performance/baseline
 * Check for performance regressions against baseline.
 * If no baseline is provided, uses PERFORMANCE_THRESHOLDS.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<RegressionCheckBody>(request);
  if (!parsed.ok) return parsed.response;

  const { current, baseline, maxDegradationPct } = parsed.body;

  if (!current || !Array.isArray(current)) {
    return errorResponse('current metrics array is required');
  }

  const baselineMetrics = baseline ?? PERFORMANCE_THRESHOLDS;
  const result = checkPerformanceRegression(baselineMetrics, current, maxDegradationPct);

  return successResponse(result);
}
