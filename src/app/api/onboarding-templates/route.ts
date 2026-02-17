import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import type { OnboardingTemplateItem } from '@/lib/types';

/**
 * GET /api/onboarding-templates
 * List all onboarding templates.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from('onboarding_templates')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}

interface CreateTemplateBody {
  name: string;
  description?: string;
  template_data: OnboardingTemplateItem[];
}

/**
 * POST /api/onboarding-templates
 * Create an onboarding template.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreateTemplateBody>(request);
  if (!body.ok) return body.response;

  const { name, description, template_data } = body.body;

  if (!name?.trim()) return errorResponse('Template name is required');
  if (!template_data || !Array.isArray(template_data) || template_data.length === 0) {
    return errorResponse('template_data must be a non-empty array');
  }

  const { supabase, userId } = auth.ctx;

  const { data, error } = await supabase
    .from('onboarding_templates')
    .insert({
      name: name.trim(),
      description: description?.trim() || null,
      template_data,
      is_active: true,
      created_by: userId,
    })
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data, 201);
}
