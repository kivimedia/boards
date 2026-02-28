/**
 * Fetch the homepage + a few key pages to understand the site's niche.
 * Returns a trimmed text snapshot for Claude to analyze.
 */
export async function scrapeSiteContext(siteUrl: string): Promise<string> {
  const url = siteUrl.replace(/\/+$/, '');
  const pages = [url, `${url}/services`, `${url}/about`, `${url}/blog`];
  const snippets: string[] = [];

  for (const pageUrl of pages) {
    try {
      const res = await fetch(pageUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOBot/1.0)' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const html = await res.text();

      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch?.[1]?.trim() || '';

      const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
      const desc = descMatch?.[1]?.trim() || '';

      const headings: string[] = [];
      const hRegex = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi;
      let hMatch;
      while ((hMatch = hRegex.exec(html)) !== null && headings.length < 20) {
        const text = hMatch[1].replace(/<[^>]+>/g, '').trim();
        if (text && text.length > 2) headings.push(text);
      }

      const navTexts: string[] = [];
      const navMatch = html.match(/<nav[\s\S]*?<\/nav>/gi);
      if (navMatch) {
        for (const nav of navMatch.slice(0, 2)) {
          const linkRegex = /<a[^>]*>([\s\S]*?)<\/a>/gi;
          let lm;
          while ((lm = linkRegex.exec(nav)) !== null && navTexts.length < 15) {
            const t = lm[1].replace(/<[^>]+>/g, '').trim();
            if (t && t.length > 1 && t.length < 50) navTexts.push(t);
          }
        }
      }

      const pageName = pageUrl === url ? 'HOMEPAGE' : pageUrl.split('/').pop()?.toUpperCase() || '';
      let snippet = `[${pageName}]`;
      if (title) snippet += `\nTitle: ${title}`;
      if (desc) snippet += `\nDescription: ${desc}`;
      if (headings.length > 0) snippet += `\nHeadings: ${headings.join(' | ')}`;
      if (navTexts.length > 0 && pageName === 'HOMEPAGE') snippet += `\nNav: ${navTexts.join(' | ')}`;
      snippets.push(snippet);
    } catch {
      // Skip failed pages
    }
  }

  return snippets.join('\n\n').slice(0, 4000);
}
