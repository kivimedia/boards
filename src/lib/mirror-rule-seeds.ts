/**
 * Default mirror rules for Carolina Balloons HQ.
 *
 * These represent the 5 core cross-board workflows between
 * the Owner Dashboard and VA Workspace.
 *
 * Call seedDefaultMirrorRules() from the settings UI to bootstrap these.
 * The function is idempotent — it won't create duplicates.
 */

import { SupabaseClient } from '@supabase/supabase-js';

interface SeedRule {
  sourceBoardType: string;
  sourceListName: string;
  targetBoardType: string;
  targetListName: string;
  direction: 'one_way' | 'bidirectional';
  removeFromSource: boolean;
  label: string; // human-readable description
}

const DEFAULT_RULES: SeedRule[] = [
  {
    label: 'VA → Owner: Halley Needs to Review',
    sourceBoardType: 'va_workspace',
    sourceListName: 'Halley Needs to Review',
    targetBoardType: 'owner_dashboard',
    targetListName: 'Halley Needs to Review',
    direction: 'one_way',
    removeFromSource: false,
  },
  {
    label: 'Owner → VA: Approved → Ready to Send',
    sourceBoardType: 'owner_dashboard',
    sourceListName: 'Approved',
    targetBoardType: 'va_workspace',
    targetListName: 'Ready to Send',
    direction: 'one_way',
    removeFromSource: false,
  },
  {
    label: 'Owner → VA: Tiffany Follow-Up Call List',
    sourceBoardType: 'owner_dashboard',
    sourceListName: 'Tiffany Follow-Up Call List',
    targetBoardType: 'va_workspace',
    targetListName: 'Halley Wants You to Call',
    direction: 'one_way',
    removeFromSource: false,
  },
  {
    label: "VA → Owner: Tiffany's Questions",
    sourceBoardType: 'va_workspace',
    sourceListName: "Tiffany's Questions",
    targetBoardType: 'owner_dashboard',
    targetListName: "Tiffany's Questions",
    direction: 'one_way',
    removeFromSource: false,
  },
  {
    label: 'VA → Owner: Send to Halley for Invoice',
    sourceBoardType: 'va_workspace',
    sourceListName: 'Send to Halley for Invoice',
    targetBoardType: 'owner_dashboard',
    targetListName: 'Needs Invoice',
    direction: 'one_way',
    removeFromSource: false,
  },
];

/**
 * Seed the default mirror rules.
 *
 * Resolves board types to actual board IDs, then creates mirror_rules rows.
 * Idempotent: skips rules where source_board + source_list + target_board + target_list already exist.
 *
 * @returns Number of rules created (0 if all already existed).
 */
export async function seedDefaultMirrorRules(
  supabase: SupabaseClient,
): Promise<{ created: number; skipped: number; errors: string[] }> {
  const errors: string[] = [];
  let created = 0;
  let skipped = 0;

  // Fetch all boards to resolve types → IDs
  const { data: boards } = await supabase
    .from('boards')
    .select('id, type')
    .order('created_at', { ascending: true });

  if (!boards || boards.length === 0) {
    return { created: 0, skipped: 0, errors: ['No boards found'] };
  }

  // Build a map of board_type → board_id (first match wins)
  const boardByType = new Map<string, string>();
  for (const board of boards) {
    if (!boardByType.has(board.type)) {
      boardByType.set(board.type, board.id);
    }
  }

  for (const seed of DEFAULT_RULES) {
    const sourceBoardId = boardByType.get(seed.sourceBoardType);
    const targetBoardId = boardByType.get(seed.targetBoardType);

    if (!sourceBoardId) {
      errors.push(`No board found for type "${seed.sourceBoardType}" (rule: ${seed.label})`);
      skipped++;
      continue;
    }
    if (!targetBoardId) {
      errors.push(`No board found for type "${seed.targetBoardType}" (rule: ${seed.label})`);
      skipped++;
      continue;
    }

    // Check if rule already exists
    const { data: existing } = await supabase
      .from('mirror_rules')
      .select('id')
      .eq('source_board_id', sourceBoardId)
      .eq('source_list_name', seed.sourceListName)
      .eq('target_board_id', targetBoardId)
      .eq('target_list_name', seed.targetListName)
      .limit(1)
      .single();

    if (existing) {
      skipped++;
      continue;
    }

    const { error } = await supabase
      .from('mirror_rules')
      .insert({
        source_board_id: sourceBoardId,
        source_list_name: seed.sourceListName,
        target_board_id: targetBoardId,
        target_list_name: seed.targetListName,
        direction: seed.direction,
        remove_from_source: seed.removeFromSource,
        is_active: true,
      });

    if (error) {
      errors.push(`Failed to create rule "${seed.label}": ${error.message}`);
    } else {
      created++;
    }
  }

  return { created, skipped, errors };
}
