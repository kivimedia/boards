import type { SupabaseClient } from '@supabase/supabase-js';
import type { LIABTest } from '@/lib/types';

// ============================================================================
// A/B TEST ENGINE (PRD Section 8.5)
// Two-proportion z-test, 90% confidence, 75 min sample, 2-week confirmation
// ============================================================================

const MIN_SAMPLE_SIZE = 75;
const CONFIDENCE_THRESHOLD = 0.90;
const P_VALUE_THRESHOLD = 0.10; // 1 - confidence
const CONSECUTIVE_WINS_REQUIRED = 2; // 2-week confirmation
const EVALUATION_INTERVAL_DAYS = 7; // Weekly evaluation

// ============================================================================
// STATISTICAL FUNCTIONS
// ============================================================================

/**
 * Standard normal CDF approximation (Abramowitz and Stegun)
 */
function normalCDF(z: number): number {
  if (z < -8) return 0;
  if (z > 8) return 1;

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Two-proportion z-test
 * Returns { z, pValue, significant }
 */
export function twoProportionZTest(
  successA: number,
  totalA: number,
  successB: number,
  totalB: number
): { z: number; pValue: number; significant: boolean; rateA: number; rateB: number } {
  if (totalA === 0 || totalB === 0) {
    return { z: 0, pValue: 1, significant: false, rateA: 0, rateB: 0 };
  }

  const rateA = successA / totalA;
  const rateB = successB / totalB;

  // Pooled proportion
  const pooled = (successA + successB) / (totalA + totalB);

  // Standard error
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / totalA + 1 / totalB));

  if (se === 0) {
    return { z: 0, pValue: 1, significant: false, rateA, rateB };
  }

  // Z-statistic
  const z = (rateA - rateB) / se;

  // Two-tailed p-value
  const pValue = 2 * (1 - normalCDF(Math.abs(z)));

  return {
    z,
    pValue,
    significant: pValue < P_VALUE_THRESHOLD,
    rateA,
    rateB,
  };
}

/**
 * Wilson score confidence interval for a proportion
 */
export function wilsonCI(
  successes: number,
  total: number,
  confidence: number = CONFIDENCE_THRESHOLD
): { lower: number; upper: number; center: number } {
  if (total === 0) return { lower: 0, upper: 0, center: 0 };

  // Z-score for confidence level (two-tailed)
  // For 90% confidence, z ~= 1.645
  const zMap: Record<number, number> = { 0.90: 1.645, 0.95: 1.96, 0.99: 2.576 };
  const z = zMap[confidence] || 1.645;

  const p = successes / total;
  const denominator = 1 + z * z / total;
  const center = (p + z * z / (2 * total)) / denominator;
  const margin = (z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total))) / denominator;

  return {
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
    center,
  };
}

// ============================================================================
// A/B TEST EVALUATION
// ============================================================================

export interface ABTestEvaluation {
  testId: string;
  templateNumber: number;
  sampleA: number;
  sampleB: number;
  rateA: number;
  rateB: number;
  pValue: number;
  significant: boolean;
  ciA: { lower: number; upper: number };
  ciB: { lower: number; upper: number };
  winner: 'A' | 'B' | null;
  status: LIABTest['status'];
  insufficientData: boolean;
  consecutiveWins: number;
  lift: number | null; // percentage improvement of winner over loser
}

/**
 * Evaluate a single A/B test
 */
export function evaluateTest(test: LIABTest): ABTestEvaluation {
  const insufficientData = test.sample_a < MIN_SAMPLE_SIZE || test.sample_b < MIN_SAMPLE_SIZE;

  const result = twoProportionZTest(
    test.conversions_a,
    test.sample_a,
    test.conversions_b,
    test.sample_b
  );

  const ciA = wilsonCI(test.conversions_a, test.sample_a);
  const ciB = wilsonCI(test.conversions_b, test.sample_b);

  let winner: 'A' | 'B' | null = null;
  let lift: number | null = null;

  if (!insufficientData && result.significant) {
    winner = result.rateA > result.rateB ? 'A' : 'B';
    const winnerRate = winner === 'A' ? result.rateA : result.rateB;
    const loserRate = winner === 'A' ? result.rateB : result.rateA;
    lift = loserRate > 0 ? ((winnerRate - loserRate) / loserRate) * 100 : null;
  }

  // Determine consecutive wins
  let consecutiveWins = test.consecutive_wins;
  const previousWinner = test.status === 'winner_a' ? 'A' : test.status === 'winner_b' ? 'B' : null;

  if (winner && winner === previousWinner) {
    consecutiveWins = test.consecutive_wins + 1;
  } else if (winner) {
    consecutiveWins = 1;
  } else {
    consecutiveWins = 0;
  }

  // Determine final status
  let status: LIABTest['status'];
  if (insufficientData) {
    status = 'insufficient_data';
  } else if (winner === 'A' && consecutiveWins >= CONSECUTIVE_WINS_REQUIRED) {
    status = 'winner_a';
  } else if (winner === 'B' && consecutiveWins >= CONSECUTIVE_WINS_REQUIRED) {
    status = 'winner_b';
  } else if (!result.significant && test.sample_a >= MIN_SAMPLE_SIZE * 3 && test.sample_b >= MIN_SAMPLE_SIZE * 3) {
    // If we have 3x min sample and still no significance, call it no winner
    status = 'no_winner';
  } else {
    status = 'running';
  }

  return {
    testId: test.id,
    templateNumber: test.template_number,
    sampleA: test.sample_a,
    sampleB: test.sample_b,
    rateA: result.rateA,
    rateB: result.rateB,
    pValue: result.pValue,
    significant: result.significant,
    ciA: { lower: ciA.lower, upper: ciA.upper },
    ciB: { lower: ciB.lower, upper: ciB.upper },
    winner,
    status,
    insufficientData,
    consecutiveWins,
    lift,
  };
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

/**
 * Collect conversion data from outreach messages for an A/B test
 */
export async function collectTestData(
  supabase: SupabaseClient,
  test: LIABTest
): Promise<{ sampleA: number; sampleB: number; conversionsA: number; conversionsB: number }> {
  // Count messages sent per variant
  const { data: variantACounts } = await supabase
    .from('li_outreach_messages')
    .select('id, lead_id', { count: 'exact' })
    .eq('template_id', test.variant_a_id)
    .eq('status', 'sent');

  const { data: variantBCounts } = await supabase
    .from('li_outreach_messages')
    .select('id, lead_id', { count: 'exact' })
    .eq('template_id', test.variant_b_id)
    .eq('status', 'sent');

  const sampleA = variantACounts?.length || 0;
  const sampleB = variantBCounts?.length || 0;

  // Count conversions (leads that progressed to a positive stage after receiving the message)
  const positiveStages = ['CONNECTED', 'REPLIED', 'BOOKED'];

  let conversionsA = 0;
  if (variantACounts && variantACounts.length > 0) {
    const leadIds = variantACounts.map(m => m.lead_id);
    const { count } = await supabase
      .from('li_leads')
      .select('id', { count: 'exact', head: true })
      .in('id', leadIds)
      .in('pipeline_stage', positiveStages);
    conversionsA = count || 0;
  }

  let conversionsB = 0;
  if (variantBCounts && variantBCounts.length > 0) {
    const leadIds = variantBCounts.map(m => m.lead_id);
    const { count } = await supabase
      .from('li_leads')
      .select('id', { count: 'exact', head: true })
      .in('id', leadIds)
      .in('pipeline_stage', positiveStages);
    conversionsB = count || 0;
  }

  return { sampleA, sampleB, conversionsA, conversionsB };
}

/**
 * Run weekly A/B test evaluation for all running tests
 */
export async function evaluateAllTests(
  supabase: SupabaseClient,
  userId: string
): Promise<ABTestEvaluation[]> {
  const { data: tests } = await supabase
    .from('li_ab_tests')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['running', 'insufficient_data'])
    .order('started_at', { ascending: true });

  if (!tests || tests.length === 0) return [];

  const results: ABTestEvaluation[] = [];

  for (const test of tests) {
    // Skip if evaluated too recently
    if (test.last_evaluated_at) {
      const lastEval = new Date(test.last_evaluated_at);
      const daysSince = (Date.now() - lastEval.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < EVALUATION_INTERVAL_DAYS) continue;
    }

    // Collect fresh data
    const data = await collectTestData(supabase, test);

    // Update test with new data
    const updatedTest: LIABTest = {
      ...test,
      sample_a: data.sampleA,
      sample_b: data.sampleB,
      conversions_a: data.conversionsA,
      conversions_b: data.conversionsB,
      rate_a: data.sampleA > 0 ? data.conversionsA / data.sampleA : 0,
      rate_b: data.sampleB > 0 ? data.conversionsB / data.sampleB : 0,
    };

    // Evaluate
    const evaluation = evaluateTest(updatedTest);
    results.push(evaluation);

    // Persist results
    const updatePayload: Record<string, unknown> = {
      sample_a: data.sampleA,
      sample_b: data.sampleB,
      conversions_a: data.conversionsA,
      conversions_b: data.conversionsB,
      rate_a: updatedTest.rate_a,
      rate_b: updatedTest.rate_b,
      p_value: evaluation.pValue,
      confidence_met: evaluation.significant,
      consecutive_wins: evaluation.consecutiveWins,
      status: evaluation.status,
      last_evaluated_at: new Date().toISOString(),
    };

    if (evaluation.status !== 'running' && evaluation.status !== 'insufficient_data') {
      updatePayload.completed_at = new Date().toISOString();
    }

    await supabase
      .from('li_ab_tests')
      .update(updatePayload)
      .eq('id', test.id);
  }

  return results;
}

/**
 * Create a new A/B test for a template stage
 */
export async function createABTest(
  supabase: SupabaseClient,
  userId: string,
  templateNumber: number,
  templateStage: string
): Promise<{ success: boolean; test?: LIABTest; error?: string }> {
  // Check for existing running test on same template
  const { data: existing } = await supabase
    .from('li_ab_tests')
    .select('id')
    .eq('user_id', userId)
    .eq('template_number', templateNumber)
    .in('status', ['running', 'insufficient_data'])
    .limit(1);

  if (existing && existing.length > 0) {
    return { success: false, error: `A/B test already running for template ${templateNumber}` };
  }

  // Get variant A and B template IDs
  const { data: templates } = await supabase
    .from('li_templates')
    .select('id, variant')
    .eq('user_id', userId)
    .eq('template_number', templateNumber)
    .eq('is_active', true);

  const variantA = templates?.find(t => t.variant === 'A');
  const variantB = templates?.find(t => t.variant === 'B');

  if (!variantA || !variantB) {
    return { success: false, error: 'Both variant A and B templates must exist and be active' };
  }

  const { data: test, error } = await supabase
    .from('li_ab_tests')
    .insert({
      user_id: userId,
      template_number: templateNumber,
      template_stage: templateStage,
      variant_a_id: variantA.id,
      variant_b_id: variantB.id,
      sample_a: 0,
      sample_b: 0,
      conversions_a: 0,
      conversions_b: 0,
      rate_a: 0,
      rate_b: 0,
      p_value: null,
      confidence_met: false,
      consecutive_wins: 0,
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, test };
}

/**
 * Get all A/B tests with evaluation data for display
 */
export async function getTestsWithEvaluations(
  supabase: SupabaseClient,
  userId: string
): Promise<(LIABTest & { evaluation: ABTestEvaluation })[]> {
  const { data: tests } = await supabase
    .from('li_ab_tests')
    .select('*')
    .eq('user_id', userId)
    .order('started_at', { ascending: false });

  if (!tests) return [];

  return tests.map(test => ({
    ...test,
    evaluation: evaluateTest(test),
  }));
}
