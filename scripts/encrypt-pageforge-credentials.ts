/**
 * One-time migration: encrypt existing plaintext credentials in pageforge_site_profiles.
 *
 * Usage:
 *   CREDENTIALS_ENCRYPTION_KEY=<key> npx tsx scripts/encrypt-pageforge-credentials.ts
 *
 * This script:
 * 1. Reads all site profiles with non-null plaintext credential columns
 * 2. Encrypts each value using AES-256-GCM (same as src/lib/encryption.ts)
 * 3. Stores encrypted hex in the _encrypted columns
 * 4. Nulls out the plaintext columns
 *
 * Safe to run multiple times - skips rows that already have encrypted values.
 */

import { createClient } from '@supabase/supabase-js';
import { encryptToHex } from './lib/encryption';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!process.env.CREDENTIALS_ENCRYPTION_KEY) {
  console.error('Missing CREDENTIALS_ENCRYPTION_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function main() {
  const { data: sites, error } = await supabase
    .from('pageforge_site_profiles')
    .select('id, wp_app_password, figma_personal_token, wp_ssh_key_path, wp_app_password_encrypted, figma_personal_token_encrypted, wp_ssh_key_path_encrypted');

  if (error) {
    console.error('Failed to fetch site profiles:', error.message);
    process.exit(1);
  }

  if (!sites || sites.length === 0) {
    console.log('No site profiles found.');
    return;
  }

  console.log(`Found ${sites.length} site profile(s). Encrypting plaintext credentials...`);

  let updated = 0;
  for (const site of sites) {
    const updates: Record<string, unknown> = {};

    // Only encrypt if plaintext exists and encrypted column is empty
    if (site.wp_app_password && !site.wp_app_password_encrypted) {
      updates.wp_app_password_encrypted = encryptToHex(site.wp_app_password);
      updates.wp_app_password = null;
    }
    if (site.figma_personal_token && !site.figma_personal_token_encrypted) {
      updates.figma_personal_token_encrypted = encryptToHex(site.figma_personal_token);
      updates.figma_personal_token = null;
    }
    if (site.wp_ssh_key_path && !site.wp_ssh_key_path_encrypted) {
      updates.wp_ssh_key_path_encrypted = encryptToHex(site.wp_ssh_key_path);
      updates.wp_ssh_key_path = null;
    }

    if (Object.keys(updates).length === 0) {
      console.log(`  [${site.id}] - already encrypted or no plaintext, skipping`);
      continue;
    }

    const { error: updateError } = await supabase
      .from('pageforge_site_profiles')
      .update(updates)
      .eq('id', site.id);

    if (updateError) {
      console.error(`  [${site.id}] - FAILED: ${updateError.message}`);
    } else {
      const fields = Object.keys(updates).filter(k => k.endsWith('_encrypted')).map(k => k.replace('_encrypted', ''));
      console.log(`  [${site.id}] - encrypted: ${fields.join(', ')}`);
      updated++;
    }
  }

  console.log(`\nDone. ${updated}/${sites.length} site(s) updated.`);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
