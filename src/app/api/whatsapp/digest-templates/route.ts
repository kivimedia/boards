import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getDigestTemplates, createDigestTemplate } from '@/lib/whatsapp-advanced';
import type { DigestSection } from '@/lib/types';

/**
 * GET /api/whatsapp/digest-templates
 * List the current user's digest templates.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  try {
    const templates = await getDigestTemplates(supabase, userId);
    return successResponse(templates);
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : 'Failed to load digest templates',
      500
    );
  }
}

interface CreateDigestTemplateBody {
  name: string;
  sections: DigestSection[];
  is_default?: boolean;
}

/**
 * POST /api/whatsapp/digest-templates
 * Create a new digest template.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<CreateDigestTemplateBody>(request);
  if (!parsed.ok) return parsed.response;

  const { name, sections, is_default } = parsed.body;

  if (!name?.trim()) return errorResponse('name is required');
  if (!sections || !Array.isArray(sections)) return errorResponse('sections array is required');

  const { supabase, userId } = auth.ctx;

  const template = await createDigestTemplate(supabase, {
    userId,
    name: name.trim(),
    sections,
    isDefault: is_default,
  });

  if (!template) return errorResponse('Failed to create digest template', 500);
  return successResponse(template, 201);
}
