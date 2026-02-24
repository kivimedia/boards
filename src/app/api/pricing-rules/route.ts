import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from('pricing_rules')
    .select('*')
    .order('priority', { ascending: true });

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}

interface CreatePricingRuleBody {
  name: string;
  rule_type: string;
  conditions?: Record<string, unknown>;
  value: number;
  formula?: string | null;
  priority?: number;
  notes?: string | null;
}

export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreatePricingRuleBody>(request);
  if (!body.ok) return body.response;

  const { name, rule_type, value } = body.body;
  if (!name || !rule_type || value === undefined) {
    return errorResponse('name, rule_type, and value are required');
  }

  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from('pricing_rules')
    .insert({
      name,
      rule_type,
      conditions: body.body.conditions || {},
      value,
      formula: body.body.formula || null,
      priority: body.body.priority ?? 100,
      notes: body.body.notes || null,
      is_active: true,
    })
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}
