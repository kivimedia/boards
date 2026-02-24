import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

interface Params {
  params: { id: string };
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<Record<string, unknown>>(request);
  if (!body.ok) return body.response;

  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from('product_catalog')
    .update(body.body)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const { error } = await supabase
    .from('product_catalog')
    .delete()
    .eq('id', params.id);

  if (error) return errorResponse(error.message, 500);
  return successResponse({ deleted: true });
}
