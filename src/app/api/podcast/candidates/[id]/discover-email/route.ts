import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { discoverEmail } from '@/lib/integrations/email-discovery';

type Params = { params: { id: string } };

/**
 * POST /api/podcast/candidates/[id]/discover-email
 * Use Hunter.io → Snov.io to find email for a candidate.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  // Load candidate
  const { data: candidate, error: candError } = await supabase
    .from('pga_candidates')
    .select('*')
    .eq('id', params.id)
    .single();

  if (candError || !candidate) {
    return errorResponse('Candidate not found', 404);
  }

  if (candidate.email && candidate.email_verified) {
    return successResponse({
      email: candidate.email,
      source: 'existing',
      confidence: 100,
      verified: true,
      message: 'Candidate already has a verified email.',
    });
  }

  // Discover email
  const result = await discoverEmail(supabase, {
    name: candidate.name,
    platform_presence: candidate.platform_presence as Record<string, string>,
  });

  if (result.email) {
    // Update candidate with found email
    await supabase
      .from('pga_candidates')
      .update({
        email: result.email,
        email_verified: result.verified,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id);
  } else {
    // No email found — update contact method
    await supabase
      .from('pga_candidates')
      .update({
        contact_method: 'linkedin_dm',
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id);
  }

  return successResponse({
    email: result.email,
    source: result.source,
    confidence: result.confidence,
    verified: result.verified,
    message: result.email
      ? `Found via ${result.source} (${result.confidence}% confidence)`
      : 'No email found — flagged for LinkedIn DM',
  });
}
