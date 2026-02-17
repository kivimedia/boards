import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { createWikiPage, getWikiPages } from '@/lib/wiki';
import type { BoardType } from '@/lib/types';

/**
 * GET /api/wiki
 * List wiki pages with optional filters: department, search, published, parentPageId.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { searchParams } = new URL(request.url);

  const department = searchParams.get('department') || undefined;
  const search = searchParams.get('search') || undefined;
  const publishedParam = searchParams.get('published');
  const published = publishedParam !== null ? publishedParam === 'true' : undefined;
  const parentPageId = searchParams.get('parentPageId') || undefined;

  const pages = await getWikiPages(supabase, {
    department,
    published,
    search,
    parentPageId,
  });

  return successResponse(pages);
}

interface CreateWikiPageBody {
  title: string;
  content?: string;
  department?: BoardType | 'general';
  tags?: string[];
  parentPageId?: string;
  reviewCadenceDays?: number;
}

/**
 * POST /api/wiki
 * Create a new wiki page.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<CreateWikiPageBody>(request);
  if (!parsed.ok) return parsed.response;

  const { title, content, department, tags, parentPageId, reviewCadenceDays } = parsed.body;

  if (!title?.trim()) return errorResponse('title is required');

  const { supabase, userId } = auth.ctx;

  const page = await createWikiPage(supabase, {
    title: title.trim(),
    content,
    department,
    ownerId: userId,
    tags,
    parentPageId,
    reviewCadenceDays,
  });

  if (!page) return errorResponse('Failed to create wiki page', 500);
  return successResponse(page, 201);
}
