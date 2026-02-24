import { SupabaseClient } from '@supabase/supabase-js';


/**
 * Stub -- client brain was removed during the Carolina Balloons HQ pivot.
 * This export satisfies the import in api/chat/stream/route.ts.
 */

interface BrainQuery {
  clientId: string;
  userId: string;
  query: string;
}

interface BrainResult {
  response: string;
  sources: { title: string; similarity: number }[];
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
}

export async function queryClientBrain(
  _supabase: SupabaseClient,
  _params: BrainQuery
): Promise<BrainResult> {
  return {
    response: 'Client brain is not available in this build.',
    sources: [],
    modelUsed: 'none',
    inputTokens: 0,
    outputTokens: 0,
  };
}
