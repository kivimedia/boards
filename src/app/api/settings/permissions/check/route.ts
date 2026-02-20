import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getFeatureAccessMap, hasFeatureAccess, ADMIN_FEATURES, AdminFeatureKey } from '@/lib/feature-access';

/**
 * GET /api/settings/permissions/check?features=user_management,ai_config
 * Returns access map for the current user.
 * If no `features` param, returns all features.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  const featuresParam = request.nextUrl.searchParams.get('features');

  if (!featuresParam) {
    // Return full access map
    const accessMap = await getFeatureAccessMap(supabase, userId);
    return successResponse(accessMap);
  }

  // Check specific features
  const keys = featuresParam.split(',').filter(k => ADMIN_FEATURES.includes(k as AdminFeatureKey));

  if (keys.length === 0) {
    return errorResponse(`Invalid features. Must be from: ${ADMIN_FEATURES.join(', ')}`);
  }

  const result: Record<string, boolean> = {};
  for (const key of keys) {
    result[key] = await hasFeatureAccess(supabase, userId, key as AdminFeatureKey);
  }

  return successResponse(result);
}
