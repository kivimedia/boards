import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { createVendorAccount, listVendorAccounts, type AIVendorAccountInput } from '@/lib/ai/ops-dashboard';

export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  try {
    const vendors = await listVendorAccounts(auth.ctx.supabase);
    return successResponse(vendors);
  } catch (err) {
    return errorResponse(
      `Failed to load vendor accounts: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}

export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<AIVendorAccountInput>(request);
  if (!parsed.ok) return parsed.response;

  if (!parsed.body.provider_name || !parsed.body.product_type || !parsed.body.category) {
    return errorResponse('provider_name, product_type, and category are required');
  }

  try {
    const vendor = await createVendorAccount(auth.ctx.supabase, auth.ctx.userId, parsed.body);
    return successResponse(vendor, 201);
  } catch (err) {
    return errorResponse(
      `Failed to create vendor account: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}
