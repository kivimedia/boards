import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Sub-task definitions for a PageForge build.
 * Each maps to a pipeline phase group.
 */
const BUILD_SUBTASKS = [
  { title: 'Pre-flight Check', phase: 'preflight', auto: true },
  { title: 'Page Construction', phase: 'markup_generation', auto: true },
  { title: 'Visual QA', phase: 'vqa_comparison', auto: true },
  { title: 'Functional Testing', phase: 'functional_qa', auto: true },
  { title: 'SEO Configuration', phase: 'seo_config', auto: true },
  { title: 'Developer Review', phase: 'developer_review_gate', auto: false },
  { title: 'AM Sign-off', phase: 'am_signoff_gate', auto: false },
];

/**
 * Create sub-task cards on a KM Board for a PageForge build.
 * Cards are created in the specified list with the build title as prefix.
 */
export async function createBuildSubTasks(
  supabase: SupabaseClient,
  opts: {
    buildId: string;
    pageTitle: string;
    listId: string;
    createdBy: string;
  }
): Promise<string[]> {
  const cardIds: string[] = [];

  for (let i = 0; i < BUILD_SUBTASKS.length; i++) {
    const subtask = BUILD_SUBTASKS[i];
    const title = `[PageForge] ${opts.pageTitle} - ${subtask.title}`;
    const description = subtask.auto
      ? `Auto-completes when the ${subtask.phase} phase finishes.`
      : `Requires manual action in the PageForge build detail page.`;

    // Get max position in the list
    const { data: maxPos } = await supabase
      .from('card_placements')
      .select('position')
      .eq('list_id', opts.listId)
      .order('position', { ascending: false })
      .limit(1)
      .single();

    const position = (maxPos?.position ?? -1) + 1;

    // Create the card
    const { data: card } = await supabase
      .from('cards')
      .insert({
        title,
        description,
        priority: 'none',
        created_by: opts.createdBy,
      })
      .select('id')
      .single();

    if (!card) continue;

    // Create placement
    await supabase
      .from('card_placements')
      .insert({
        card_id: card.id,
        list_id: opts.listId,
        position,
        is_mirror: false,
      });

    cardIds.push(card.id);
  }

  // Fetch current artifacts and merge board card IDs into them
  const { data: build } = await supabase
    .from('pageforge_builds')
    .select('artifacts')
    .eq('id', opts.buildId)
    .single();

  const artifacts = (build?.artifacts || {}) as Record<string, unknown>;
  artifacts.board_card_ids = cardIds;
  artifacts.board_subtask_map = BUILD_SUBTASKS.reduce((acc, st, idx) => {
    acc[st.phase] = cardIds[idx] || null;
    return acc;
  }, {} as Record<string, string | null>);

  await supabase
    .from('pageforge_builds')
    .update({ artifacts })
    .eq('id', opts.buildId);

  return cardIds;
}

/**
 * Mark a board sub-task card as complete by updating its title with a checkmark.
 * Called by the VPS worker when a phase completes.
 */
export async function markSubTaskComplete(
  supabase: SupabaseClient,
  buildId: string,
  phase: string
): Promise<void> {
  // Get the subtask map from build artifacts
  const { data: build } = await supabase
    .from('pageforge_builds')
    .select('artifacts')
    .eq('id', buildId)
    .single();

  const artifacts = (build?.artifacts || {}) as Record<string, unknown>;
  const subtaskMap = (artifacts.board_subtask_map || {}) as Record<string, string | null>;
  const cardId = subtaskMap[phase];

  if (!cardId) return;

  // Update card description to show completion
  const { data: card } = await supabase
    .from('cards')
    .select('title, description')
    .eq('id', cardId)
    .single();

  if (!card) return;

  const now = new Date().toISOString();
  await supabase
    .from('cards')
    .update({
      description: `${card.description}\n\nCompleted at ${now}`,
      updated_at: now,
    })
    .eq('id', cardId);
}
