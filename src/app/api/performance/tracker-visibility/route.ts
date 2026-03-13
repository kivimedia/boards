import { NextRequest } from 'next/server';
import {
  errorResponse,
  getAuthContext,
  parseBody,
  successResponse,
} from '@/lib/api-helpers';
import { PK_TRACKER_LABELS, PKTrackerType } from '@/lib/types';
import { SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const TRACKER_HIDDEN_CONFIG_KEY = 'hidden_in_all_trackers';
const VALID_TRACKER_TYPES = new Set<PKTrackerType>(
  (Object.keys(PK_TRACKER_LABELS) as PKTrackerType[]).filter(
    (trackerType) => trackerType !== 'masterlist'
  )
);

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toHiddenTrackerTypes(
  rows: Array<{ tracker_type: string; config: unknown }>
): string[] {
  return Array.from(
    new Set(
      rows
        .filter(
          (row) =>
            isJsonObject(row.config) &&
            row.config[TRACKER_HIDDEN_CONFIG_KEY] === true
        )
        .map((row) => row.tracker_type)
    )
  ).sort((a, b) => a.localeCompare(b));
}

async function canManageTrackerVisibility(
  supabase: SupabaseClient,
  userId: string,
  userEmail: string | undefined | null
) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  const isAdmin = profile?.role === 'admin';
  const isDevi = (userEmail || '').toLowerCase() === 'devi@dailycookie.co';
  return isAdmin || isDevi;
}

async function fetchVisibilityRows(
  supabase: SupabaseClient
) {
  const { data, error } = await supabase
    .from('pk_sync_configs')
    .select('tracker_type, config')
    .eq('is_active', true)
    .neq('tracker_type', 'masterlist');

  if (error) {
    return {
      ok: false as const,
      response: errorResponse(error.message, 500),
    };
  }

  return {
    ok: true as const,
    rows: (data || []) as Array<{ tracker_type: string; config: unknown }>,
  };
}

export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;
  const { supabase } = auth.ctx;

  const { searchParams } = new URL(request.url);
  const trackerType = searchParams.get('type') as PKTrackerType | null;

  if (trackerType && !VALID_TRACKER_TYPES.has(trackerType)) {
    return errorResponse('Invalid tracker type');
  }

  const rowsResult = await fetchVisibilityRows(supabase);
  if (!rowsResult.ok) return rowsResult.response;

  const hiddenTrackerTypes = toHiddenTrackerTypes(rowsResult.rows);

  if (trackerType) {
    return successResponse({
      tracker_type: trackerType,
      hidden: hiddenTrackerTypes.includes(trackerType),
      hidden_tracker_types: hiddenTrackerTypes,
    });
  }

  return successResponse({
    hidden_tracker_types: hiddenTrackerTypes,
  });
}

interface UpdateTrackerVisibilityBody {
  type: PKTrackerType;
  hidden: boolean;
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<UpdateTrackerVisibilityBody>(request);
  if (!parsed.ok) return parsed.response;

  const { type, hidden } = parsed.body;

  if (!type || !VALID_TRACKER_TYPES.has(type)) {
    return errorResponse('Invalid tracker type');
  }

  if (typeof hidden !== 'boolean') {
    return errorResponse('hidden must be a boolean');
  }

  const { supabase, userId } = auth.ctx;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return errorResponse('Unauthorized', 401);
  }

  const canManage = await canManageTrackerVisibility(supabase, userId, user.email);
  if (!canManage) {
    return errorResponse('Forbidden', 403);
  }

  const { data: trackerConfigs, error: trackerConfigsError } = await supabase
    .from('pk_sync_configs')
    .select('id, config')
    .eq('tracker_type', type);

  if (trackerConfigsError) {
    return errorResponse(trackerConfigsError.message, 500);
  }

  if (!trackerConfigs || trackerConfigs.length === 0) {
    return errorResponse(`No sync config found for tracker type: ${type}`, 404);
  }

  const updateErrors = await Promise.all(
    trackerConfigs.map(async (row) => {
      const currentConfig = isJsonObject(row.config) ? row.config : {};
      const nextConfig = {
        ...currentConfig,
        [TRACKER_HIDDEN_CONFIG_KEY]: hidden,
      };

      const { error: updateError } = await supabase
        .from('pk_sync_configs')
        .update({ config: nextConfig })
        .eq('id', row.id);

      return updateError;
    })
  );

  const firstUpdateError = updateErrors.find(Boolean);
  if (firstUpdateError) {
    return errorResponse(firstUpdateError.message, 500);
  }

  const rowsResult = await fetchVisibilityRows(supabase);
  if (!rowsResult.ok) return rowsResult.response;

  const hiddenTrackerTypes = toHiddenTrackerTypes(rowsResult.rows);

  return successResponse({
    tracker_type: type,
    hidden,
    hidden_tracker_types: hiddenTrackerTypes,
  });
}
