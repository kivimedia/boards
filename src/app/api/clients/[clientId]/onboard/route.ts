import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { createNotification } from '@/lib/notification-service';
import type { OnboardingTemplateItem } from '@/lib/types';

interface Params {
  params: { clientId: string };
}

interface OnboardBody {
  template_id: string;
}

/**
 * POST /api/clients/[clientId]/onboard
 * Execute an onboarding template for a client.
 * Creates cards across multiple boards based on the template_data items.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<OnboardBody>(request);
  if (!body.ok) return body.response;

  const { template_id } = body.body;
  if (!template_id) return errorResponse('template_id is required');

  const { supabase, userId } = auth.ctx;
  const { clientId } = params;

  // 1. Fetch the client
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .single();

  if (clientError || !client) return errorResponse('Client not found', 404);

  // 2. Fetch the template
  const { data: template, error: templateError } = await supabase
    .from('onboarding_templates')
    .select('*')
    .eq('id', template_id)
    .single();

  if (templateError || !template) return errorResponse('Template not found', 404);

  const templateItems = template.template_data as OnboardingTemplateItem[];
  if (!Array.isArray(templateItems) || templateItems.length === 0) {
    return errorResponse('Template has no items');
  }

  // 3. Fetch all boards (to look up by board_type)
  const { data: boards, error: boardsError } = await supabase
    .from('boards')
    .select('id, name, type');

  if (boardsError || !boards) return errorResponse('Failed to fetch boards', 500);

  // 4. Fetch all lists for relevant boards
  const boardIds = boards.map((b: { id: string }) => b.id);
  const { data: allLists, error: listsError } = await supabase
    .from('lists')
    .select('id, board_id, name, position')
    .in('board_id', boardIds);

  if (listsError) return errorResponse('Failed to fetch lists', 500);

  const clientName = client.name as string;

  // Track created card IDs, indexed by template item index
  const createdCardIds: string[] = [];
  const errors: string[] = [];

  // 5. Create cards for each template item
  for (let i = 0; i < templateItems.length; i++) {
    const item = templateItems[i];

    // a. Find a board of the specified board_type
    const board = boards.find((b: { type: string }) => b.type === item.board_type);
    if (!board) {
      errors.push(`No board found for type "${item.board_type}" (item ${i})`);
      createdCardIds.push('');
      continue;
    }

    // b. Find the target list by name on that board
    const targetList = (allLists || []).find(
      (l: { board_id: string; name: string }) =>
        l.board_id === board.id && l.name === item.list_name
    );
    if (!targetList) {
      errors.push(`No list "${item.list_name}" found on board "${board.name}" (item ${i})`);
      createdCardIds.push('');
      continue;
    }

    // c. Create a card with the title (replace {client_name})
    const cardTitle = item.title.replace(/\{client_name\}/g, clientName);
    const cardDescription = item.description.replace(/\{client_name\}/g, clientName);

    const cardInsert: Record<string, unknown> = {
      title: cardTitle,
      description: cardDescription,
      priority: item.priority || 'medium',
      created_by: userId,
    };

    // d. Set client_id if inherit_client is true
    if (item.inherit_client) {
      cardInsert.client_id = clientId;
    }

    const { data: card, error: cardError } = await supabase
      .from('cards')
      .insert(cardInsert)
      .select()
      .single();

    if (cardError || !card) {
      errors.push(`Failed to create card for item ${i}: ${cardError?.message || 'Unknown error'}`);
      createdCardIds.push('');
      continue;
    }

    // e. Create a card_placement on the target list
    // Determine position: append at end
    const { data: maxPlacement } = await supabase
      .from('card_placements')
      .select('position')
      .eq('list_id', targetList.id)
      .order('position', { ascending: false })
      .limit(1)
      .single();

    const position = (maxPlacement?.position ?? -1) + 1;

    await supabase
      .from('card_placements')
      .insert({
        card_id: card.id,
        list_id: targetList.id,
        position,
        is_mirror: false,
      });

    createdCardIds.push(card.id as string);
  }

  // 6. Create dependencies for items with depends_on
  for (let i = 0; i < templateItems.length; i++) {
    const item = templateItems[i];
    const sourceCardId = createdCardIds[i];
    if (!sourceCardId || !item.depends_on || item.depends_on.length === 0) continue;

    for (const depIndex of item.depends_on) {
      const targetCardId = createdCardIds[depIndex];
      if (!targetCardId) continue;

      await supabase
        .from('card_dependencies')
        .insert({
          source_card_id: sourceCardId,
          target_card_id: targetCardId,
          dependency_type: 'spawned_from',
          created_by: userId,
        });
    }
  }

  // 7. Create a notification for the current user
  await createNotification(supabase, {
    userId,
    type: 'onboarding_started',
    title: `Onboarding started for ${clientName}`,
    body: `Created ${createdCardIds.filter(Boolean).length} cards from template "${template.name}"`,
    metadata: {
      client_id: clientId,
      template_id: template_id,
      card_ids: createdCardIds.filter(Boolean),
    },
  });

  // 8. Return the list of created card IDs
  const validCardIds = createdCardIds.filter(Boolean);

  return successResponse({
    card_ids: validCardIds,
    total_items: templateItems.length,
    created_count: validCardIds.length,
    errors: errors.length > 0 ? errors : undefined,
  }, 201);
}
