/**
 * Load Skill.md files into agent_skills.system_prompt
 *
 * Reads the full Skill.md prompt (+ any reference docs) for each skill
 * and updates the system_prompt column in the database via Supabase REST API.
 *
 * Run:  node scripts/load-skill-prompts.mjs
 *
 * Optional:  node scripts/load-skill-prompts.mjs --dry-run   (preview only)
 *            node scripts/load-skill-prompts.mjs --skills-dir /path/to/skills
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join, basename } from 'path';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const headers = {
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
};

// Parse CLI args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const skillsDirIdx = args.indexOf('--skills-dir');
const SKILLS_DIR = skillsDirIdx !== -1 && args[skillsDirIdx + 1]
  ? args[skillsDirIdx + 1]
  : 'C:/Users/raviv/Downloads/_skill_review/skills';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read a file as UTF-8 string, or return null if missing. */
function readFile(path) {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Build the full system prompt for a skill:
 *  1. Main Skill.md content
 *  2. Appended reference docs (if any), each under a clear heading
 */
function buildPrompt(skillSlug) {
  // Path pattern: skills/{slug}/{slug}/Skill.md
  const skillDir = join(SKILLS_DIR, skillSlug, skillSlug);
  const skillMd = join(skillDir, 'Skill.md');

  const mainPrompt = readFile(skillMd);
  if (!mainPrompt) return null;

  // Check for reference docs
  const refsDir = join(skillDir, 'references');
  let fullPrompt = mainPrompt;

  if (existsSync(refsDir) && statSync(refsDir).isDirectory()) {
    const refFiles = readdirSync(refsDir)
      .filter(f => f.endsWith('.md'))
      .sort();

    if (refFiles.length > 0) {
      fullPrompt += '\n\n---\n\n# REFERENCE MATERIAL\n';

      for (const refFile of refFiles) {
        const refContent = readFile(join(refsDir, refFile));
        if (refContent) {
          const refName = basename(refFile, '.md')
            .replace(/-/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
          fullPrompt += `\n## ${refName}\n\n${refContent}\n`;
        }
      }
    }
  }

  return fullPrompt;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\nSkill Prompt Loader`);
  console.log(`${'='.repeat(50)}`);
  console.log(`Skills dir: ${SKILLS_DIR}`);
  console.log(`Dry run:    ${dryRun}\n`);

  // 1. Discover skill folders
  if (!existsSync(SKILLS_DIR)) {
    console.error(`ERROR: Skills directory not found: ${SKILLS_DIR}`);
    process.exit(1);
  }

  const skillDirs = readdirSync(SKILLS_DIR)
    .filter(name => {
      const fullPath = join(SKILLS_DIR, name);
      return statSync(fullPath).isDirectory() && !name.startsWith('.');
    });

  console.log(`Found ${skillDirs.length} skill folders: ${skillDirs.join(', ')}\n`);

  // 2. Build prompts map
  const prompts = new Map();
  for (const slug of skillDirs) {
    const prompt = buildPrompt(slug);
    if (prompt) {
      prompts.set(slug, prompt);
      const lines = prompt.split('\n').length;
      const chars = prompt.length;
      console.log(`  ${slug}: ${lines} lines, ${chars} chars (~${Math.round(chars / 4)} tokens)`);
    } else {
      console.log(`  ${slug}: SKIP (no Skill.md found)`);
    }
  }

  console.log(`\nTotal: ${prompts.size} prompts ready\n`);

  if (prompts.size === 0) {
    console.log('Nothing to update.');
    return;
  }

  // 3. Fetch existing skills from DB to get their IDs
  console.log('Fetching existing skills from database...');
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/agent_skills?select=id,slug,system_prompt&is_active=eq.true`,
    { headers }
  );

  if (!res.ok) {
    const body = await res.text();
    console.error(`ERROR fetching skills: ${res.status} ${body}`);
    process.exit(1);
  }

  const skills = await res.json();
  console.log(`Found ${skills.length} skills in database\n`);

  // 4. Update each skill
  let updated = 0;
  let skipped = 0;
  let notFound = 0;

  for (const [slug, prompt] of prompts) {
    const skill = skills.find(s => s.slug === slug);

    if (!skill) {
      console.log(`  ${slug}: NOT IN DB — skill not seeded yet, skipping`);
      notFound++;
      continue;
    }

    // Check if already has real content (not placeholder)
    const isPlaceholder = !skill.system_prompt ||
      skill.system_prompt.startsWith('[Skill prompt for') ||
      skill.system_prompt.length < 100;

    const lines = prompt.split('\n').length;
    const label = isPlaceholder ? 'PLACEHOLDER → loading' : 'OVERWRITING existing';

    if (dryRun) {
      console.log(`  ${slug}: ${label} (${lines} lines) [DRY RUN]`);
      updated++;
      continue;
    }

    // PATCH the skill
    const patchRes = await fetch(
      `${SUPABASE_URL}/rest/v1/agent_skills?id=eq.${skill.id}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ system_prompt: prompt }),
      }
    );

    if (patchRes.ok) {
      console.log(`  ${slug}: ${label} (${lines} lines) ✓`);
      updated++;
    } else {
      const err = await patchRes.text();
      console.error(`  ${slug}: FAILED — ${patchRes.status} ${err}`);
      skipped++;
    }
  }

  // 5. Summary
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Done!`);
  console.log(`  Updated:   ${updated}`);
  console.log(`  Skipped:   ${skipped}`);
  console.log(`  Not in DB: ${notFound}`);
  if (dryRun) console.log(`\n  (Dry run — no changes made. Remove --dry-run to apply.)`);
  console.log('');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
