import { NextRequest } from 'next/server';
import { getAuthContext, errorResponse, parseBody } from '@/lib/api-helpers';
import { generateProposal } from '@/lib/ai/proposal-generator';

export const maxDuration = 120;

interface GenerateBody {
  card_id: string;
}

export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<GenerateBody>(request);
  if (!body.ok) return body.response;

  const { card_id } = body.body;
  if (!card_id) return errorResponse('card_id is required');

  const { supabase, userId } = auth.ctx;

  // Check if a draft already exists for this card
  const { data: existing } = await supabase
    .from('proposal_drafts')
    .select('id, status')
    .eq('card_id', card_id)
    .eq('status', 'draft')
    .limit(1)
    .single();

  if (existing) {
    return errorResponse('A draft proposal already exists for this card. Reject it first to generate a new one.', 409);
  }

  try {
    const proposal = await generateProposal(supabase, card_id, userId);

    if (!proposal) {
      return errorResponse('Failed to generate proposal. Check AI configuration and budget.', 500);
    }

    return new Response(JSON.stringify({ ok: true, data: proposal }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[ProposalGenerate] Error:', err);
    return errorResponse('Proposal generation failed', 500);
  }
}
