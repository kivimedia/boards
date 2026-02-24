import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from('product_catalog')
    .select('*')
    .order('category')
    .order('name');

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}

interface CreateProductBody {
  name: string;
  category: string;
  base_price?: number | null;
  size_variants?: Record<string, unknown> | null;
  color_options?: Record<string, unknown> | null;
  notes?: string | null;
}

export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreateProductBody>(request);
  if (!body.ok) return body.response;

  const { name, category } = body.body;
  if (!name || !category) return errorResponse('name and category are required');

  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from('product_catalog')
    .insert({
      name,
      category,
      base_price: body.body.base_price ?? null,
      size_variants: body.body.size_variants ?? null,
      color_options: body.body.color_options ?? null,
      notes: body.body.notes ?? null,
      is_active: true,
      frequency_count: 0,
    })
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}
