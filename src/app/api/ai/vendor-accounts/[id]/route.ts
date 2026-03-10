import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { updateVendorAccount, type AIVendorAccountInput } from '@/lib/ai/ops-dashboard';

type RouteContext = {
  params: { id: string };
};

export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<Partial<AIVendorAccountInput>>(request);
  if (!parsed.ok) return parsed.response;

  try {
    const vendor = await updateVendorAccount(auth.ctx.supabase, params.id, parsed.body);
    return successResponse(vendor);
  } catch (err) {
    return errorResponse(
      `Failed to update vendor account: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}
