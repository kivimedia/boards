import { describe, expect, it } from 'vitest';
import { canonicalizeSeoArticle } from '../../lib/seo/article-utils';

describe('canonicalizeSeoArticle', () => {
  it('strips metadata, comments, code fences, and change logs from article content', () => {
    const article = canonicalizeSeoArticle(`
slug: sample-post
meta_description: Hidden description
author: Test

# Sample Post

<!-- remove me -->
Real opening paragraph with useful content for readers.

\`\`\`html
<div>ignore</div>
\`\`\`

## Section

Second paragraph stays.

## Change Log

- removed em dash
    `);

    expect(article.title).toBe('Sample Post');
    expect(article.body).toContain('Real opening paragraph');
    expect(article.body).toContain('Second paragraph stays.');
    expect(article.body).not.toContain('Hidden description');
    expect(article.body).not.toContain('remove me');
    expect(article.body).not.toContain('removed em dash');
    expect(article.contentWordCount).toBe(15);
  });

  it('keeps a single canonical H1 and flags duplicate H1 headings', () => {
    const article = canonicalizeSeoArticle(`
# Main Title

Intro paragraph that has enough words to count cleanly.

# Extra Title

More body copy here.
    `);

    const h1Check = article.compliance.checks.find(check => check.key === 'h1');
    expect(article.contentMarkdown.startsWith('# Main Title')).toBe(true);
    expect(h1Check?.passed).toBe(false);
    expect(article.compliance.h1Count).toBe(2);
  });

  it('flags short H3 headings and passes descriptive ones', () => {
    const failingArticle = canonicalizeSeoArticle(`
# Main Title

Intro paragraph with enough words to avoid paragraph warnings.

### Quick Tips

Body paragraph that follows the heading.
    `);

    const passingArticle = canonicalizeSeoArticle(`
# Main Title

Intro paragraph with enough words to avoid paragraph warnings.

### Practical ways to compare rental tent sizes before booking

Body paragraph that follows the heading.
    `);

    expect(failingArticle.compliance.shortH3Headings).toContain('Quick Tips');
    expect(passingArticle.compliance.shortH3Headings).toHaveLength(0);
  });

  it('converts dense runs of tiny list-like paragraphs into bullets', () => {
    const article = canonicalizeSeoArticle(`
# Main Title

Intro paragraph with enough words to avoid paragraph warnings.

Item one

Item two

Item three
    `);

    expect(article.body).toContain('- Item one');
    expect(article.body).toContain('- Item two');
    expect(article.compliance.checks.find(check => check.key === 'paragraphs')?.passed).toBe(true);
  });

  it('replaces forbidden unicode dashes and leaves no remaining dash violations', () => {
    const article = canonicalizeSeoArticle(`
# Main Title

This sentence uses an em dash — and an en dash – in the same paragraph.
    `);

    expect(article.contentMarkdown).not.toContain('—');
    expect(article.contentMarkdown).not.toContain('–');
    expect(article.compliance.checks.find(check => check.key === 'dashes')?.passed).toBe(true);
  });
});

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
