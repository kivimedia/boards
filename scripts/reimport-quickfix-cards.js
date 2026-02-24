const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const TRELLO_KEY = process.env.TRELLO_KEY;
const TRELLO_TOKEN = process.env.TRELLO_TOKEN;
const LIST_ID = 'f09db5d1-603b-4a14-a6ad-79bd2a7bf3c9';
const BOARD_ID = 'fd5f0606-e30c-4c1a-9cc8-fb6a02057619';
const ADMIN_USER_ID = '9fdf34b0-bc1e-40e0-9aae-7846e0efe770';
const ABS_TRELLO_ID = '5f2ebfea3379be79550b60f0';

const USER_MAPPING = {
  '576d12434dcfe588048637ce': '9fdf34b0-bc1e-40e0-9aae-7846e0efe770',
  '5869c3e21bee2fe8007b4c0b': '665bb89d-6b23-4576-a1f9-cd7178e1e1f7',
  '58ae81fac324a5467af1675b': '15fe3bb7-2af4-4f7f-932b-48b942db0408',
  '59d432b1ebcc4108ebe1179f': '5308dd11-c9c9-4464-b4cb-be05cf809c8e',
  '5f71383d6acde719cdf24bd5': '708a02f2-1144-48e5-a4dd-293b5805fe81',
  '61409d72d6f71901d299584c': '8e0102c4-229a-4dfc-86f5-f6f7f7d7a9de',
  '61873b9b2bc984153a0832df': 'da155870-37c9-4c75-a3bf-420031b31b75',
  '62f60498fcdc596b07d9f0bc': 'a0e39691-dc9a-490c-85d3-aae14330ee61',
  '632991ef6c8f8f015d61cbd6': 'be70e719-9286-4cdf-9eb8-5f0453a9be32',
  '642169a66baa8ab087218cc4': '89fa2720-e494-4646-88a7-e34570fa1cb2',
  '65bc8f5d49ca8d46fca0f8ec': 'a70a02a1-6492-42fb-a166-574b1f5b12d1',
  '67ce83b3113fe165406dccf2': '8354ced0-3fb2-4131-a828-a6d2793de276',
  '67e24514d577f54185ee60cb': 'e191d3bf-9428-4be5-b09f-f155cb3a9ea4',
  '6805b512afeec69ce427e1ef': '7a147664-131c-432e-a99b-38b9dfff4711',
  '68624a3920c3a9d8caa859cb': 'e1c9a7a3-d085-4273-a86d-c32ac9ac20f4',
  '68ee598af0decc686bbdc8ba': '62e485dd-9294-43d2-a0ef-ac0ae521c01c',
};

// The 8 KMBoard card IDs that were deleted during dedup
const DELETED_KM_IDS = [
  '493b09b8-5fe2-40d5-857d-25c8f5906be9',
  '153322ef-e8ac-4795-8322-cc53b5b63697',
  'd9d7f049-9d86-44a3-a1a9-7bbd294e2f28',
  '706211bf-803c-4d00-a632-b618fd8f39ea',
  'fb346bc7-3504-4bcb-acec-bb110c9ee7a8',
  '123e0cd2-37bb-4416-bbb4-0ecd2e448b7e',
  '5eb9b883-f57e-4860-91e5-a07823b7c86e',
  'ce18ca77-16d3-4af9-961d-9720d05246a2',
];

async function trelloFetch(path) {
  const sep = path.includes('?') ? '&' : '?';
  const url = `https://api.trello.com/1${path}${sep}key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Trello ${res.status}`);
  return res.json();
}

(async () => {
  // Get the Trello source IDs for these deleted cards
  const { data: mappings } = await sb.from('migration_entity_map')
    .select('source_id, target_id')
    .eq('source_type', 'card')
    .in('target_id', DELETED_KM_IDS);

  console.log(`Found ${(mappings || []).length} migration mappings for deleted cards`);
  const trelloCardIds = (mappings || []).map(m => m.source_id);
  console.log('Trello card IDs to re-import:', trelloCardIds);
  console.log('');

  // Fetch all cards from Abs board on Trello
  const [allCards, labels] = await Promise.all([
    trelloFetch(`/boards/${ABS_TRELLO_ID}/cards?filter=all`),
    trelloFetch(`/boards/${ABS_TRELLO_ID}/labels`),
  ]);

  const targetCards = allCards.filter(c => trelloCardIds.includes(c.id));
  console.log(`Found ${targetCards.length} cards on Trello to re-import`);

  // Load existing label mappings
  const { data: labelMaps } = await sb.from('migration_entity_map')
    .select('source_id, target_id')
    .eq('source_type', 'label');
  const labelMap = new Map((labelMaps || []).map(m => [m.source_id, m.target_id]));

  // Get max position in list
  const { data: existingPos } = await sb.from('card_placements')
    .select('position')
    .eq('list_id', LIST_ID)
    .order('position', { ascending: false })
    .limit(1);
  let pos = (existingPos && existingPos.length > 0) ? existingPos[0].position + 65536 : 65536;

  let created = 0;
  for (const tc of targetCards) {
    // Infer priority from labels
    let priority = 'none';
    const cardLabels = labels.filter(l => tc.idLabels.includes(l.id));
    for (const label of cardLabels) {
      const name = (label.name || '').toLowerCase();
      if (name.includes('urgent') || name.includes('critical')) { priority = 'urgent'; break; }
      if (name.includes('high')) { priority = 'high'; break; }
      if (name.includes('medium')) { priority = 'medium'; break; }
      if (name.includes('low')) { priority = 'low'; break; }
    }

    // Create card
    const { data: newCard, error: cardErr } = await sb.from('cards')
      .insert({
        title: tc.name,
        description: tc.desc || '',
        due_date: tc.due,
        priority: priority,
        created_by: ADMIN_USER_ID,
      })
      .select()
      .single();

    if (cardErr) {
      console.log(`ERROR creating card: ${tc.name} | ${cardErr.message}`);
      continue;
    }

    // Create placement
    await sb.from('card_placements').insert({
      card_id: newCard.id,
      list_id: LIST_ID,
      position: pos,
      is_mirror: false,
    });
    pos += 65536;

    // Sync labels
    const labelInserts = tc.idLabels
      .map(lid => labelMap.get(lid))
      .filter(Boolean)
      .map(labelId => ({ card_id: newCard.id, label_id: labelId }));
    if (labelInserts.length > 0) await sb.from('card_labels').insert(labelInserts);

    // Sync assignees
    const assigneeInserts = (tc.idMembers || [])
      .map(mid => USER_MAPPING[mid])
      .filter(Boolean)
      .map(u => ({ card_id: newCard.id, user_id: u }));
    if (assigneeInserts.length > 0) await sb.from('card_assignees').insert(assigneeInserts);

    // Update migration_entity_map to point to new card
    await sb.from('migration_entity_map')
      .update({ target_id: newCard.id })
      .eq('source_type', 'card')
      .eq('source_id', tc.id);

    console.log(`  Created: "${tc.name}" -> ${newCard.id}`);
    created++;
  }

  console.log('');
  console.log(`Re-imported ${created} cards`);

  // Final count
  const { count } = await sb.from('card_placements')
    .select('*', { count: 'exact', head: true })
    .eq('list_id', LIST_ID)
    .eq('is_mirror', false);
  console.log(`Total cards now in Quick fix list: ${count}`);
})();
