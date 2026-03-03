// Script to inspect Divi 5 page format on the WordPress site
// SCP to VPS and run with: npx tsx inspect-divi5-format.ts

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

import { createClient } from "@supabase/supabase-js";

const SITE_PROFILE_ID = "69294b26-6402-4ae3-b6c7-c2b873a66298";

(async () => {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  const { data: profile } = await sb.from("pageforge_site_profiles")
    .select("wp_username,wp_app_password,wp_rest_url")
    .eq("id", SITE_PROFILE_ID)
    .single();

  if (!profile || !profile.wp_username || !profile.wp_app_password) {
    console.error("Missing WP credentials");
    process.exit(1);
  }

  const auth = Buffer.from(`${profile.wp_username}:${profile.wp_app_password}`).toString("base64");
  const headers: Record<string, string> = { "Authorization": `Basic ${auth}`, "Content-Type": "application/json" };

  // List ALL pages
  console.log("=== Listing all pages ===");
  const listRes = await fetch(`${profile.wp_rest_url}/pages?per_page=50&context=edit`, { headers });
  const pages: any[] = await listRes.json();

  for (const p of pages) {
    const raw = p.content?.raw || '';
    const hasDivi = raw.includes('wp:divi');
    const hasGuten = raw.includes('wp:group');
    const hasShortcode = raw.includes('et_pb_');
    console.log(`Page ${p.id}: "${p.title?.raw || p.title?.rendered}" (${p.status}) - ${raw.length} chars - divi5:${hasDivi} guten:${hasGuten} shortcode:${hasShortcode}`);
  }

  // Create a simple test page using Divi 5 block format
  console.log("\n=== Creating test page with Divi 5 blocks ===");
  const testContent = `<!-- wp:divi/section {"builderVersion":"5.0.1","modulePreset":"default","themeBuilderArea":{"desktop":{"value":"post_content"}}} -->
<!-- wp:divi/row {"builderVersion":"5.0.1","modulePreset":"default"} -->
<!-- wp:divi/column {"builderVersion":"5.0.1"} -->
<!-- wp:divi/text {"builderVersion":"5.0.1","modulePreset":"default","content":{"innerContent":{"desktop":{"value":"<h2>Test Heading</h2><p>This is a test paragraph to verify Divi 5 block format works.</p>"}}}} -->
<!-- /wp:divi/text -->
<!-- /wp:divi/column -->
<!-- /wp:divi/row -->
<!-- /wp:divi/section -->`;

  const createRes = await fetch(`${profile.wp_rest_url}/pages`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: "Divi 5 Format Test",
      content: testContent,
      status: "draft",
      meta: { _et_pb_use_builder: "on" }
    }),
  });

  if (!createRes.ok) {
    console.error("Failed to create test page:", createRes.status, await createRes.text());
  } else {
    const newPage = await createRes.json();
    console.log("Created test page:", newPage.id, newPage.link);

    // Read it back to see how WP stored it
    const readRes = await fetch(`${profile.wp_rest_url}/pages/${newPage.id}?context=edit`, { headers });
    const readPage = await readRes.json();
    console.log("\n=== Stored content (raw) ===");
    console.log(readPage.content.raw);
    console.log("\n=== Stored content (rendered) ===");
    console.log(readPage.content.rendered?.substring(0, 500));

    // Check if Divi 5 recognizes it
    console.log("\n=== Page meta ===");
    console.log(JSON.stringify(readPage.meta, null, 2));
  }

  // Also check if there's a Divi 5 page already
  const diviPages = pages.filter(p => (p.content?.raw || '').includes('wp:divi'));
  if (diviPages.length > 0) {
    console.log(`\n=== Found ${diviPages.length} Divi 5 pages ===`);
    for (const dp of diviPages) {
      console.log(`Page ${dp.id}: "${dp.title?.raw}"`);
      console.log("First 2000 chars of content:");
      console.log((dp.content?.raw || '').substring(0, 2000));
    }
  }

  // Check Divi 4 shortcode pages (migrated from Divi 4)
  const shortcodePages = pages.filter(p => (p.content?.raw || '').includes('et_pb_'));
  if (shortcodePages.length > 0) {
    console.log(`\n=== Found ${shortcodePages.length} Divi 4 shortcode pages ===`);
    for (const sp of shortcodePages.slice(0, 2)) {
      console.log(`Page ${sp.id}: "${sp.title?.raw}"`);
      console.log("First 1000 chars of content:");
      console.log((sp.content?.raw || '').substring(0, 1000));
    }
  }
})();
