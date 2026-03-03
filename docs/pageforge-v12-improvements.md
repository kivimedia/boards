# PageForge Pipeline Improvements (v5-v12 Iteration Log)

Documented: 2026-03-02
Test site: Tent Meister on Cloudways (wordpress-1429673-6241585.cloudwaysapps.com)
Figma file: IUt000uA2gVTCTx0dx9BGO

## Score Progression

| Build | Score | Key Issue / Fix |
|-------|-------|----------------|
| v5 | 35% | Content crammed into 40% of viewport (Divi container constraint) |
| v6 | 55% | Tried CSS breakout - still narrow |
| v7 | 45% | JS injection too aggressive - broke centering |
| v8 | 65% | First successful full-width with refined JS targets |
| v9 | 73% | Better grids, features, calculator, testimonials |
| v10 | 78% | Stats horizontal, dedup, overlay boost |
| v11 | 74% | Added footer/contact but broke events into stacked bands |
| v12 | 80% | Events grid fixed, WP widgets hidden, all accumulated fixes |

---

## 1. Full-Width JS Injection (FULLWIDTH_SCRIPT)

**Problem**: Divi's blank template still constrains content via `.container` (max-width:1080px, 180px side margins), `#left-area`, `#content-area`, and `#page-container`.

**Solution**: Prepend a `<!-- wp:html --><script>` block that forces all constraining containers to `max-width:100%;width:100%` with `!important`. Targets:
- `#left-area`, `#content-area`, `#main-content`, `#page-container` (padding + float removal)
- `#page-container>.container`, `.container` (margin removal)
- `.entry-content`, `article.page`, `article.type-page`
- `.et_builder_inner_content`, `.et_pb_post_content`

Runs on: immediate, DOMContentLoaded, load, setTimeout 500ms, setTimeout 2000ms.

**Location**: `FULLWIDTH_SCRIPT` constant in worker-pageforge.ts (~line 1862)

---

## 2. prepareMarkupForDeploy() Helper

**Problem**: VQA fix loop called `sanitizeMarkup()` without the fullwidth script, breaking full-width after first fix iteration.

**Solution**: Created `prepareMarkupForDeploy(markup)` that always does `FULLWIDTH_SCRIPT + sanitizeMarkup(markup)`. Used in both `deploy_draft` phase and every `vqa_fix_loop` page update.

**Location**: ~line 1910 in worker-pageforge.ts

---

## 3. WP Widget Hiding

**Problem**: WordPress "Recent Posts" and "Recent Comments" default widgets appear below the page content on blank templates.

**Solution**: Added to FULLWIDTH_SCRIPT JS - hides `.widget_recent_entries`, `.widget_recent_comments`, `.widget_categories`, `.widget_archive`, `.widget_meta`, `.sidebar`, `.widget-area`, `#sidebar`, `aside.widget-area` with `display:none!important`.

---

## 4. sanitizeMarkup() - Overlay Opacity Boost

**Problem**: Hero sections with dark rgba overlays at opacity < 0.8 allow placeholder image text ("placehold.co" text) to bleed through.

**Solution**: Regex in sanitizeMarkup replaces `background:rgba(r,g,b,a)` where r+g+b < 200 (dark) and a < 0.8, boosting opacity to 0.88.

---

## 5. sanitizeMarkup() - Section Deduplication

**Problem**: AI sometimes generates the same section twice (e.g., two hero sections or two testimonial blocks with identical headings).

**Solution**: sanitizeMarkup splits on `<!-- wp:group` boundaries, tracks `<h1-h6>` heading text (lowercased, whitespace-normalized). If a heading repeats, the subsequent wp:group block is removed.

**Limitation**: Only catches exact heading text matches. Sections with different headings but similar content are not caught.

---

## 6. Prompt Rules Added to QUALITY_STANDARDS

### Rule 11: Stats Row Horizontal
```
Stats/numbers sections MUST be in a HORIZONTAL ROW using display:flex;
flex-direction:row;flex-wrap:wrap;justify-content:space-around;align-items:center.
Each stat item: text-align:center;flex:1;min-width:150px.
NEVER stack stats vertically.
```

### Rule 12: Grid Column Matching
```
If the Figma shows N items side-by-side, they MUST be in a grid or flex row,
NEVER stacked vertically. Match the column count from Figma.
```

### Rule 13: No Duplicate Sections
```
Each conceptual section from Figma appears EXACTLY ONCE.
```

### Rule 14: Footer Required
```
Page MUST end with a dark footer: company name, phone, email, address, hours, copyright.
3-4 column layout. If Figma doesn't show footer, generate one.
```

### Rule 15: Uniform Gallery Grid
```
display:grid;grid-template-columns:repeat(3,1fr);gap:16px
All images SAME height (object-fit:cover). NEVER asymmetric/masonry.
```

### Rule 16: No Brand Cards
```
EVERY card must have distinct content. NEVER use a card for company logo/branding.
```

### Rule 17: Anti-Stacking for Categories
```
Event types, service categories: ALWAYS cards in a GRID inside ONE wp:group section.
NEVER create separate full-width sections for each item.
```

### Rule 18: Hero Overlay Minimum
```
rgba 0.85 minimum opacity. Background image text must be invisible.
```

---

## 7. Block Pattern Templates Added to GUTENBERG_INSTRUCTIONS

- **Footer template**: 4-column dark grid with company info, quick links, services, contact + copyright
- **Gallery grid template**: 3-column uniform grid with equal-height images
- **Stats row template**: Flex row with centered stat items
- **Testimonial card template**: Stars, italic quote, avatar with initials

---

## Remaining 20% Gap (Known Issues)

1. **Ghost text on hero/image overlays** - placeholder images from placehold.co show text through overlay. Real Figma images fix this, but image upload 503 errors from Cloudways cause fallback to placeholders.
2. **Occasional duplicate sections** - dedup only catches identical heading text. Different headings with same content structure slip through.
3. **Gallery "professional installation" card** - AI sometimes generates a text-only CTA card in the gallery instead of an image card.
4. **WP 503 errors during image upload** - Cloudways rate-limits rapid uploads. Worker retries but some images fail and fall back to placeholders.

## Future Improvements to Reach 90%+

1. **Image retry with exponential backoff** - reduce 503 failures
2. **Section-by-section generation** - generate each section individually instead of full page at once (better control, less duplication)
3. **Post-process stacking detector** - identify consecutive thin full-width sections and collapse into grid
4. **Footer detection** - if no footer in output, auto-append one from template
5. **Real image verification** - after deploy, check if placeholder URLs remain and re-attempt image replacement
