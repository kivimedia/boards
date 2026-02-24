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
  // Get Trello creds from the job config
  const { data: job } = await c.from('migration_jobs')
    .select('config')
    .eq('id', 'dd67d7d4-9673-4458-9db6-9a4aaf58fd60')
    .single();

  const key = job.config.trello_api_key;
  const token = job.config.trello_token;
  console.log('Trello Key from job:', key ? key.substring(0, 8) + '...' : 'MISSING');
  console.log('Trello Token from job:', token ? token.substring(0, 8) + '...' : 'MISSING');

  // Test download
  const testUrl = 'https://api.trello.com/1/cards/66988c79193fa8f6644be354/attachments/66988c85dc967f174081c04d/download/image_2024_07_18T03_24_04_353Z.png';

  console.log('\nTesting OAuth header download...');
  const res = await fetch(testUrl, {
    headers: {
      'Authorization': `OAuth oauth_consumer_key="${key}", oauth_token="${token}"`,
    },
    signal: AbortSignal.timeout(15000),
  });
  console.log('Status:', res.status, res.statusText);

  if (res.ok) {
    const buf = await res.arrayBuffer();
    console.log('Downloaded:', buf.byteLength, 'bytes');
    console.log('SUCCESS - OAuth header works!');
  } else {
    const text = await res.text();
    console.log('FAILED:', text.substring(0, 200));
  }
})();
