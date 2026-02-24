const fs = require('fs');
const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) env[k.trim()] = v.join('=').trim();
});

const { createClient } = require('@supabase/supabase-js');
const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // Get EXACT count of imported attachments
  const { count: exactCount } = await c.from('migration_entity_map')
    .select('*', { count: 'exact', head: true })
    .eq('job_id', 'dd67d7d4-9673-4458-9db6-9a4aaf58fd60')
    .eq('source_type', 'attachment');
  console.log('Exact imported attachment count:', exactCount);

  // Paginate to get ALL imported IDs
  const importedIds = new Set();
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const { data } = await c.from('migration_entity_map')
      .select('source_id')
      .eq('job_id', 'dd67d7d4-9673-4458-9db6-9a4aaf58fd60')
      .eq('source_type', 'attachment')
      .range(offset, offset + pageSize - 1);
    if (!data || data.length === 0) break;
    for (const d of data) importedIds.add(d.source_id);
    offset += pageSize;
    if (data.length < pageSize) break;
  }
  console.log('Fetched all imported IDs:', importedIds.size);

  // Get total in manifests
  const { data: manifests } = await c.from('migration_entity_map')
    .select('source_id, metadata')
    .eq('job_id', 'dd67d7d4-9673-4458-9db6-9a4aaf58fd60')
    .eq('source_type', 'attachment_manifest');

  let pending = [];
  let trelloHosted = 0;
  let externalCount = 0;
  let totalManifest = 0;

  for (const m of manifests || []) {
    const atts = (m.metadata || {}).attachments || [];
    totalManifest += atts.length;
    for (const a of atts) {
      const attId = a.att && a.att.id;
      if (attId && !importedIds.has(attId)) {
        pending.push(a);
        const url = (a.att && a.att.url) || '';
        if (url.includes('trello.com/1/cards') || url.includes('trello-attachments')) {
          trelloHosted++;
        } else {
          externalCount++;
        }
      }
    }
  }

  console.log('\nTotal in manifests:', totalManifest);
  console.log('Already imported:', importedIds.size);
  console.log('Pending:', pending.length);
  console.log('  Trello-hosted files:', trelloHosted);
  console.log('  External/links:', externalCount);

  // Estimate total download size
  let totalBytes = 0;
  for (const p of pending) {
    totalBytes += (p.att && p.att.bytes) || 0;
  }
  console.log('\nEstimated download size:', (totalBytes / 1024 / 1024).toFixed(1), 'MB');
})();
