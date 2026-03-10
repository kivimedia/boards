import { getAuthContext, parseBody, successResponse, errorResponse } from '@/lib/api-helpers';
import {
  createSyncConnection,
  listSyncConnections,
  type AIVendorSyncConnectionInput,
} from '@/lib/ai/ops-sync';

export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  try {
    const data = await listSyncConnections(auth.ctx.supabase);
    return successResponse(data.map((connection) => ({
      id: connection.id,
      provider_key: connection.provider_key,
      connection_type: connection.connection_type,
      label: connection.label,
      is_active: connection.is_active,
      last_tested_at: connection.last_tested_at,
      last_synced_at: connection.last_synced_at,
      last_sync_status: connection.last_sync_status,
      last_error: connection.last_error,
      config: connection.config ?? {},
      created_at: connection.created_at,
      updated_at: connection.updated_at,
    })));
  } catch (err) {
    return errorResponse(
      `Failed to load provider connections: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}

export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<AIVendorSyncConnectionInput>(request);
  if (!parsed.ok) return parsed.response;

  if (!parsed.body.provider_key || !parsed.body.label?.trim() || !parsed.body.secret?.trim()) {
    return errorResponse('provider_key, label, and secret are required.');
  }

  try {
    const data = await createSyncConnection(auth.ctx.supabase, auth.ctx.userId, parsed.body);
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
    }, 201);
  } catch (err) {
    return errorResponse(
      `Failed to save provider connection: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}
