import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getModelPricing, upsertModelPricing } from '@/lib/ai/cost-profiling';

/**
 * GET /api/ai/pricing
 * List model pricing rows.
 * Query params:
 *   provider?: string - filter by provider
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { searchParams } = new URL(request.url);
  const provider = searchParams.get('provider') ?? undefined;

  try {
    const pricing = await getModelPricing(supabase, provider);
    return successResponse(pricing);
  } catch (err) {
    return errorResponse(
      `Failed to fetch model pricing: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}

interface UpsertPricingBody {
  provider: string;
  modelId: string;
  inputCostPer1k: number;
  outputCostPer1k: number;
  imageCostPerUnit?: number;
  videoCostPerSecond?: number;
}

/**
 * POST /api/ai/pricing
 * Upsert model pricing.
 *
 * Body:
 *   provider: string (required)
 *   modelId: string (required)
 *   inputCostPer1k: number (required)
 *   outputCostPer1k: number (required)
 *   imageCostPerUnit?: number
 *   videoCostPerSecond?: number
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<UpsertPricingBody>(request);
  if (!body.ok) return body.response;

  const { provider, modelId, inputCostPer1k, outputCostPer1k, imageCostPerUnit, videoCostPerSecond } = body.body;
  const { supabase } = auth.ctx;

  if (!provider) return errorResponse('provider is required');
  if (!modelId) return errorResponse('modelId is required');
  if (typeof inputCostPer1k !== 'number') return errorResponse('inputCostPer1k must be a number');
  if (typeof outputCostPer1k !== 'number') return errorResponse('outputCostPer1k must be a number');

  try {
    const result = await upsertModelPricing(supabase, {
      provider,
      modelId,
      inputCostPer1k,
      outputCostPer1k,
      imageCostPerUnit,
      videoCostPerSecond,
    });

    if (!result) {
      return errorResponse('Failed to upsert model pricing', 500);
    }

    return successResponse(result, 201);
  } catch (err) {
    return errorResponse(
      `Failed to upsert model pricing: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}
