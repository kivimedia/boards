import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const SITE_PROFILE_ID = "69294b26-6402-4ae3-b6c7-c2b873a66298";
const PAGE_ID = 1038; // tent-meister-v18

const NEW_FULLWIDTH = `<!-- wp:html -->
<style>
/* PageForge full-width override - CSS beats Divi theme constraints immediately */
#page-container, #main-content, #left-area, #content-area,
.container, .entry-content, article.page, article.type-page,
.et-l, .et-l--post, .et_builder_inner_content,
.et_pb_section, .et_pb_row, .et_pb_column,
.et_pb_text, .et_pb_text_inner, .et_pb_post_content,
.et_pb_module {
  max-width: 100% !important;
  width: 100% !important;
  padding-left: 0 !important;
  padding-right: 0 !important;
  margin-left: 0 !important;
  margin-right: 0 !important;
  float: none !important;
}
.widget_recent_entries,.widget_recent_comments,.widget_categories,
.widget_archive,.widget_meta,.sidebar,.widget-area,
#sidebar,aside.widget-area { display: none !important; }
#main-header, #top-header { display: none !important; }
#et-main-area { padding-top: 0 !important; }
</style>
<script>
(function(){
  function fix(){
    document.querySelectorAll('.et_pb_row,.et_pb_section,.et_pb_column,.et_pb_text,.et_pb_text_inner,.et_pb_module,.et-l,.et-l--post,.et_builder_inner_content,.container,.entry-content,article.page,article.type-page,#page-container,#main-content,#left-area,#content-area').forEach(function(el){
      el.style.setProperty('max-width','100%','important');
      el.style.setProperty('width','100%','important');
      el.style.setProperty('padding-left','0','important');
      el.style.setProperty('padding-right','0','important');
      el.style.setProperty('margin-left','0','important');
      el.style.setProperty('margin-right','0','important');
      el.style.setProperty('float','none','important');
    });
    document.querySelectorAll('.widget_recent_entries,.widget_recent_comments,.widget_categories,.widget_archive,.widget_meta,.sidebar,.widget-area,#sidebar,aside.widget-area').forEach(function(el){
      el.style.setProperty('display','none','important');
    });
  }
  fix();
  document.addEventListener('DOMContentLoaded',fix);
  window.addEventListener('load',fix);
  setTimeout(fix,500);setTimeout(fix,2000);setTimeout(fix,5000);
})();
</script>
<!-- /wp:html -->`;

(async () => {
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Get WP credentials from site profile
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

  console.log("Fetching page", PAGE_ID, "from", profile.wp_rest_url, "...");
  const getRes = await fetch(`${profile.wp_rest_url}/pages/${PAGE_ID}?context=edit`, { headers });
  if (!getRes.ok) {
    console.error("Failed to fetch page:", getRes.status, await getRes.text());
    process.exit(1);
  }
  const pageData = await getRes.json();
  let content: string = pageData.content.raw || pageData.content.rendered;
  console.log("Current content length:", content.length);

  // Remove old FULLWIDTH_SCRIPT blocks (JS-only or CSS+JS)
  content = content.replace(/<!-- wp:html -->\s*<script>\s*\(function\(\)\{[\s\S]*?<\/script>\s*<!-- \/wp:html -->/g, "");
  content = content.replace(/<!-- wp:html -->\s*<style>[\s\S]*?<\/style>\s*<script>[\s\S]*?<\/script>\s*<!-- \/wp:html -->/g, "");

  // Prepend new fullwidth block
  const newContent = NEW_FULLWIDTH + "\n" + content.trim();
  console.log("New content length:", newContent.length);

  // Update page
  const updateRes = await fetch(`${profile.wp_rest_url}/pages/${PAGE_ID}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ content: newContent }),
  });
  if (!updateRes.ok) {
    console.error("Failed to update:", updateRes.status, await updateRes.text());
    process.exit(1);
  }
  console.log("SUCCESS! Page updated. Check: https://wordpress-1429673-6241585.cloudwaysapps.com/tent-meister-v18/");
})();
