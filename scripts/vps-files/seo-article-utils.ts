export interface SeoArticleComplianceCheck {
  key: 'h1' | 'h3' | 'paragraphs' | 'dashes';
  label: string;
  passed: boolean;
  details: string;
  issues: string[];
}

export interface SeoArticleParagraphRun {
  startIndex: number;
  blockCount: number;
  strategy: 'bullets' | 'merge';
  originalBlocks: string[];
  output: string;
}

export interface SeoArticleComplianceReport {
  passed: boolean;
  h1Count: number;
  shortH3Headings: string[];
  shortParagraphRuns: SeoArticleParagraphRun[];
  forbiddenDashesRemaining: string[];
  checks: SeoArticleComplianceCheck[];
}

export interface CanonicalSeoArticle {
  title: string;
  body: string;
  contentMarkdown: string;
  contentWordCount: number;
  excerpt: string;
  compliance: SeoArticleComplianceReport;
}

const METADATA_LINE_REGEX = /^(?:slug|meta_description|meta_title|canonical_url|featured_image|category|categories|tags|author|date|status|excerpt|seo_title|focus_keyphrase)\s*:\s*.*$/gim;
const FORBIDDEN_DASH_REGEX = /[\u2012\u2013\u2014\u2015\u2212]/g;
const CHANGELOG_SECTION_REGEXES = [
  /^#{1,6}\s*change\s+log\b.*$/im,
  /^#{1,6}\s*modifications\s+made\b.*$/im,
  /^change\s+log\s*:\s*$/im,
  /^modifications\s+made\s*:\s*$/im,
  /^humanizer\s+change\s+log\s*:\s*$/im,
];

function stripYamlFrontmatter(text: string): string {
  if (!text.trimStart().startsWith('---')) return text;
  const lines = text.split('\n');
  if (lines[0].trim() !== '---') return text;
  const endIndex = lines.slice(1).findIndex(line => line.trim() === '---');
  if (endIndex === -1) return text;
  return lines.slice(endIndex + 2).join('\n');
}

function stripCodeFences(text: string): string {
  return text.replace(/```[\s\S]*?```/g, '');
}

function stripComments(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
}

function stripChangeLog(text: string): string {
  let cutIndex = -1;
  for (const regex of CHANGELOG_SECTION_REGEXES) {
    const match = regex.exec(text);
    if (match && (cutIndex === -1 || match.index < cutIndex)) {
      cutIndex = match.index;
    }
  }
  return cutIndex >= 0 ? text.slice(0, cutIndex).trimEnd() : text;
}

export function normalizeForbiddenDashes(text: string): string {
  return text
    .replace(FORBIDDEN_DASH_REGEX, ' - ')
    .replace(/[ \t]+-([ \t]+)/g, ' - ')
    .replace(/ {2,}/g, ' ');
}

function cleanMarkdown(text: string): string {
  return normalizeForbiddenDashes(
    stripChangeLog(
      stripComments(
        stripCodeFences(
          stripYamlFrontmatter(text || ''),
        ),
      ),
    ),
  )
    .replace(METADATA_LINE_REGEX, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractTitleFromRaw(text: string): string {
  const titleMeta = text.match(/^(?:title|post_title)\s*:\s*["']?(.+?)["']?\s*$/im);
  if (titleMeta) return titleMeta[1].trim();
  const h1Match = text.match(/^#\s+(.+?)\s*$/m);
  if (h1Match) return h1Match[1].trim();
  return '';
}

function stripLeadingH1(body: string): string {
  return body.replace(/^#\s+.+?\n+(?=\S)/, '').trim();
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function isHeading(block: string): boolean {
  return /^#{1,6}\s+/.test(block.trim());
}

function isListBlock(block: string): boolean {
  return /^(?:[-*+]\s+|\d+\.\s+)/m.test(block.trim());
}

function isSpecialBlock(block: string): boolean {
  const trimmed = block.trim();
  return !trimmed || isHeading(trimmed) || isListBlock(trimmed) || /^>/.test(trimmed) || /^!?\[/.test(trimmed) || /^<[^>]+>/.test(trimmed);
}

function isShortParagraph(block: string): boolean {
  const trimmed = block.trim();
  if (!trimmed || isSpecialBlock(trimmed)) return false;
  return countWords(trimmed) < 8 || trimmed.length < 45;
}

function looksListLike(blocks: string[]): boolean {
  return blocks.every(block => {
    const trimmed = block.trim();
    return trimmed.split('\n').length === 1 && !/[.!?]$/.test(trimmed);
  });
}

export function compactShortParagraphRuns(body: string): { body: string; runs: SeoArticleParagraphRun[] } {
  const blocks = body.split(/\n{2,}/).map(block => block.trim()).filter(Boolean);
  const runs: SeoArticleParagraphRun[] = [];
  const output: string[] = [];

  for (let index = 0; index < blocks.length;) {
    if (!isShortParagraph(blocks[index])) {
      output.push(blocks[index]);
      index += 1;
      continue;
    }

    let end = index;
    while (end < blocks.length && isShortParagraph(blocks[end])) {
      end += 1;
    }

    const runBlocks = blocks.slice(index, end);
    if (runBlocks.length >= 3) {
      const strategy: SeoArticleParagraphRun['strategy'] = looksListLike(runBlocks) ? 'bullets' : 'merge';
      const transformed = strategy === 'bullets'
        ? runBlocks.map(block => `- ${block.replace(/^[-*+]\s+/, '').trim()}`).join('\n')
        : runBlocks.join(' ').replace(/\s+/g, ' ').trim();
      runs.push({
        startIndex: index,
        blockCount: runBlocks.length,
        strategy,
        originalBlocks: runBlocks,
        output: transformed,
      });
      output.push(transformed);
    } else {
      output.push(...runBlocks);
    }

    index = end;
  }

  return {
    body: output.join('\n\n').replace(/\n{3,}/g, '\n\n').trim(),
    runs,
  };
}

function collectShortParagraphRuns(body: string): SeoArticleParagraphRun[] {
  const blocks = body.split(/\n{2,}/).map(block => block.trim()).filter(Boolean);
  const runs: SeoArticleParagraphRun[] = [];
  for (let index = 0; index < blocks.length;) {
    if (!isShortParagraph(blocks[index])) {
      index += 1;
      continue;
    }
    let end = index;
    while (end < blocks.length && isShortParagraph(blocks[end])) end += 1;
    const runBlocks = blocks.slice(index, end);
    if (runBlocks.length >= 3) {
      runs.push({
        startIndex: index,
        blockCount: runBlocks.length,
        strategy: looksListLike(runBlocks) ? 'bullets' : 'merge',
        originalBlocks: runBlocks,
        output: '',
      });
    }
    index = end;
  }
  return runs;
}

export function isFullLineHeading(text: string): boolean {
  const trimmed = text.trim();
  return countWords(trimmed) >= 5 || trimmed.length >= 32;
}

export function buildSeoArticleCompliance(article: { title: string; body: string; contentMarkdown: string }, paragraphRuns: SeoArticleParagraphRun[] = []): SeoArticleComplianceReport {
  const h1Matches = article.contentMarkdown.match(/^#\s+.+$/gm) || [];
  const h3Headings = Array.from(article.contentMarkdown.matchAll(/^###\s+(.+?)\s*$/gm)).map(match => match[1].trim());
  const shortH3Headings = h3Headings.filter(heading => !isFullLineHeading(heading));
  const remainingParagraphRuns = collectShortParagraphRuns(article.body);
  const forbiddenDashesRemaining = Array.from(new Set((article.contentMarkdown.match(FORBIDDEN_DASH_REGEX) || []).map(dash => dash)));

  const checks: SeoArticleComplianceCheck[] = [
    {
      key: 'h1',
      label: 'Single H1',
      passed: h1Matches.length === 1,
      details: h1Matches.length === 1 ? 'Exactly one H1 in canonical markdown.' : `Found ${h1Matches.length} H1 headings in canonical markdown.`,
      issues: h1Matches.length === 1 ? [] : [`Expected exactly 1 H1, found ${h1Matches.length}.`],
    },
    {
      key: 'h3',
      label: 'Full-line H3s',
      passed: shortH3Headings.length === 0,
      details: shortH3Headings.length === 0 ? 'All H3 headings read as standalone lines.' : `${shortH3Headings.length} short H3 heading(s) need expansion.`,
      issues: shortH3Headings.map(heading => `Expand H3: "${heading}"`),
    },
    {
      key: 'paragraphs',
      label: 'Paragraph density',
      passed: remainingParagraphRuns.length === 0,
      details: remainingParagraphRuns.length === 0
        ? (paragraphRuns.length > 0 ? `Compacted ${paragraphRuns.length} short-paragraph run(s).` : 'No dense runs of very short paragraphs detected.')
        : `${remainingParagraphRuns.length} dense run(s) of very short paragraphs remain.`,
      issues: remainingParagraphRuns.map(run => `Short paragraph run at block ${run.startIndex + 1} with ${run.blockCount} blocks.`),
    },
    {
      key: 'dashes',
      label: 'Forbidden dashes',
      passed: forbiddenDashesRemaining.length === 0,
      details: forbiddenDashesRemaining.length === 0 ? 'No em dash or en dash characters remain.' : 'Forbidden unicode dash characters still remain.',
      issues: forbiddenDashesRemaining.map(dash => `Remaining dash character: ${dash}`),
    },
  ];

  return {
    passed: checks.every(check => check.passed),
    h1Count: h1Matches.length,
    shortH3Headings,
    shortParagraphRuns: paragraphRuns.length > 0 ? paragraphRuns : remainingParagraphRuns,
    forbiddenDashesRemaining,
    checks,
  };
}

export function canonicalizeSeoArticle(text: string, fallbackTitle = ''): CanonicalSeoArticle {
  const rawTitle = extractTitleFromRaw(text);
  const cleaned = cleanMarkdown(text);
  const extractedTitle = rawTitle || extractTitleFromRaw(cleaned) || fallbackTitle.trim();
  const bodyWithoutTitle = stripLeadingH1(cleaned);
  const compacted = compactShortParagraphRuns(bodyWithoutTitle);
  const title = extractedTitle.trim();
  const body = compacted.body.trim();
  const contentMarkdown = title ? `# ${title}\n\n${body}`.trim() : body;
  const compliance = buildSeoArticleCompliance({ title, body, contentMarkdown }, compacted.runs);
  const excerptSource = body.split(/\n{2,}/).find(block => !isSpecialBlock(block)) || body;

  return {
    title,
    body,
    contentMarkdown,
    contentWordCount: countWords([title, body].filter(Boolean).join(' ')),
    excerpt: excerptSource.replace(/\s+/g, ' ').trim().slice(0, 220),
    compliance,
  };
}
