import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

interface Params {
  params: { exportId: string };
}

/**
 * GET /api/revision-exports/:exportId
 * Get a single revision export record with download URL.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const exportId = params.exportId;

  try {
    const { data, error } = await supabase
      .from('revision_report_exports')
      .select('*')
      .eq('id', exportId)
      .single();

    if (error || !data) {
      return errorResponse('Export not found', 404);
    }

    // Generate a signed download URL if the export is completed and has a storage path
    let download_url: string | null = null;
    if (data.status === 'completed' && data.storage_path) {
      const { data: signedData } = await supabase.storage
        .from('revision-exports')
        .createSignedUrl(data.storage_path, 3600); // 1 hour expiry

      download_url = signedData?.signedUrl ?? null;
    }

    return successResponse({ ...data, download_url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch export';
    return errorResponse(message, 500);
  }
}
