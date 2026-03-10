import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getOpsDashboardData } from '@/lib/ai/ops-dashboard';
import { getSyncCapabilities, listSyncConnections } from '@/lib/ai/ops-sync';

export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  try {
    const [data, connections] = await Promise.all([
      getOpsDashboardData(auth.ctx.supabase),
      listSyncConnections(auth.ctx.supabase),
    ]);

    return successResponse({
      ...data,
      connections: connections.map((connection) => ({
        id: connection.id,
        provider_key: connection.provider_key,
        connection_type: connection.connection_type,
        label: connection.label,
        config: connection.config ?? {},
        is_active: connection.is_active,
        last_tested_at: connection.last_tested_at,
        last_synced_at: connection.last_synced_at,
        last_sync_status: connection.last_sync_status,
        last_error: connection.last_error,
      })),
      capabilities: getSyncCapabilities(),
    });
  } catch (err) {
    return errorResponse(
      `Failed to load AI ops dashboard: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}
