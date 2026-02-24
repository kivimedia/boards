const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const oldJobId = 'a813b402-35cc-4d52-8e93-a960399ff991';

  // The 20 orphaned attachment IDs from the earlier query
  const orphanedAttIds = [
    '6945357023b6559657e06304', '6948975b4128af4fc445f4ff',
    '68b9379ff3a9365e5f8ea27a', '695dd1d8d3b304a2ea537acd',
    '697b86d849e9f3452572c101', '68500d40837cc56a553aca3f',
    '6863e58e962e8ce7c6dc804b', '68ca61144bd18feba6d20343',
    '6759794b327c0d9a4ca9f8aa', '667d52dbf2c4e6d1bbc8150b',
    '667e99418d1848a9a7a14c19', '667e99b707d6e409ecd9203f',
    '6682a1ad15193683d92b6f3f', '66669a5cde72ddcc83d09f81',
    '690c6057797b70a4ab5dc638', '6960f9d30bb13038576709ac',
    '6960f9e66722fcb7fca22d05', '6960fa18e700bb3eca1bd815',
    '6960fa27e1fa95fc514eeb7d', '6960fa4143df46274907727d',
  ];

  let missing = 0;
  let hasMapping = 0;
  for (const attId of orphanedAttIds) {
    const { data } = await sb
      .from('migration_entity_map')
      .select('id, job_id, target_id')
      .eq('source_type', 'attachment')
      .eq('source_id', attId);

    if (data === null || data.length === 0) {
      console.log('MISSING:', attId, '- NO mapping record');
      missing++;
    } else {
      const { data: att } = await sb.from('attachments').select('id').eq('id', data[0].target_id).single();
      console.log(att ? 'EXISTS:' : 'ORPHAN:', attId, '-> target', data[0].target_id, att ? '(att row exists)' : '(att row DELETED by cascade)');
      hasMapping++;
    }
  }
  console.log('\nSummary: missing mappings:', missing, '| has mapping:', hasMapping);

  // Also check: how does the failing job's merge mode resolve cards?
  const failJobId = 'e7d4e997-7a58-42e0-9e12-b488c6806f87';
  const { data: failJob } = await sb.from('migration_jobs').select('config').eq('id', failJobId).single();
  console.log('\nFailing job sync_mode:', failJob?.config?.sync_mode);
  console.log('Failing job board_merge_targets:', JSON.stringify(failJob?.config?.board_merge_targets));
})();
