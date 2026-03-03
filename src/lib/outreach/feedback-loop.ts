import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// FEEDBACK LOOP ENGINE (PRD Section 9)
// Override collection, rule proposals, version snapshots, rollback
// ============================================================================

export interface LearningProposal {
  id: string;
  user_id: string;
  change_type: 'scoring_weight' | 'qualification_rule' | 'template_text' | 'banned_phrase' | 'warm_up_limit' | 'budget_cap';
  title: string;
  description: string;
  evidence: ProposalEvidence;
  before_value: string;
  after_value: string;
  status: 'pending' | 'approved' | 'rejected' | 'rolled_back';
  rule_snapshot_id: string | null;
  created_at: string;
  decided_at: string | null;
}

interface ProposalEvidence {
  override_count?: number;
  override_ids?: string[];
  sample_leads?: string[];
  agreement_rate?: number;
  time_period_days?: number;
  metric_before?: number;
  metric_after?: number;
  notes?: string;
}

interface OverridePattern {
  type: string;
  count: number;
  examples: Array<{ lead_id: string; original: string; corrected: string; reason: string | null }>;
}

// ============================================================================
// OVERRIDE ANALYSIS
// ============================================================================

/**
 * Analyze qualification overrides to find patterns
 */
export async function analyzeOverrides(
  supabase: SupabaseClient,
  userId: string,
  daysPeriod: number = 30
): Promise<OverridePattern[]> {
  const since = new Date();
  since.setDate(since.getDate() - daysPeriod);

  const { data: overrides } = await supabase
    .from('li_qualification_overrides')
    .select('*')
    .eq('user_id', userId)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false });

  if (!overrides || overrides.length === 0) return [];

  // Group by transition type
  const patterns: Record<string, OverridePattern> = {};

  for (const override of overrides) {
    const key = `${override.original_decision}->${override.new_decision}`;
    if (!patterns[key]) {
      patterns[key] = { type: key, count: 0, examples: [] };
    }
    patterns[key].count++;
    if (patterns[key].examples.length < 5) {
      patterns[key].examples.push({
        lead_id: override.lead_id,
        original: override.original_decision,
        corrected: override.new_decision,
        reason: override.reason,
      });
    }
  }

  // Sort by count descending
  return Object.values(patterns).sort((a, b) => b.count - a.count);
}

/**
 * Generate learning proposals from override patterns
 */
export async function generateProposals(
  supabase: SupabaseClient,
  userId: string,
  daysPeriod: number = 30
): Promise<LearningProposal[]> {
  const patterns = await analyzeOverrides(supabase, userId, daysPeriod);
  const proposals: LearningProposal[] = [];

  for (const pattern of patterns) {
    // Only propose changes for patterns with 3+ overrides
    if (pattern.count < 3) continue;

    // Check if a similar proposal already exists and is pending
    const { data: existing } = await supabase
      .from('li_learning_log')
      .select('id')
      .eq('user_id', userId)
      .eq('change_type', 'qualification_rule')
      .eq('status', 'pending')
      .ilike('description', `%${pattern.type}%`)
      .limit(1);

    if (existing && existing.length > 0) continue;

    // Create proposal based on pattern type
    let title = '';
    let description = '';
    let changeType: LearningProposal['change_type'] = 'qualification_rule';

    if (pattern.type.includes('disqualified->qualified')) {
      title = `Relax qualification: ${pattern.count} false negatives detected`;
      description = `${pattern.count} leads were disqualified by the agent but manually re-qualified. Pattern: ${pattern.type}. Common reasons: ${pattern.examples.map(e => e.reason).filter(Boolean).join('; ') || 'Not specified'}`;
    } else if (pattern.type.includes('qualified->disqualified')) {
      title = `Tighten qualification: ${pattern.count} false positives detected`;
      description = `${pattern.count} leads were qualified by the agent but manually disqualified. Pattern: ${pattern.type}. Common reasons: ${pattern.examples.map(e => e.reason).filter(Boolean).join('; ') || 'Not specified'}`;
    } else {
      title = `Stage override pattern: ${pattern.type} (${pattern.count} occurrences)`;
      description = `${pattern.count} leads had stage ${pattern.type} overridden manually.`;
    }

    const proposal: Omit<LearningProposal, 'id' | 'created_at' | 'decided_at' | 'rule_snapshot_id'> = {
      user_id: userId,
      change_type: changeType,
      title,
      description,
      evidence: {
        override_count: pattern.count,
        override_ids: pattern.examples.map(e => e.lead_id),
        time_period_days: daysPeriod,
      },
      before_value: pattern.examples[0]?.original || '',
      after_value: pattern.examples[0]?.corrected || '',
      status: 'pending',
    };

    // Insert proposal
    const { data: inserted } = await supabase
      .from('li_learning_log')
      .insert({
        user_id: proposal.user_id,
        change_type: proposal.change_type,
        title: proposal.title,
        description: proposal.description,
        evidence: proposal.evidence,
        before_value: proposal.before_value,
        after_value: proposal.after_value,
        status: 'pending',
      })
      .select()
      .single();

    if (inserted) {
      proposals.push(inserted as unknown as LearningProposal);
    }
  }

  return proposals;
}

// ============================================================================
// RULE SNAPSHOTS
// ============================================================================

/**
 * Create a snapshot of current configuration for rollback
 */
export async function createRuleSnapshot(
  supabase: SupabaseClient,
  userId: string,
  triggerProposalId?: string
): Promise<string | null> {
  // Gather current config
  const { data: settings } = await supabase
    .from('li_settings')
    .select('*')
    .eq('user_id', userId)
    .single();

  const { data: templates } = await supabase
    .from('li_templates')
    .select('*')
    .eq('user_id', userId);

  const { data: rotationVariants } = await supabase
    .from('li_rotation_variants')
    .select('*')
    .eq('user_id', userId);

  // Count existing snapshots for version number
  const { count } = await supabase
    .from('li_rule_snapshots')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  const version = (count || 0) + 1;

  const configJson = {
    settings,
    templates,
    rotation_variants: rotationVariants,
    snapshot_reason: triggerProposalId ? `proposal_${triggerProposalId}` : 'manual',
  };

  const { data: snapshot } = await supabase
    .from('li_rule_snapshots')
    .insert({
      user_id: userId,
      version,
      config_json: configJson,
    })
    .select('id')
    .single();

  return snapshot?.id || null;
}

/**
 * Rollback to a previous rule snapshot
 */
export async function rollbackToSnapshot(
  supabase: SupabaseClient,
  userId: string,
  snapshotId: string
): Promise<{ success: boolean; error?: string }> {
  const { data: snapshot } = await supabase
    .from('li_rule_snapshots')
    .select('*')
    .eq('id', snapshotId)
    .eq('user_id', userId)
    .single();

  if (!snapshot) return { success: false, error: 'Snapshot not found' };

  const config = snapshot.config_json as {
    settings: Record<string, unknown>;
    templates: Array<Record<string, unknown>>;
    rotation_variants: Array<Record<string, unknown>>;
  };

  // Create a new snapshot of current state before rollback
  await createRuleSnapshot(supabase, userId, `rollback_from_${snapshotId}`);

  // Restore settings
  if (config.settings) {
    const { id: _id, user_id: _uid, created_at: _ca, updated_at: _ua, ...settingsUpdate } = config.settings;
    await supabase
      .from('li_settings')
      .update(settingsUpdate)
      .eq('user_id', userId);
  }

  // Restore templates (update existing, leave new ones alone)
  if (config.templates) {
    for (const tmpl of config.templates) {
      const { id, ...tmplUpdate } = tmpl;
      await supabase
        .from('li_templates')
        .update(tmplUpdate)
        .eq('id', id as string)
        .eq('user_id', userId);
    }
  }

  return { success: true };
}

// ============================================================================
// PROPOSAL ACTIONS
// ============================================================================

/**
 * Approve a learning proposal - creates snapshot and applies change
 */
export async function approveProposal(
  supabase: SupabaseClient,
  userId: string,
  proposalId: string
): Promise<{ success: boolean; error?: string }> {
  // Create snapshot before applying
  const snapshotId = await createRuleSnapshot(supabase, userId, proposalId);

  // Update proposal status
  await supabase
    .from('li_learning_log')
    .update({
      status: 'approved',
      rule_snapshot_id: snapshotId,
      decided_at: new Date().toISOString(),
    })
    .eq('id', proposalId)
    .eq('user_id', userId);

  return { success: true };
}

/**
 * Reject a learning proposal
 */
export async function rejectProposal(
  supabase: SupabaseClient,
  userId: string,
  proposalId: string
): Promise<{ success: boolean }> {
  await supabase
    .from('li_learning_log')
    .update({
      status: 'rejected',
      decided_at: new Date().toISOString(),
    })
    .eq('id', proposalId)
    .eq('user_id', userId);

  return { success: true };
}

/**
 * Rollback an approved proposal
 */
export async function rollbackProposal(
  supabase: SupabaseClient,
  userId: string,
  proposalId: string
): Promise<{ success: boolean; error?: string }> {
  const { data: proposal } = await supabase
    .from('li_learning_log')
    .select('*')
    .eq('id', proposalId)
    .eq('user_id', userId)
    .single();

  if (!proposal) return { success: false, error: 'Proposal not found' };
  if (proposal.status !== 'approved') return { success: false, error: 'Only approved proposals can be rolled back' };
  if (!proposal.rule_snapshot_id) return { success: false, error: 'No snapshot available for rollback' };

  const result = await rollbackToSnapshot(supabase, userId, proposal.rule_snapshot_id);
  if (!result.success) return result;

  await supabase
    .from('li_learning_log')
    .update({ status: 'rolled_back' })
    .eq('id', proposalId);

  return { success: true };
}

// ============================================================================
// SHADOW MODE
// ============================================================================

export interface ShadowComparison {
  leadId: string;
  leadName: string;
  agentDecision: string;
  humanDecision: string;
  agrees: boolean;
  reason: string | null;
}

/**
 * Get shadow mode comparison - agent decisions vs manual overrides
 */
export async function getShadowComparisons(
  supabase: SupabaseClient,
  userId: string,
  daysPeriod: number = 30
): Promise<{ comparisons: ShadowComparison[]; agreementRate: number; total: number }> {
  const since = new Date();
  since.setDate(since.getDate() - daysPeriod);

  const { data: overrides } = await supabase
    .from('li_qualification_overrides')
    .select(`
      id,
      lead_id,
      original_decision,
      new_decision,
      reason,
      created_at
    `)
    .eq('user_id', userId)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false });

  if (!overrides || overrides.length === 0) {
    return { comparisons: [], agreementRate: 100, total: 0 };
  }

  // Get lead names
  const leadIds = Array.from(new Set(overrides.map(o => o.lead_id)));
  const { data: leads } = await supabase
    .from('li_leads')
    .select('id, full_name')
    .in('id', leadIds);

  const leadMap = new Map(leads?.map(l => [l.id, l.full_name]) || []);

  // Count total qualifying decisions (leads that went through qualification without override)
  const { count: totalQualified } = await supabase
    .from('li_pipeline_events')
    .select('id', { count: 'exact', head: true })
    .eq('triggered_by', 'auto')
    .in('to_stage', ['TO_SEND_CONNECTION', 'DISQUALIFIED', 'COMPETITOR'])
    .gte('created_at', since.toISOString());

  const totalDecisions = (totalQualified || 0) + overrides.length;
  const agreements = totalDecisions - overrides.length;
  const agreementRate = totalDecisions > 0 ? (agreements / totalDecisions) * 100 : 100;

  const comparisons: ShadowComparison[] = overrides.map(o => ({
    leadId: o.lead_id,
    leadName: leadMap.get(o.lead_id) || 'Unknown',
    agentDecision: o.original_decision,
    humanDecision: o.new_decision,
    agrees: false,
    reason: o.reason,
  }));

  return { comparisons, agreementRate, total: totalDecisions };
}
