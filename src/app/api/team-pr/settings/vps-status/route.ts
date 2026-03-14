import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

const VPS_PR_URL = process.env.VPS_PR_PIPELINE_URL || 'http://5.161.71.94:8400';

/**
 * GET /api/team-pr/settings/vps-status
 * Proxy health check to the VPS PR pipeline service.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`${VPS_PR_URL}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      return successResponse({ connected: true, url: VPS_PR_URL, ...data });
    }
    return successResponse({ connected: false, url: VPS_PR_URL, error: `HTTP ${res.status}` });
  } catch {
    return successResponse({ connected: false, url: VPS_PR_URL, error: 'unreachable' });
  }
}
