import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import type { PGACandidateStatus, PGAConfidence } from '@/lib/types';

/**
 * GET /api/podcast/candidates
 * List candidates with optional filters: status, confidence, search
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') as PGACandidateStatus | null;
  const confidence = searchParams.get('confidence') as PGAConfidence | null;
  const search = searchParams.get('search');
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  let query = supabase
    .from('pga_candidates')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const hasEmail = searchParams.get('has_email');

  if (status) query = query.eq('status', status);
  if (confidence) query = query.eq('scout_confidence', confidence);
  if (hasEmail === 'true') query = query.not('email', 'is', null);
  if (hasEmail === 'false') query = query.is('email', null);
  if (search) query = query.or(`name.ilike.%${search}%,one_liner.ilike.%${search}%,email.ilike.%${search}%`);

  const { data, error, count } = await query;
  if (error) return errorResponse(error.message, 500);

  return successResponse({ candidates: data, total: count });
}

/**
 * POST /api/podcast/candidates
 * Create a new candidate (manual add or from Scout agent)
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<{
    name: string;
    one_liner?: string;
    email?: string;
    platform_presence?: Record<string, string>;
    evidence_of_paid_work?: Array<{ project: string; description: string; url?: string }>;
    estimated_reach?: Record<string, number>;
    tools_used?: string[];
    contact_method?: string;
    scout_confidence?: PGAConfidence;
    source?: Record<string, string>;
    notes?: string;
  }>(request);
  if (!body.ok) return body.response;

  if (!body.body.name?.trim()) {
    return errorResponse('Name is required');
  }

  const { supabase } = auth.ctx;
  const { data, error } = await supabase
    .from('pga_candidates')
    .insert({
      name: body.body.name.trim(),
      one_liner: body.body.one_liner || null,
      email: body.body.email || null,
      platform_presence: body.body.platform_presence || {},
      evidence_of_paid_work: body.body.evidence_of_paid_work || [],
      estimated_reach: body.body.estimated_reach || {},
      tools_used: body.body.tools_used || [],
      contact_method: body.body.contact_method || 'email',
      scout_confidence: body.body.scout_confidence || null,
      source: body.body.source || {},
      notes: body.body.notes || null,
    })
    .select()
    .single();

  if (error) return errorResponse(error.message, 500);
  return successResponse(data, 201);
}
