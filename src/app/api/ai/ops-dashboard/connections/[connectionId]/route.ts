import { getAuthContext, parseBody, successResponse, errorResponse } from '@/lib/api-helpers';
import {
  deleteSyncConnection,
  updateSyncConnection,
  type AIVendorSyncConnectionInput,
} from '@/lib/ai/ops-sync';

type RouteContext = {
  params: { connectionId: string };
};

export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<Partial<AIVendorSyncConnectionInput>>(request);
  if (!parsed.ok) return parsed.response;

  try {
    const data = await updateSyncConnection(auth.ctx.supabase, params.connectionId, parsed.body);
    return successResponse({
      id: data.id,
      provider_key: data.provider_key,
      connection_type: data.connection_type,
      label: data.label,
      is_active: data.is_active,
      last_tested_at: data.last_tested_at,
      last_synced_at: data.last_synced_at,
      last_sync_status: data.last_sync_status,
      last_error: data.last_error,
      config: data.config ?? {},
      created_at: data.created_at,
      updated_at: data.updated_at,
    });
  } catch (err) {
    return errorResponse(
      `Failed to update provider connection: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  try {
    await deleteSyncConnection(auth.ctx.supabase, params.connectionId);
    return successResponse({ ok: true });
  } catch (err) {
    return errorResponse(
      `Failed to delete provider connection: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}
