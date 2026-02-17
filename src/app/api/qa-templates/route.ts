import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import type { QAChecklistItem } from '@/lib/types';

/**
 * GET /api/qa-templates
 * List all QA checklist templates.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from('qa_checklist_templates')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return errorResponse(`Failed to fetch QA templates: ${error.message}`, 500);
  }

  return successResponse(data ?? []);
}

interface CreateTemplateBody {
  name: string;
  description?: string;
  items: QAChecklistItem[];
}

/**
 * POST /api/qa-templates
 * Create a new QA checklist template.
 *
 * Body:
 *   name: string (required)
 *   description?: string
 *   items: QAChecklistItem[] (required)
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreateTemplateBody>(request);
  if (!body.ok) return body.response;

  const { name, description, items } = body.body;
  const { supabase, userId } = auth.ctx;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return errorResponse('name is required');
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return errorResponse('items must be a non-empty array of QAChecklistItem');
  }

  const { data, error } = await supabase
    .from('qa_checklist_templates')
    .insert({
      name: name.trim(),
      description: description?.trim() ?? null,
      items,
      is_default: false,
      created_by: userId,
    })
    .select()
    .single();

  if (error) {
    return errorResponse(`Failed to create QA template: ${error.message}`, 500);
  }

  return successResponse(data, 201);
}
