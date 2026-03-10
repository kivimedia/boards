/**
 * Divi 5 Module Reference for PageForge AI Page Builder
 *
 * Maps Figma design elements to Divi 5 modules with CSS classes,
 * properties, and JSON attribute schemas.
 *
 * Sources:
 * - Elegant Themes Help Center (Divi 5 Modules collection)
 * - Elegant Themes Developer Docs (devalpha.elegantthemes.com)
 * - d5-extension-example-modules (GitHub)
 * - Divi CSS and Child Theme Guide (wpzone.co)
 *
 * Divi 5 Architecture Notes:
 * - Modules are stored as WordPress block comments with JSON attributes
 * - Self-closing: <!-- wp:divi/module-slug {JSON} /-->
 * - Container: <!-- wp:divi/module-slug {JSON} -->...<!-- /wp:divi/module-slug -->
 * - CSS prefix: et_pb_ (same as Divi 4, but new modules use new class names)
 * - Responsive breakpoints: desktop, tablet, tabletWide, phone
 * - All style values wrapped in breakpoint objects: { "desktop": { "value": ... } }
 * - builderVersion: "5.0.0-public-beta.1" (required in all module JSON)
 * - TypeScript + React architecture (rewritten from Divi 4 shortcodes)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Divi5Module {
  /** Module name as shown in the Visual Builder UI */
  name: string;
  /** Block slug used in wp:divi/slug comments */
  slug: string;
  /** Primary CSS class on the frontend output wrapper */
  cssClass: string;
  /** Additional CSS selectors for targeting sub-elements */
  cssSelectors: Record<string, string>;
  /** Category in the Visual Builder module picker */
  category: Divi5ModuleCategory;
  /** Whether this module is a container (open/close) or self-closing */
  isContainer: boolean;
  /** Whether this module is new in Divi 5 (not in Divi 4) */
  isNewInDivi5: boolean;
  /** Common Figma element patterns this module maps to */
  figmaMapping: string[];
  /** Key content/design properties */
  properties: Divi5ModuleProperty[];
  /** Brief description of what this module does */
  description: string;
  /** Common use cases */
  useCases: string[];
  /** Custom CSS target areas available in the Advanced tab */
  customCssTargets: string[];
}

export interface Divi5ModuleProperty {
  name: string;
  jsonPath: string;
  type: 'text' | 'url' | 'color' | 'size' | 'font' | 'spacing' | 'boolean' | 'select' | 'number' | 'html' | 'image' | 'icon';
  description: string;
  /** Common values or options */
  options?: string[];
}

export type Divi5ModuleCategory =
  | 'structure'     // Section, Row, Column, Group
  | 'text'          // Text, Heading, Code
  | 'media'         // Image, Video, Gallery, Audio, Lottie
  | 'interactive'   // Button, Tabs, Accordion, Toggle, Slider
  | 'layout'        // Blurb, Hero, Person, Testimonial, Pricing
  | 'forms'         // Contact Form, Email Optin, Login, Search
  | 'navigation'    // Menu, Sidebar, Post Navigation, Pagination
  | 'blog'          // Blog, Portfolio, Filterable Portfolio, Post Slider
  | 'counters'      // Bar Counter, Circle Counter, Number Counter, Countdown
  | 'social'        // Social Media Follow
  | 'utility'       // Divider, Icon, Icon List, Link, Dropdown, Before/After
  | 'woocommerce';  // All Woo modules

// ---------------------------------------------------------------------------
// Structural Elements (not modules but essential for page building)
// ---------------------------------------------------------------------------

export const DIVI5_STRUCTURAL_ELEMENTS: Divi5Module[] = [
  {
    name: 'Section',
    slug: 'divi/section',
    cssClass: 'et_pb_section',
    cssSelectors: {
      wrapper: '.et_pb_section',
      inner: '.et_pb_section_inner',
    },
    category: 'structure',
    isContainer: true,
    isNewInDivi5: false,
    figmaMapping: ['Frame (top-level)', 'Section', 'Full-width container', 'Hero section', 'Page section'],
    properties: [
      { name: 'Background Color', jsonPath: 'module.decoration.background.desktop.value.color', type: 'color', description: 'Section background color' },
      { name: 'Background Image', jsonPath: 'module.decoration.background.desktop.value.image.url', type: 'url', description: 'Background image URL' },
      { name: 'Background Size', jsonPath: 'module.decoration.background.desktop.value.image.size', type: 'select', description: 'Background image size', options: ['cover', 'contain', 'auto'] },
      { name: 'Background Position', jsonPath: 'module.decoration.background.desktop.value.image.position', type: 'text', description: 'Background position', options: ['center center', 'top center', 'bottom center'] },
      { name: 'Padding', jsonPath: 'module.decoration.spacing.desktop.value.padding', type: 'spacing', description: 'Inner spacing (top, bottom, left, right)' },
      { name: 'Margin', jsonPath: 'module.decoration.spacing.desktop.value.margin', type: 'spacing', description: 'Outer spacing' },
    ],
    description: 'Top-level page container. All content lives inside sections. Supports full-width backgrounds, parallax, and video backgrounds.',
    useCases: ['Page sections', 'Hero areas', 'Full-width backgrounds', 'Content blocks'],
    customCssTargets: ['Main Element', 'Before', 'After'],
  },
  {
    name: 'Row',
    slug: 'divi/row',
    cssClass: 'et_pb_row',
    cssSelectors: {
      wrapper: '.et_pb_row',
      inner: '.et_pb_row_inner',
    },
    category: 'structure',
    isContainer: true,
    isNewInDivi5: false,
    figmaMapping: ['Auto Layout (horizontal)', 'Row container', 'Column grid'],
    properties: [
      { name: 'Column Structure', jsonPath: 'module.advanced.flexColumnStructure.desktop.value', type: 'select', description: 'Predefined column layout', options: ['equal-columns_1', 'equal-columns_2', 'equal-columns_3', 'equal-columns_4'] },
      { name: 'Flex Wrap', jsonPath: 'module.decoration.layout.desktop.value.flexWrap', type: 'select', description: 'Whether columns wrap', options: ['nowrap', 'wrap'] },
      { name: 'Gap', jsonPath: 'module.decoration.layout.desktop.value.gap', type: 'size', description: 'Gap between columns' },
      { name: 'Max Width', jsonPath: 'module.decoration.sizing.desktop.value.maxWidth', type: 'size', description: 'Maximum row width' },
    ],
    description: 'Container for columns within a section. Controls the column layout structure.',
    useCases: ['Multi-column layouts', 'Content grids', 'Side-by-side elements'],
    customCssTargets: ['Main Element', 'Before', 'After'],
  },
  {
    name: 'Column',
    slug: 'divi/column',
    cssClass: 'et_pb_column',
    cssSelectors: {
      wrapper: '.et_pb_column',
    },
    category: 'structure',
    isContainer: true,
    isNewInDivi5: false,
    figmaMapping: ['Auto Layout (vertical)', 'Column container', 'Card container'],
    properties: [
      { name: 'Flex Type (Width)', jsonPath: 'module.decoration.sizing.desktop.value.flexType', type: 'select', description: 'Column width as fraction of 24', options: ['24_24', '12_24', '8_24', '6_24', '16_24', '4_24'] },
      { name: 'Padding', jsonPath: 'module.decoration.spacing.desktop.value.padding', type: 'spacing', description: 'Inner spacing' },
      { name: 'Background', jsonPath: 'module.decoration.background.desktop.value.color', type: 'color', description: 'Column background color' },
    ],
    description: 'Container for modules within a row. Width is set as fractions of 24 (e.g. 12_24 = 50%, 8_24 = 33%, 6_24 = 25%).',
    useCases: ['Content columns', 'Card containers', 'Sidebar layouts'],
    customCssTargets: ['Main Element', 'Before', 'After'],
  },
  {
    name: 'Group',
    slug: 'divi/group',
    cssClass: 'et_pb_group',
    cssSelectors: {
      wrapper: '.et_pb_group',
    },
    category: 'structure',
    isContainer: true,
    isNewInDivi5: true,
    figmaMapping: ['Group', 'Frame (nested)', 'Card component', 'Container', 'Component wrapper'],
    properties: [
      { name: 'Layout Mode', jsonPath: 'module.decoration.layout.desktop.value.display', type: 'select', description: 'Layout mode', options: ['block', 'flex', 'grid'] },
      { name: 'Background', jsonPath: 'module.decoration.background.desktop.value.color', type: 'color', description: 'Group background color' },
      { name: 'Border Radius', jsonPath: 'module.decoration.border.desktop.value.radius', type: 'size', description: 'Rounded corners' },
      { name: 'Padding', jsonPath: 'module.decoration.spacing.desktop.value.padding', type: 'spacing', description: 'Inner spacing' },
      { name: 'Link', jsonPath: 'link.innerContent.desktop.value.url', type: 'url', description: 'Make entire group clickable' },
    ],
    description: 'Lightweight container that wraps multiple modules within a column. Supports Flexbox and CSS Grid layouts. Can be saved as a global/reusable element. Shortcut: select modules and press CMD/CTRL+G.',
    useCases: ['Card layouts', 'CTA blocks', 'Feature cards', 'Reusable component groups', 'Mixed media containers'],
    customCssTargets: ['Main Element', 'Before', 'After'],
  },
];

// ---------------------------------------------------------------------------
// Core Content Modules
// ---------------------------------------------------------------------------

export const DIVI5_CONTENT_MODULES: Divi5Module[] = [
  {
    name: 'Text',
    slug: 'divi/text',
    cssClass: 'et_pb_text',
    cssSelectors: {
      wrapper: '.et_pb_text',
      inner: '.et_pb_text_inner',
    },
    category: 'text',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Text layer', 'Paragraph', 'Body text', 'Rich text block', 'Description'],
    properties: [
      { name: 'Content', jsonPath: 'content.innerContent.desktop.value', type: 'html', description: 'Rich text content (supports HTML)' },
      { name: 'Font Family', jsonPath: 'content.decoration.bodyFont.body.font.desktop.value.family', type: 'font', description: 'Body text font' },
      { name: 'Font Color', jsonPath: 'content.decoration.bodyFont.body.font.desktop.value.color', type: 'color', description: 'Text color' },
      { name: 'Font Size', jsonPath: 'content.decoration.bodyFont.body.font.desktop.value.size', type: 'size', description: 'Text size' },
      { name: 'Font Weight', jsonPath: 'content.decoration.bodyFont.body.font.desktop.value.weight', type: 'select', description: 'Font weight', options: ['300', '400', '500', '600', '700', '800'] },
      { name: 'Line Height', jsonPath: 'content.decoration.bodyFont.body.font.desktop.value.lineHeight', type: 'size', description: 'Line spacing' },
      { name: 'Text Align', jsonPath: 'content.decoration.bodyFont.body.font.desktop.value.textAlign', type: 'select', description: 'Alignment', options: ['left', 'center', 'right', 'justify'] },
      { name: 'Link URL', jsonPath: 'link.innerContent.desktop.value.url', type: 'url', description: 'Make entire text module clickable' },
    ],
    description: 'Rich text editor for paragraphs, lists, and formatted text. Supports full HTML. Most versatile text module.',
    useCases: ['Body paragraphs', 'Descriptions', 'Rich text blocks', 'Inline CTAs with links', 'Captions'],
    customCssTargets: ['Main Element', 'Text', 'Before', 'After'],
  },
  {
    name: 'Heading',
    slug: 'divi/heading',
    cssClass: 'et_pb_heading',
    cssSelectors: {
      wrapper: '.et_pb_heading',
      title: '.et_pb_heading_title',
    },
    category: 'text',
    isContainer: false,
    isNewInDivi5: true,
    figmaMapping: ['Heading text', 'Title', 'H1', 'H2', 'H3', 'Section title', 'Large text'],
    properties: [
      { name: 'Title Text', jsonPath: 'title.innerContent.desktop.value', type: 'text', description: 'Heading text content' },
      { name: 'Heading Level', jsonPath: 'title.decoration.font.font.desktop.value.headingLevel', type: 'select', description: 'HTML heading tag', options: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] },
      { name: 'Font Family', jsonPath: 'title.decoration.font.font.desktop.value.family', type: 'font', description: 'Heading font' },
      { name: 'Font Color', jsonPath: 'title.decoration.font.font.desktop.value.color', type: 'color', description: 'Heading text color' },
      { name: 'Font Size', jsonPath: 'title.decoration.font.font.desktop.value.size', type: 'size', description: 'Heading size' },
      { name: 'Font Weight', jsonPath: 'title.decoration.font.font.desktop.value.weight', type: 'select', description: 'Font weight', options: ['300', '400', '500', '600', '700', '800', '900'] },
      { name: 'Text Align', jsonPath: 'title.decoration.font.font.desktop.value.textAlign', type: 'select', description: 'Alignment', options: ['left', 'center', 'right'] },
    ],
    description: 'Dedicated heading element. Cleaner and more semantic than using Text module for headings. Replaced the need for inline heading tags.',
    useCases: ['Page titles', 'Section headers', 'Feature headlines', 'SEO-friendly headings'],
    customCssTargets: ['Main Element', 'Title', 'Before', 'After'],
  },
  {
    name: 'Code',
    slug: 'divi/code',
    cssClass: 'et_pb_code',
    cssSelectors: {
      wrapper: '.et_pb_code',
      inner: '.et_pb_code_inner',
    },
    category: 'text',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Custom HTML embed', 'Code snippet', 'Third-party widget'],
    properties: [
      { name: 'Content', jsonPath: 'content.innerContent.desktop.value', type: 'html', description: 'Raw HTML/CSS/JS content' },
    ],
    description: 'Embed raw HTML, CSS, or JavaScript. Content is rendered as-is on the frontend.',
    useCases: ['Custom HTML blocks', 'Third-party embeds', 'Custom scripts', 'Shortcodes'],
    customCssTargets: ['Main Element', 'Before', 'After'],
  },
];

// ---------------------------------------------------------------------------
// Media Modules
// ---------------------------------------------------------------------------

export const DIVI5_MEDIA_MODULES: Divi5Module[] = [
  {
    name: 'Image',
    slug: 'divi/image',
    cssClass: 'et_pb_image',
    cssSelectors: {
      wrapper: '.et_pb_image',
      img: '.et_pb_image img',
      overlay: '.et_pb_overlay',
    },
    category: 'media',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Image', 'Photo', 'Illustration', 'Logo', 'Icon image', 'Banner image'],
    properties: [
      { name: 'Image Source', jsonPath: 'image.innerContent.desktop.value.src', type: 'url', description: 'Image URL' },
      { name: 'Alt Text', jsonPath: 'image.innerContent.desktop.value.alt', type: 'text', description: 'Accessibility alt text' },
      { name: 'Alignment', jsonPath: 'module.advanced.align.desktop.value', type: 'select', description: 'Image alignment', options: ['left', 'center', 'right'] },
      { name: 'Width', jsonPath: 'module.advanced.sizing.desktop.value.width', type: 'size', description: 'Image width' },
      { name: 'Max Width', jsonPath: 'module.advanced.sizing.desktop.value.maxWidth', type: 'size', description: 'Maximum width' },
      { name: 'Link URL', jsonPath: 'link.innerContent.desktop.value.url', type: 'url', description: 'Click link destination' },
      { name: 'Border Radius', jsonPath: 'module.decoration.border.desktop.value.radius', type: 'size', description: 'Rounded corners' },
    ],
    description: 'Single image display with optional link, lightbox, animations, and hover effects.',
    useCases: ['Hero images', 'Logos', 'Feature images', 'Thumbnails', 'Decorative images'],
    customCssTargets: ['Main Element', 'Image', 'Overlay', 'Before', 'After'],
  },
  {
    name: 'Video',
    slug: 'divi/video',
    cssClass: 'et_pb_video',
    cssSelectors: {
      wrapper: '.et_pb_video',
      videoWrap: '.et_pb_video_wrap',
      overlay: '.et_pb_video_overlay',
    },
    category: 'media',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Video player', 'Video embed', 'YouTube embed', 'Vimeo embed'],
    properties: [
      { name: 'Video URL', jsonPath: 'video.innerContent.desktop.value.src', type: 'url', description: 'YouTube, Vimeo, or direct video URL' },
      { name: 'Cover Image', jsonPath: 'video.innerContent.desktop.value.thumbnailOverlay', type: 'url', description: 'Custom thumbnail overlay image' },
    ],
    description: 'Embed videos from YouTube, Vimeo, or self-hosted with optional custom cover image overlay.',
    useCases: ['Video embeds', 'YouTube/Vimeo players', 'Product demos', 'Background videos'],
    customCssTargets: ['Main Element', 'Video', 'Play Icon', 'Overlay', 'Before', 'After'],
  },
  {
    name: 'Gallery',
    slug: 'divi/gallery',
    cssClass: 'et_pb_gallery',
    cssSelectors: {
      wrapper: '.et_pb_gallery',
      grid: '.et_pb_gallery_grid',
      item: '.et_pb_gallery_item',
      image: '.et_pb_gallery_image',
      title: '.et_pb_gallery_title',
      caption: '.et_pb_gallery_caption',
    },
    category: 'media',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Image grid', 'Photo gallery', 'Portfolio grid', 'Masonry layout'],
    properties: [
      { name: 'Images', jsonPath: 'gallery.innerContent.desktop.value', type: 'text', description: 'Gallery image IDs or URLs' },
      { name: 'Columns', jsonPath: 'gallery.advanced.columns.desktop.value', type: 'number', description: 'Number of columns' },
      { name: 'Show Title', jsonPath: 'gallery.advanced.showTitle.desktop.value', type: 'boolean', description: 'Show image titles' },
      { name: 'Show Caption', jsonPath: 'gallery.advanced.showCaption.desktop.value', type: 'boolean', description: 'Show image captions' },
    ],
    description: 'Display multiple images in a grid with optional lightbox, captions, and hover effects.',
    useCases: ['Photo galleries', 'Portfolio grids', 'Product image collections', 'Before/after collections'],
    customCssTargets: ['Main Element', 'Gallery Item', 'Gallery Image', 'Title', 'Caption', 'Overlay', 'Overlay Icon'],
  },
  {
    name: 'Audio',
    slug: 'divi/audio',
    cssClass: 'et_pb_audio_module',
    cssSelectors: {
      wrapper: '.et_pb_audio_module',
      coverArt: '.et_pb_audio_cover_art',
      player: '.mejs-container',
      controls: '.mejs-controls',
    },
    category: 'media',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Audio player', 'Music player', 'Podcast player'],
    properties: [
      { name: 'Audio URL', jsonPath: 'audio.innerContent.desktop.value.src', type: 'url', description: 'Audio file URL' },
      { name: 'Title', jsonPath: 'title.innerContent.desktop.value', type: 'text', description: 'Track title' },
      { name: 'Artist', jsonPath: 'artist.innerContent.desktop.value', type: 'text', description: 'Artist name' },
      { name: 'Cover Art', jsonPath: 'image.innerContent.desktop.value.src', type: 'url', description: 'Album artwork' },
    ],
    description: 'Audio player with cover art, title, and playback controls for music or podcast episodes.',
    useCases: ['Music players', 'Podcast episodes', 'Audio samples'],
    customCssTargets: ['Main Element', 'Cover Art', 'Title', 'Artist', 'Player', 'Before', 'After'],
  },
  {
    name: 'Lottie',
    slug: 'divi/lottie',
    cssClass: 'et_pb_lottie',
    cssSelectors: {
      wrapper: '.et_pb_lottie',
    },
    category: 'media',
    isContainer: false,
    isNewInDivi5: true,
    figmaMapping: ['Lottie animation', 'Animated illustration', 'Motion graphic', 'Animated icon'],
    properties: [
      { name: 'Lottie URL', jsonPath: 'lottie.innerContent.desktop.value.url', type: 'url', description: 'Lottie JSON file URL or uploaded file' },
      { name: 'Trigger', jsonPath: 'lottie.advanced.trigger.desktop.value', type: 'select', description: 'Animation trigger', options: ['autoplay', 'hover', 'click', 'scroll'] },
      { name: 'Loop', jsonPath: 'lottie.advanced.loop.desktop.value', type: 'boolean', description: 'Loop animation' },
      { name: 'Speed', jsonPath: 'lottie.advanced.speed.desktop.value', type: 'number', description: 'Playback speed multiplier' },
      { name: 'Direction', jsonPath: 'lottie.advanced.direction.desktop.value', type: 'select', description: 'Play direction', options: ['forward', 'reverse'] },
    ],
    description: 'Embed lightweight Lottie animations with customizable triggers, speed, and interaction controls.',
    useCases: ['Animated illustrations', 'Loading animations', 'Interactive icons', 'Motion graphics'],
    customCssTargets: ['Main Element', 'Before', 'After'],
  },
  {
    name: 'Before/After Image',
    slug: 'divi/before-after-image',
    cssClass: 'et_pb_before_after_image',
    cssSelectors: {
      wrapper: '.et_pb_before_after_image',
    },
    category: 'media',
    isContainer: false,
    isNewInDivi5: true,
    figmaMapping: ['Image comparison', 'Before/after slider', 'Comparison widget'],
    properties: [
      { name: 'Before Image', jsonPath: 'beforeImage.innerContent.desktop.value.src', type: 'url', description: 'Before comparison image' },
      { name: 'After Image', jsonPath: 'afterImage.innerContent.desktop.value.src', type: 'url', description: 'After comparison image' },
    ],
    description: 'Side-by-side image comparison with a draggable slider to reveal before/after states.',
    useCases: ['Before/after comparisons', 'Photo retouching showcase', 'Design iterations', 'Product transformations'],
    customCssTargets: ['Main Element', 'Before Image', 'After Image', 'Slider', 'Before', 'After'],
  },
];

// ---------------------------------------------------------------------------
// Interactive Modules
// ---------------------------------------------------------------------------

export const DIVI5_INTERACTIVE_MODULES: Divi5Module[] = [
  {
    name: 'Button',
    slug: 'divi/button',
    cssClass: 'et_pb_button',
    cssSelectors: {
      wrapper: '.et_pb_button_module_wrapper',
      button: '.et_pb_button',
      icon: '.et_pb_button::after',
    },
    category: 'interactive',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Button', 'CTA button', 'Link button', 'Action button', 'Submit button'],
    properties: [
      { name: 'Button Text', jsonPath: 'button.innerContent.desktop.value.text', type: 'text', description: 'Button label' },
      { name: 'Button URL', jsonPath: 'button.innerContent.desktop.value.url', type: 'url', description: 'Click destination URL' },
      { name: 'Alignment', jsonPath: 'module.advanced.alignment.desktop.value', type: 'select', description: 'Horizontal alignment', options: ['left', 'center', 'right'] },
      { name: 'Background Color', jsonPath: 'module.decoration.background.desktop.value.color', type: 'color', description: 'Button background color' },
      { name: 'Text Color', jsonPath: 'button.decoration.font.font.desktop.value.color', type: 'color', description: 'Button text color' },
      { name: 'Font Size', jsonPath: 'button.decoration.font.font.desktop.value.size', type: 'size', description: 'Button text size' },
      { name: 'Font Weight', jsonPath: 'button.decoration.font.font.desktop.value.weight', type: 'select', description: 'Font weight', options: ['400', '500', '600', '700'] },
      { name: 'Padding', jsonPath: 'module.decoration.spacing.desktop.value.padding', type: 'spacing', description: 'Inner button padding' },
      { name: 'Border Radius', jsonPath: 'module.decoration.border.desktop.value.radius.topLeft', type: 'size', description: 'Rounded corners (sync on = all corners)' },
      { name: 'Border', jsonPath: 'module.decoration.border.desktop.value', type: 'text', description: 'Border width, style, color' },
    ],
    description: 'Customizable call-to-action button with extensive design options including icons, animations, and hover effects.',
    useCases: ['CTA buttons', 'Form submit buttons', 'Navigation links', 'Download buttons', 'Buy buttons'],
    customCssTargets: ['Main Element', 'Button', 'Button Icon', 'Before', 'After'],
  },
  {
    name: 'Tabs',
    slug: 'divi/tabs',
    cssClass: 'et_pb_tabs',
    cssSelectors: {
      wrapper: '.et_pb_tabs',
      tabList: '.et_pb_tab_list',
      tab: '.et_pb_tab',
      content: '.et_pb_tab_content',
      activeTab: '.et_pb_tab.et_pb_tab_active',
    },
    category: 'interactive',
    isContainer: true,
    isNewInDivi5: false,
    figmaMapping: ['Tab component', 'Tabbed content', 'Tab navigation', 'Tab panel'],
    properties: [
      { name: 'Active Tab Background', jsonPath: 'module.decoration.background.desktop.value.color', type: 'color', description: 'Active tab background' },
      { name: 'Inactive Tab Background', jsonPath: 'tabs.decoration.inactiveBackground.desktop.value', type: 'color', description: 'Inactive tab background' },
    ],
    description: 'Tabbed content with switchable panels. Supports nested modules inside each tab in Divi 5.',
    useCases: ['Feature descriptions', 'Product specifications', 'Multi-section content', 'FAQ categories'],
    customCssTargets: ['Main Element', 'Tab', 'Tab Content', 'Active Tab', 'Before', 'After'],
  },
  {
    name: 'Accordion',
    slug: 'divi/accordion',
    cssClass: 'et_pb_accordion',
    cssSelectors: {
      wrapper: '.et_pb_accordion',
      toggle: '.et_pb_toggle',
      toggleOpen: '.et_pb_toggle_open',
      toggleClose: '.et_pb_toggle_close',
      title: '.et_pb_toggle_title',
      content: '.et_pb_toggle_content',
    },
    category: 'interactive',
    isContainer: true,
    isNewInDivi5: false,
    figmaMapping: ['Accordion', 'Collapsible sections', 'FAQ', 'Expandable list'],
    properties: [
      { name: 'Toggle Icon', jsonPath: 'accordion.advanced.icon.desktop.value', type: 'icon', description: 'Toggle indicator icon' },
      { name: 'Open Toggle Background', jsonPath: 'module.decoration.background.desktop.value.color', type: 'color', description: 'Open state background' },
    ],
    description: 'Collapsible content sections where only one panel is open at a time. Supports nested modules inside each toggle in Divi 5.',
    useCases: ['FAQs', 'Feature lists', 'Terms and conditions', 'Collapsible content'],
    customCssTargets: ['Main Element', 'Toggle', 'Toggle Title', 'Toggle Content', 'Toggle Icon', 'Before', 'After'],
  },
  {
    name: 'Toggle',
    slug: 'divi/toggle',
    cssClass: 'et_pb_toggle',
    cssSelectors: {
      wrapper: '.et_pb_toggle',
      title: '.et_pb_toggle_title',
      content: '.et_pb_toggle_content',
    },
    category: 'interactive',
    isContainer: true,
    isNewInDivi5: false,
    figmaMapping: ['Collapsible panel', 'Expandable section', 'Disclosure'],
    properties: [
      { name: 'Title', jsonPath: 'title.innerContent.desktop.value', type: 'text', description: 'Toggle title text' },
      { name: 'State', jsonPath: 'toggle.advanced.state.desktop.value', type: 'select', description: 'Default state', options: ['open', 'close'] },
    ],
    description: 'Single collapsible section (unlike Accordion which groups multiple). Multiple toggles can be open simultaneously.',
    useCases: ['Individual collapsible sections', 'Show/hide content', 'Optional details'],
    customCssTargets: ['Main Element', 'Title', 'Content', 'Icon', 'Before', 'After'],
  },
  {
    name: 'Slider',
    slug: 'divi/slider',
    cssClass: 'et_pb_slider',
    cssSelectors: {
      wrapper: '.et_pb_slider',
      slide: '.et_pb_slide',
      description: '.et_pb_slide_description',
      title: '.et_pb_slide_title',
      content: '.et_pb_slide_content',
      image: '.et_pb_slide_image',
      button: '.et_pb_slide .et_pb_button',
      arrows: '.et-pb-slider-arrows',
      dots: '.et-pb-controllers',
    },
    category: 'interactive',
    isContainer: true,
    isNewInDivi5: false,
    figmaMapping: ['Carousel', 'Slider', 'Hero slider', 'Image carousel', 'Slideshow'],
    properties: [
      { name: 'Auto Animate', jsonPath: 'slider.advanced.auto.desktop.value', type: 'boolean', description: 'Auto-play slides' },
      { name: 'Speed', jsonPath: 'slider.advanced.speed.desktop.value', type: 'number', description: 'Auto-play speed in ms' },
      { name: 'Parallax', jsonPath: 'slider.advanced.parallax.desktop.value', type: 'boolean', description: 'Parallax background effect' },
      { name: 'Show Arrows', jsonPath: 'slider.advanced.arrows.desktop.value', type: 'boolean', description: 'Show navigation arrows' },
      { name: 'Show Pagination', jsonPath: 'slider.advanced.pagination.desktop.value', type: 'boolean', description: 'Show dot pagination' },
    ],
    description: 'Flexible slider mixing images, videos, and text with optional CTA buttons per slide. Supports parallax backgrounds.',
    useCases: ['Hero sliders', 'Image carousels', 'Testimonial sliders', 'Feature showcases'],
    customCssTargets: ['Main Element', 'Slide', 'Slide Title', 'Slide Content', 'Slide Image', 'Slide Button', 'Arrows', 'Pagination'],
  },
  {
    name: 'Video Slider',
    slug: 'divi/video-slider',
    cssClass: 'et_pb_video_slider',
    cssSelectors: {
      wrapper: '.et_pb_video_slider',
    },
    category: 'interactive',
    isContainer: true,
    isNewInDivi5: false,
    figmaMapping: ['Video carousel', 'Video gallery slider'],
    properties: [
      { name: 'Auto Animate', jsonPath: 'slider.advanced.auto.desktop.value', type: 'boolean', description: 'Auto-play slides' },
    ],
    description: 'Carousel specifically for multiple video embeds with slider navigation.',
    useCases: ['Video portfolios', 'Course previews', 'Media galleries'],
    customCssTargets: ['Main Element', 'Video', 'Controls', 'Before', 'After'],
  },
  {
    name: 'Group Carousel',
    slug: 'divi/group-carousel',
    cssClass: 'et_pb_group_carousel',
    cssSelectors: {
      wrapper: '.et_pb_group_carousel',
    },
    category: 'interactive',
    isContainer: true,
    isNewInDivi5: true,
    figmaMapping: ['Card carousel', 'Content slider', 'Testimonial carousel', 'Post carousel', 'Custom slider'],
    properties: [
      { name: 'Slides Per View', jsonPath: 'carousel.advanced.slidesPerView.desktop.value', type: 'number', description: 'Number of visible slides' },
      { name: 'Auto Animate', jsonPath: 'carousel.advanced.auto.desktop.value', type: 'boolean', description: 'Auto-play carousel' },
      { name: 'Speed', jsonPath: 'carousel.advanced.speed.desktop.value', type: 'number', description: 'Transition speed' },
      { name: 'Loop', jsonPath: 'carousel.advanced.loop.desktop.value', type: 'boolean', description: 'Infinite loop' },
    ],
    description: 'Any type of carousel using module groups as slides. Works with the Loop Builder for dynamic content carousels.',
    useCases: ['Testimonial carousels', 'Team member sliders', 'Product showcases', 'Post-based carousels', 'Custom card sliders'],
    customCssTargets: ['Main Element', 'Slide', 'Navigation', 'Pagination', 'Before', 'After'],
  },
];

// ---------------------------------------------------------------------------
// Layout / Card Modules
// ---------------------------------------------------------------------------

export const DIVI5_LAYOUT_MODULES: Divi5Module[] = [
  {
    name: 'Blurb',
    slug: 'divi/blurb',
    cssClass: 'et_pb_blurb',
    cssSelectors: {
      wrapper: '.et_pb_blurb',
      container: '.et_pb_blurb_container',
      imageIcon: '.et-pb-icon',
      iconCircle: '.et-pb-icon-circle',
      content: '.et_pb_blurb_content',
      title: '.et_pb_module_header',
      description: '.et_pb_blurb_description',
    },
    category: 'layout',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Feature card', 'Service card', 'Icon + text', 'Info card', 'Blurb', 'Icon box'],
    properties: [
      { name: 'Title', jsonPath: 'title.innerContent.desktop.value.text', type: 'text', description: 'Card title' },
      { name: 'Body Text', jsonPath: 'content.innerContent.desktop.value', type: 'html', description: 'Description text' },
      { name: 'Image Source', jsonPath: 'imageIcon.innerContent.desktop.value.src', type: 'url', description: 'Top image URL' },
      { name: 'Image Width', jsonPath: 'imageIcon.advanced.width.desktop.value.image', type: 'size', description: 'Image width' },
      { name: 'Icon', jsonPath: 'imageIcon.innerContent.desktop.value.icon', type: 'icon', description: 'Icon instead of image' },
      { name: 'Title Font', jsonPath: 'title.decoration.font.font.desktop.value', type: 'font', description: 'Title font settings' },
      { name: 'Body Font', jsonPath: 'content.decoration.bodyFont.body.font.desktop.value', type: 'font', description: 'Body text font settings' },
      { name: 'Text Orientation', jsonPath: 'module.advanced.text.text.desktop.value.orientation', type: 'select', description: 'Content alignment', options: ['left', 'center', 'right'] },
      { name: 'Link URL', jsonPath: 'link.innerContent.desktop.value.url', type: 'url', description: 'Click destination' },
    ],
    description: 'Card layout combining image/icon, title, and body text. The most popular module for feature cards and service descriptions.',
    useCases: ['Service cards', 'Feature highlights', 'Team member cards', 'Icon boxes', 'Info cards'],
    customCssTargets: ['Main Element', 'Image/Icon', 'Icon Circle', 'Title', 'Description', 'Before', 'After'],
  },
  {
    name: 'Hero',
    slug: 'divi/hero',
    cssClass: 'et_pb_hero',
    cssSelectors: {
      wrapper: '.et_pb_hero',
    },
    category: 'layout',
    isContainer: false,
    isNewInDivi5: true,
    figmaMapping: ['Hero section', 'Hero banner', 'Page header', 'Landing page hero', 'Full-width header', 'Jumbotron'],
    properties: [
      { name: 'Title', jsonPath: 'title.innerContent.desktop.value', type: 'text', description: 'Hero title' },
      { name: 'Subtitle', jsonPath: 'subtitle.innerContent.desktop.value', type: 'text', description: 'Hero subtitle' },
      { name: 'Body Text', jsonPath: 'content.innerContent.desktop.value', type: 'html', description: 'Hero body text' },
      { name: 'Button 1 Text', jsonPath: 'button1.innerContent.desktop.value.text', type: 'text', description: 'Primary button text' },
      { name: 'Button 1 URL', jsonPath: 'button1.innerContent.desktop.value.url', type: 'url', description: 'Primary button link' },
      { name: 'Button 2 Text', jsonPath: 'button2.innerContent.desktop.value.text', type: 'text', description: 'Secondary button text' },
      { name: 'Button 2 URL', jsonPath: 'button2.innerContent.desktop.value.url', type: 'url', description: 'Secondary button link' },
      { name: 'Image', jsonPath: 'image.innerContent.desktop.value.src', type: 'url', description: 'Hero image' },
      { name: 'Icon', jsonPath: 'icon.innerContent.desktop.value', type: 'icon', description: 'Hero icon' },
    ],
    description: 'All-in-one hero component with title, subtitle, body text, two images, an icon, and two side-by-side buttons. Replaces and enhances the Divi 4 Fullwidth Header.',
    useCases: ['Landing page heroes', 'Page headers', 'Promotional banners', 'Welcome sections', 'Above-the-fold content'],
    customCssTargets: ['Main Element', 'Title', 'Subtitle', 'Content', 'Button 1', 'Button 2', 'Image', 'Icon', 'Before', 'After'],
  },
  {
    name: 'Call to Action',
    slug: 'divi/cta',
    cssClass: 'et_pb_promo',
    cssSelectors: {
      wrapper: '.et_pb_promo',
      description: '.et_pb_promo_description',
      title: '.et_pb_module_header',
      button: '.et_pb_promo_button',
    },
    category: 'layout',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['CTA section', 'Call to action block', 'Promo banner', 'Banner with button'],
    properties: [
      { name: 'Title', jsonPath: 'title.innerContent.desktop.value', type: 'text', description: 'CTA title' },
      { name: 'Body Text', jsonPath: 'content.innerContent.desktop.value', type: 'html', description: 'CTA description' },
      { name: 'Button Text', jsonPath: 'button.innerContent.desktop.value.text', type: 'text', description: 'Button label' },
      { name: 'Button URL', jsonPath: 'button.innerContent.desktop.value.url', type: 'url', description: 'Button destination' },
      { name: 'Background Color', jsonPath: 'module.decoration.background.desktop.value.color', type: 'color', description: 'CTA background' },
    ],
    description: 'Combined title, text, and button in a single promotional block with customizable background.',
    useCases: ['Newsletter signups', 'Promotional banners', 'Action prompts', 'Conversion sections'],
    customCssTargets: ['Main Element', 'Title', 'Description', 'Button', 'Before', 'After'],
  },
  {
    name: 'Person',
    slug: 'divi/person',
    cssClass: 'et_pb_team_member',
    cssSelectors: {
      wrapper: '.et_pb_team_member',
      image: '.et_pb_team_member_image',
      name: '.et_pb_module_header',
      position: '.et_pb_member_position',
      description: '.et_pb_team_member_description',
      socialIcons: '.et_pb_member_social_links',
    },
    category: 'layout',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Team member card', 'Person card', 'Profile card', 'Author card', 'Staff member'],
    properties: [
      { name: 'Name', jsonPath: 'title.innerContent.desktop.value', type: 'text', description: 'Person name' },
      { name: 'Position', jsonPath: 'position.innerContent.desktop.value', type: 'text', description: 'Job title / position' },
      { name: 'Bio', jsonPath: 'content.innerContent.desktop.value', type: 'html', description: 'Bio description' },
      { name: 'Photo', jsonPath: 'image.innerContent.desktop.value.src', type: 'url', description: 'Person photo URL' },
      { name: 'Facebook URL', jsonPath: 'social.facebook.desktop.value', type: 'url', description: 'Facebook profile link' },
      { name: 'Twitter URL', jsonPath: 'social.twitter.desktop.value', type: 'url', description: 'Twitter profile link' },
      { name: 'LinkedIn URL', jsonPath: 'social.linkedin.desktop.value', type: 'url', description: 'LinkedIn profile link' },
    ],
    description: 'Identity card for team members with photo, name, position, bio, and social media links.',
    useCases: ['Team pages', 'About us sections', 'Author bios', 'Staff directories'],
    customCssTargets: ['Main Element', 'Image', 'Name', 'Position', 'Description', 'Social Icons', 'Before', 'After'],
  },
  {
    name: 'Testimonial',
    slug: 'divi/testimonial',
    cssClass: 'et_pb_testimonial',
    cssSelectors: {
      wrapper: '.et_pb_testimonial',
      portrait: '.et_pb_testimonial_portrait',
      author: '.et_pb_testimonial_author',
      meta: '.et_pb_testimonial_meta',
      description: '.et_pb_testimonial_description',
    },
    category: 'layout',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Testimonial card', 'Review card', 'Quote card', 'Customer review'],
    properties: [
      { name: 'Author', jsonPath: 'title.innerContent.desktop.value', type: 'text', description: 'Reviewer name' },
      { name: 'Position', jsonPath: 'position.innerContent.desktop.value', type: 'text', description: 'Author position/company' },
      { name: 'Company', jsonPath: 'company.innerContent.desktop.value', type: 'text', description: 'Company name' },
      { name: 'Quote', jsonPath: 'content.innerContent.desktop.value', type: 'html', description: 'Testimonial text' },
      { name: 'Portrait', jsonPath: 'image.innerContent.desktop.value.src', type: 'url', description: 'Author photo' },
      { name: 'Company URL', jsonPath: 'company.innerContent.desktop.value.url', type: 'url', description: 'Company website link' },
    ],
    description: 'Customer review display with photo, name, position, company, and quote text.',
    useCases: ['Customer reviews', 'Testimonials', 'Social proof sections', 'Case study quotes'],
    customCssTargets: ['Main Element', 'Portrait', 'Author', 'Position', 'Company', 'Description', 'Before', 'After'],
  },
  {
    name: 'Pricing Tables',
    slug: 'divi/pricing-tables',
    cssClass: 'et_pb_pricing_table',
    cssSelectors: {
      wrapper: '.et_pb_pricing',
      table: '.et_pb_pricing_table',
      heading: '.et_pb_pricing_heading',
      title: '.et_pb_pricing_title',
      subtitle: '.et_pb_pricing_subtitle',
      price: '.et_pb_pricing_content_top .et_pb_sum',
      currency: '.et_pb_dollar_sign',
      frequency: '.et_pb_frequency',
      content: '.et_pb_pricing_content',
      button: '.et_pb_pricing_table_button',
      featured: '.et_pb_featured_table',
    },
    category: 'layout',
    isContainer: true,
    isNewInDivi5: false,
    figmaMapping: ['Pricing table', 'Pricing card', 'Plan comparison', 'Subscription tiers'],
    properties: [
      { name: 'Title', jsonPath: 'title.innerContent.desktop.value', type: 'text', description: 'Plan name' },
      { name: 'Subtitle', jsonPath: 'subtitle.innerContent.desktop.value', type: 'text', description: 'Plan subtitle' },
      { name: 'Price', jsonPath: 'price.innerContent.desktop.value', type: 'text', description: 'Plan price amount' },
      { name: 'Currency', jsonPath: 'price.innerContent.desktop.value.currency', type: 'text', description: 'Currency symbol' },
      { name: 'Frequency', jsonPath: 'price.innerContent.desktop.value.frequency', type: 'text', description: 'Billing period (e.g. /month)' },
      { name: 'Features', jsonPath: 'content.innerContent.desktop.value', type: 'html', description: 'Feature list items' },
      { name: 'Button Text', jsonPath: 'button.innerContent.desktop.value.text', type: 'text', description: 'CTA button text' },
      { name: 'Featured', jsonPath: 'pricing.advanced.featured.desktop.value', type: 'boolean', description: 'Highlight as featured plan' },
    ],
    description: 'Pricing plan comparison with title, price, features list, and CTA button. Supports featured plan highlighting.',
    useCases: ['SaaS pricing pages', 'Plan comparisons', 'Subscription tiers', 'Service packages'],
    customCssTargets: ['Main Element', 'Heading', 'Title', 'Price', 'Currency', 'Frequency', 'Content', 'Button', 'Featured Table'],
  },
];

// ---------------------------------------------------------------------------
// Counter / Stat Modules
// ---------------------------------------------------------------------------

export const DIVI5_COUNTER_MODULES: Divi5Module[] = [
  {
    name: 'Bar Counters',
    slug: 'divi/bar-counters',
    cssClass: 'et_pb_counters',
    cssSelectors: {
      wrapper: '.et_pb_counters',
      bar: '.et_pb_counter_container',
      amount: '.et_pb_counter_amount',
      title: '.et_pb_counter_title',
    },
    category: 'counters',
    isContainer: true,
    isNewInDivi5: false,
    figmaMapping: ['Progress bars', 'Skill bars', 'Stat bars', 'Horizontal bar chart'],
    properties: [
      { name: 'Bar Title', jsonPath: 'bars[].title.desktop.value', type: 'text', description: 'Bar label' },
      { name: 'Percentage', jsonPath: 'bars[].percent.desktop.value', type: 'number', description: 'Bar percentage (0-100)' },
      { name: 'Bar Color', jsonPath: 'bars[].color.desktop.value', type: 'color', description: 'Fill color' },
      { name: 'Background Color', jsonPath: 'module.decoration.background.desktop.value.color', type: 'color', description: 'Bar track color' },
    ],
    description: 'Animated horizontal progress bars with lazy-load animation for displaying stats, skills, or percentages.',
    useCases: ['Skill levels', 'Project progress', 'Statistics display', 'Fundraising goals'],
    customCssTargets: ['Main Element', 'Bar', 'Bar Amount', 'Bar Title', 'Before', 'After'],
  },
  {
    name: 'Circle Counter',
    slug: 'divi/circle-counter',
    cssClass: 'et_pb_circle_counter',
    cssSelectors: {
      wrapper: '.et_pb_circle_counter',
      number: '.et_pb_circle_counter .percent p',
    },
    category: 'counters',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Circular progress', 'Donut chart', 'Circle stat', 'Percentage circle'],
    properties: [
      { name: 'Percentage', jsonPath: 'counter.innerContent.desktop.value.percent', type: 'number', description: 'Percentage value (0-100)' },
      { name: 'Bar Color', jsonPath: 'counter.decoration.color.desktop.value', type: 'color', description: 'Progress circle color' },
      { name: 'Title', jsonPath: 'title.innerContent.desktop.value', type: 'text', description: 'Below-circle title' },
    ],
    description: 'Circular progress indicator with animated fill and percentage display in the center.',
    useCases: ['Stats display', 'Achievement percentages', 'Loading indicators', 'Skill visualizations'],
    customCssTargets: ['Main Element', 'Circle', 'Number', 'Title', 'Before', 'After'],
  },
  {
    name: 'Number Counter',
    slug: 'divi/number-counter',
    cssClass: 'et_pb_number_counter',
    cssSelectors: {
      wrapper: '.et_pb_number_counter',
      number: '.et_pb_number_counter .percent p',
      title: '.et_pb_number_counter .title',
    },
    category: 'counters',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Stat number', 'Counter', 'Metric display', 'Key figure'],
    properties: [
      { name: 'Number', jsonPath: 'counter.innerContent.desktop.value.number', type: 'number', description: 'Target number to count to' },
      { name: 'Title', jsonPath: 'title.innerContent.desktop.value', type: 'text', description: 'Label below the number' },
      { name: 'Prefix', jsonPath: 'counter.innerContent.desktop.value.prefix', type: 'text', description: 'Before number (e.g. $)' },
      { name: 'Suffix', jsonPath: 'counter.innerContent.desktop.value.suffix', type: 'text', description: 'After number (e.g. +, %)' },
    ],
    description: 'Animated counting number display with optional prefix/suffix. Unlike Circle Counter, no percentage restriction.',
    useCases: ['Key metrics', 'Company stats', 'Achievement numbers', 'Impact figures'],
    customCssTargets: ['Main Element', 'Number', 'Title', 'Before', 'After'],
  },
  {
    name: 'Countdown Timer',
    slug: 'divi/countdown-timer',
    cssClass: 'et_pb_countdown_timer',
    cssSelectors: {
      wrapper: '.et_pb_countdown_timer',
      container: '.et_pb_countdown_timer_container',
    },
    category: 'counters',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Countdown', 'Timer', 'Launch countdown', 'Event timer'],
    properties: [
      { name: 'Target Date', jsonPath: 'timer.innerContent.desktop.value.date', type: 'text', description: 'Countdown target date-time' },
      { name: 'Title', jsonPath: 'title.innerContent.desktop.value', type: 'text', description: 'Countdown title' },
    ],
    description: 'Real-time countdown timer showing days, hours, minutes, and seconds until a target date.',
    useCases: ['Product launches', 'Event countdowns', 'Sale timers', 'Limited offers'],
    customCssTargets: ['Main Element', 'Title', 'Timer Container', 'Digits', 'Labels', 'Before', 'After'],
  },
];

// ---------------------------------------------------------------------------
// Form Modules
// ---------------------------------------------------------------------------

export const DIVI5_FORM_MODULES: Divi5Module[] = [
  {
    name: 'Contact Form',
    slug: 'divi/contact-form',
    cssClass: 'et_pb_contact_form_container',
    cssSelectors: {
      wrapper: '.et_pb_contact_form_container',
      form: '.et_pb_contact_form',
      field: '.et_pb_contact_field',
      name: '.et_pb_contact_name',
      email: '.et_pb_contact_email',
      message: '.et_pb_contact_message',
      submit: '.et_pb_contact_submit',
    },
    category: 'forms',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Contact form', 'Form', 'Input form', 'Inquiry form'],
    properties: [
      { name: 'Title', jsonPath: 'title.innerContent.desktop.value', type: 'text', description: 'Form title' },
      { name: 'Success Message', jsonPath: 'form.advanced.successMessage.desktop.value', type: 'text', description: 'Shown after submission' },
      { name: 'Redirect URL', jsonPath: 'form.advanced.redirectUrl.desktop.value', type: 'url', description: 'Redirect after submit' },
    ],
    description: 'Customizable contact form with conditional logic support. Fields include name, email, message, and custom fields.',
    useCases: ['Contact pages', 'Inquiry forms', 'Quote request forms', 'Feedback forms'],
    customCssTargets: ['Main Element', 'Title', 'Field', 'Input', 'Submit Button', 'Before', 'After'],
  },
  {
    name: 'Email Optin',
    slug: 'divi/email-optin',
    cssClass: 'et_pb_newsletter',
    cssSelectors: {
      wrapper: '.et_pb_newsletter',
      subscribe: '.et_pb_subscribe',
      form: '.et_pb_newsletter_form',
      button: '.et_pb_newsletter_button',
      title: '.et_pb_module_header',
      description: '.et_pb_newsletter_description',
    },
    category: 'forms',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Newsletter signup', 'Email capture', 'Subscribe form', 'Opt-in form'],
    properties: [
      { name: 'Title', jsonPath: 'title.innerContent.desktop.value', type: 'text', description: 'Form title' },
      { name: 'Description', jsonPath: 'content.innerContent.desktop.value', type: 'html', description: 'Form description' },
      { name: 'Button Text', jsonPath: 'button.innerContent.desktop.value.text', type: 'text', description: 'Submit button label' },
      { name: 'Provider', jsonPath: 'optin.advanced.provider.desktop.value', type: 'select', description: 'Email service', options: ['mailchimp', 'aweber', 'convertkit', 'activecampaign', 'drip', 'getresponse', 'hubspot', 'infusionsoft', 'mailerlite', 'mailpoet', 'ontraport', 'salesforce', 'sendinblue', 'constant_contact', 'emma', 'feedblitz', 'madmimi', 'icontact'] },
    ],
    description: 'Email subscription form compatible with 20+ email marketing providers. Supports nested modules in Divi 5.',
    useCases: ['Newsletter signups', 'Lead capture forms', 'Email list building', 'Gated content'],
    customCssTargets: ['Main Element', 'Title', 'Description', 'Form', 'Input', 'Button', 'Before', 'After'],
  },
  {
    name: 'Login Form',
    slug: 'divi/login',
    cssClass: 'et_pb_login',
    cssSelectors: {
      wrapper: '.et_pb_login',
      form: '.et_pb_login_form',
    },
    category: 'forms',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Login form', 'Sign in form', 'Authentication form'],
    properties: [
      { name: 'Title', jsonPath: 'title.innerContent.desktop.value', type: 'text', description: 'Login form title' },
      { name: 'Description', jsonPath: 'content.innerContent.desktop.value', type: 'html', description: 'Form description' },
      { name: 'Redirect URL', jsonPath: 'login.advanced.redirectUrl.desktop.value', type: 'url', description: 'Redirect after login' },
    ],
    description: 'WordPress login form that can be placed anywhere on a page.',
    useCases: ['Member login pages', 'Restricted content areas', 'Client portals'],
    customCssTargets: ['Main Element', 'Title', 'Description', 'Form', 'Input', 'Button', 'Before', 'After'],
  },
  {
    name: 'Search',
    slug: 'divi/search',
    cssClass: 'et_pb_search',
    cssSelectors: {
      wrapper: '.et_pb_search',
      form: '.et_pb_search_form',
      input: '.et_pb_s',
      button: '.et_pb_searchsubmit',
    },
    category: 'forms',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Search bar', 'Search input', 'Search form'],
    properties: [
      { name: 'Placeholder', jsonPath: 'search.advanced.placeholder.desktop.value', type: 'text', description: 'Input placeholder text' },
      { name: 'Exclude Pages', jsonPath: 'search.advanced.excludePages.desktop.value', type: 'boolean', description: 'Exclude pages from results' },
      { name: 'Exclude Posts', jsonPath: 'search.advanced.excludePosts.desktop.value', type: 'boolean', description: 'Exclude posts from results' },
    ],
    description: 'WordPress search bar with customizable styling and content exclusion options.',
    useCases: ['Site search', 'Blog search', 'Resource search', 'Knowledge base search'],
    customCssTargets: ['Main Element', 'Form', 'Input', 'Button', 'Before', 'After'],
  },
];

// ---------------------------------------------------------------------------
// Blog / Post Modules
// ---------------------------------------------------------------------------

export const DIVI5_BLOG_MODULES: Divi5Module[] = [
  {
    name: 'Blog',
    slug: 'divi/blog',
    cssClass: 'et_pb_blog_grid',
    cssSelectors: {
      wrapper: '.et_pb_blog_grid',
      post: '.et_pb_post',
      image: '.et_pb_image_container',
      title: '.entry-title',
      meta: '.post-meta',
      content: '.post-content',
    },
    category: 'blog',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Blog grid', 'Post grid', 'Article list', 'News feed', 'Content grid'],
    properties: [
      { name: 'Display Mode', jsonPath: 'blog.advanced.layout.desktop.value', type: 'select', description: 'Layout style', options: ['grid', 'list'] },
      { name: 'Posts Per Page', jsonPath: 'blog.advanced.postsNumber.desktop.value', type: 'number', description: 'Number of posts to show' },
      { name: 'Categories', jsonPath: 'blog.advanced.categories.desktop.value', type: 'text', description: 'Category filter' },
      { name: 'Show Featured Image', jsonPath: 'blog.advanced.showThumbnail.desktop.value', type: 'boolean', description: 'Display post thumbnails' },
      { name: 'Show Date', jsonPath: 'blog.advanced.showDate.desktop.value', type: 'boolean', description: 'Display post dates' },
      { name: 'Show Author', jsonPath: 'blog.advanced.showAuthor.desktop.value', type: 'boolean', description: 'Display post authors' },
      { name: 'Show Excerpt', jsonPath: 'blog.advanced.showExcerpt.desktop.value', type: 'boolean', description: 'Display post excerpts' },
    ],
    description: 'Display blog posts in grid or list layout with filtering by category. Supports featured images, meta, and excerpts.',
    useCases: ['Blog pages', 'News sections', 'Article archives', 'Resource libraries'],
    customCssTargets: ['Main Element', 'Post', 'Image', 'Title', 'Meta', 'Content', 'Pagination', 'Before', 'After'],
  },
  {
    name: 'Portfolio',
    slug: 'divi/portfolio',
    cssClass: 'et_pb_portfolio',
    cssSelectors: {
      wrapper: '.et_pb_portfolio',
      item: '.et_pb_portfolio_item',
      image: '.et_pb_portfolio_image',
      title: '.et_pb_portfolio_title',
    },
    category: 'blog',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Portfolio grid', 'Project gallery', 'Work samples', 'Case studies grid'],
    properties: [
      { name: 'Columns', jsonPath: 'portfolio.advanced.columns.desktop.value', type: 'number', description: 'Grid columns' },
      { name: 'Categories', jsonPath: 'portfolio.advanced.categories.desktop.value', type: 'text', description: 'Project category filter' },
    ],
    description: 'Display Divi Projects post type in a grid layout.',
    useCases: ['Portfolio pages', 'Work showcases', 'Project galleries'],
    customCssTargets: ['Main Element', 'Item', 'Image', 'Title', 'Overlay', 'Before', 'After'],
  },
  {
    name: 'Filterable Portfolio',
    slug: 'divi/filterable-portfolio',
    cssClass: 'et_pb_filterable_portfolio',
    cssSelectors: {
      wrapper: '.et_pb_filterable_portfolio',
      filters: '.et_pb_portfolio_filters',
      item: '.et_pb_portfolio_item',
    },
    category: 'blog',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Filterable portfolio', 'Categorized gallery', 'Tabbed portfolio'],
    properties: [
      { name: 'Categories', jsonPath: 'portfolio.advanced.categories.desktop.value', type: 'text', description: 'Category tabs' },
      { name: 'Show Filter', jsonPath: 'portfolio.advanced.showFilter.desktop.value', type: 'boolean', description: 'Show category filter tabs' },
    ],
    description: 'Portfolio with category filter tabs for sorting projects by type.',
    useCases: ['Multi-category portfolios', 'Filtered project galleries', 'Work by category'],
    customCssTargets: ['Main Element', 'Filters', 'Active Filter', 'Item', 'Image', 'Title', 'Before', 'After'],
  },
  {
    name: 'Post Slider',
    slug: 'divi/post-slider',
    cssClass: 'et_pb_post_slider',
    cssSelectors: {
      wrapper: '.et_pb_post_slider',
      slide: '.et_pb_slide',
    },
    category: 'blog',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Post carousel', 'Article slider', 'Featured posts slider'],
    properties: [
      { name: 'Posts Count', jsonPath: 'slider.advanced.postsNumber.desktop.value', type: 'number', description: 'Number of posts' },
      { name: 'Categories', jsonPath: 'slider.advanced.categories.desktop.value', type: 'text', description: 'Category filter' },
      { name: 'Auto Animate', jsonPath: 'slider.advanced.auto.desktop.value', type: 'boolean', description: 'Auto-play slides' },
    ],
    description: 'Carousel-style display of blog posts with featured images as slide backgrounds.',
    useCases: ['Featured post sliders', 'Article highlights', 'Content showcases'],
    customCssTargets: ['Main Element', 'Slide', 'Title', 'Meta', 'Content', 'Button', 'Arrows', 'Before', 'After'],
  },
  {
    name: 'Post Carousel',
    slug: 'divi/post-carousel',
    cssClass: 'et_pb_post_carousel',
    cssSelectors: {
      wrapper: '.et_pb_post_carousel',
    },
    category: 'blog',
    isContainer: false,
    isNewInDivi5: true,
    figmaMapping: ['Post carousel', 'Article cards carousel', 'Blog carousel'],
    properties: [
      { name: 'Posts Count', jsonPath: 'carousel.advanced.postsNumber.desktop.value', type: 'number', description: 'Number of posts' },
      { name: 'Slides Per View', jsonPath: 'carousel.advanced.slidesPerView.desktop.value', type: 'number', description: 'Visible slides' },
    ],
    description: 'Portfolio/post display in a carousel layout. Ideal for showcasing work on portfolio or home pages.',
    useCases: ['Portfolio carousels', 'Blog post carousels', 'Featured content sliders'],
    customCssTargets: ['Main Element', 'Slide', 'Image', 'Title', 'Navigation', 'Before', 'After'],
  },
  {
    name: 'Post Content',
    slug: 'divi/post-content',
    cssClass: 'et_pb_post_content',
    cssSelectors: {
      wrapper: '.et_pb_post_content',
    },
    category: 'blog',
    isContainer: false,
    isNewInDivi5: true,
    figmaMapping: ['Post body', 'Article content area'],
    properties: [],
    description: 'Renders the full post/page content in theme builder templates. Used for dynamic content areas.',
    useCases: ['Post templates', 'Page templates', 'Dynamic content areas'],
    customCssTargets: ['Main Element', 'Before', 'After'],
  },
  {
    name: 'Post Title',
    slug: 'divi/post-title',
    cssClass: 'et_pb_post_title',
    cssSelectors: {
      wrapper: '.et_pb_post_title',
      title: '.et_pb_post_title h1',
      meta: '.et_pb_title_meta_container',
      featuredImage: '.et_pb_title_featured_container',
    },
    category: 'blog',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Post header', 'Article title', 'Page title bar'],
    properties: [
      { name: 'Show Title', jsonPath: 'postTitle.advanced.showTitle.desktop.value', type: 'boolean', description: 'Display the title' },
      { name: 'Show Meta', jsonPath: 'postTitle.advanced.showMeta.desktop.value', type: 'boolean', description: 'Display post meta' },
      { name: 'Show Featured Image', jsonPath: 'postTitle.advanced.showFeaturedImage.desktop.value', type: 'boolean', description: 'Display featured image' },
      { name: 'Featured Image Placement', jsonPath: 'postTitle.advanced.featuredImagePlacement.desktop.value', type: 'select', description: 'Image placement', options: ['above', 'below', 'background'] },
    ],
    description: 'Display the post/page title with optional meta information and featured image.',
    useCases: ['Blog post headers', 'Page title bars', 'Article headers'],
    customCssTargets: ['Main Element', 'Title', 'Meta', 'Featured Image', 'Before', 'After'],
  },
  {
    name: 'Post Navigation',
    slug: 'divi/post-navigation',
    cssClass: 'et_pb_post_nav',
    cssSelectors: {
      wrapper: '.et_pb_post_nav',
      prev: '.et_pb_post_nav_prev',
      next: '.et_pb_post_nav_next',
    },
    category: 'navigation',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Post navigation', 'Previous/Next links', 'Article pagination'],
    properties: [
      { name: 'Show Previous', jsonPath: 'nav.advanced.showPrev.desktop.value', type: 'boolean', description: 'Show previous link' },
      { name: 'Show Next', jsonPath: 'nav.advanced.showNext.desktop.value', type: 'boolean', description: 'Show next link' },
      { name: 'Same Category', jsonPath: 'nav.advanced.sameCategory.desktop.value', type: 'boolean', description: 'Limit to same category' },
    ],
    description: 'Previous/next navigation links between blog posts.',
    useCases: ['Blog post navigation', 'Article browsing', 'Sequential content navigation'],
    customCssTargets: ['Main Element', 'Previous Link', 'Next Link', 'Before', 'After'],
  },
  {
    name: 'Comments',
    slug: 'divi/comments',
    cssClass: 'et_pb_comments_module',
    cssSelectors: {
      wrapper: '.et_pb_comments_module',
    },
    category: 'blog',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Comments section', 'Discussion area'],
    properties: [],
    description: 'WordPress comment display and form that can be placed anywhere on a page.',
    useCases: ['Blog post comments', 'Discussion sections', 'Feedback areas'],
    customCssTargets: ['Main Element', 'Comment', 'Comment Author', 'Comment Date', 'Comment Form', 'Before', 'After'],
  },
  {
    name: 'Pagination',
    slug: 'divi/pagination',
    cssClass: 'et_pb_pagination',
    cssSelectors: {
      wrapper: '.et_pb_pagination',
    },
    category: 'navigation',
    isContainer: false,
    isNewInDivi5: true,
    figmaMapping: ['Pagination', 'Page numbers', 'Page navigation'],
    properties: [],
    description: 'Page navigation for paginated content like blog archives and search results.',
    useCases: ['Blog archives', 'Search results', 'Paginated listings'],
    customCssTargets: ['Main Element', 'Page Number', 'Active Page', 'Previous', 'Next', 'Before', 'After'],
  },
];

// ---------------------------------------------------------------------------
// Navigation Modules
// ---------------------------------------------------------------------------

export const DIVI5_NAVIGATION_MODULES: Divi5Module[] = [
  {
    name: 'Menu',
    slug: 'divi/menu',
    cssClass: 'et_pb_menu',
    cssSelectors: {
      wrapper: '.et_pb_menu',
      nav: '.et_pb_menu nav',
      menuItems: '.et_pb_menu_inner',
    },
    category: 'navigation',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Navigation menu', 'Nav bar', 'Menu', 'Header navigation'],
    properties: [
      { name: 'Menu ID', jsonPath: 'menu.innerContent.desktop.value.menuId', type: 'select', description: 'WordPress menu to display' },
      { name: 'Logo', jsonPath: 'menu.advanced.logo.desktop.value', type: 'url', description: 'Logo image URL' },
      { name: 'Style', jsonPath: 'menu.advanced.style.desktop.value', type: 'select', description: 'Menu layout style', options: ['left', 'centered', 'inline-centered'] },
    ],
    description: 'WordPress navigation menu display with logo, search icon, and mobile hamburger menu.',
    useCases: ['Site navigation', 'Header menus', 'Footer menus', 'Sidebar navigation'],
    customCssTargets: ['Main Element', 'Menu Item', 'Active Menu Item', 'Submenu', 'Logo', 'Search Icon', 'Hamburger', 'Before', 'After'],
  },
  {
    name: 'Sidebar',
    slug: 'divi/sidebar',
    cssClass: 'et_pb_sidebar',
    cssSelectors: {
      wrapper: '.et_pb_sidebar',
      widget: '.et_pb_widget',
    },
    category: 'navigation',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Sidebar', 'Widget area', 'Side navigation'],
    properties: [
      { name: 'Widget Area', jsonPath: 'sidebar.innerContent.desktop.value.area', type: 'select', description: 'Widget area to display' },
      { name: 'Show Title', jsonPath: 'sidebar.advanced.showTitle.desktop.value', type: 'boolean', description: 'Show widget titles' },
    ],
    description: 'Display a WordPress widget area (sidebar) anywhere on the page.',
    useCases: ['Blog sidebars', 'Widget areas', 'Supplementary navigation'],
    customCssTargets: ['Main Element', 'Widget', 'Widget Title', 'Before', 'After'],
  },
];

// ---------------------------------------------------------------------------
// Utility Modules
// ---------------------------------------------------------------------------

export const DIVI5_UTILITY_MODULES: Divi5Module[] = [
  {
    name: 'Divider',
    slug: 'divi/divider',
    cssClass: 'et_pb_divider',
    cssSelectors: {
      wrapper: '.et_pb_divider',
      line: '.et_pb_divider .et_pb_divider_internal',
    },
    category: 'utility',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Divider', 'Horizontal rule', 'Separator', 'Line', 'Spacer'],
    properties: [
      { name: 'Show Line', jsonPath: 'divider.advanced.line.desktop.value.show', type: 'select', description: 'Show/hide the line', options: ['on', 'off'] },
      { name: 'Line Color', jsonPath: 'divider.advanced.line.desktop.value.color', type: 'color', description: 'Line color' },
      { name: 'Line Position', jsonPath: 'divider.advanced.line.desktop.value.position', type: 'select', description: 'Vertical position', options: ['top', 'center', 'bottom'] },
      { name: 'Line Weight', jsonPath: 'divider.advanced.line.desktop.value.weight', type: 'size', description: 'Line thickness' },
      { name: 'Line Style', jsonPath: 'divider.advanced.line.desktop.value.style', type: 'select', description: 'Line style', options: ['solid', 'dashed', 'dotted', 'double'] },
    ],
    description: 'Visual separator or spacer between sections. Use show="off" for spacing-only dividers.',
    useCases: ['Section separators', 'Content dividers', 'Vertical spacing', 'Decorative lines'],
    customCssTargets: ['Main Element', 'Line', 'Before', 'After'],
  },
  {
    name: 'Icon',
    slug: 'divi/icon',
    cssClass: 'et_pb_icon',
    cssSelectors: {
      wrapper: '.et_pb_icon',
    },
    category: 'utility',
    isContainer: false,
    isNewInDivi5: true,
    figmaMapping: ['Icon', 'Symbol', 'Glyph', 'Icon element'],
    properties: [
      { name: 'Icon', jsonPath: 'icon.innerContent.desktop.value', type: 'icon', description: 'Icon from Divi icon library (thousands available)' },
      { name: 'Color', jsonPath: 'icon.decoration.color.desktop.value', type: 'color', description: 'Icon color' },
      { name: 'Size', jsonPath: 'icon.decoration.size.desktop.value', type: 'size', description: 'Icon size' },
      { name: 'Alignment', jsonPath: 'module.advanced.alignment.desktop.value', type: 'select', description: 'Horizontal alignment', options: ['left', 'center', 'right'] },
      { name: 'Link URL', jsonPath: 'link.innerContent.desktop.value.url', type: 'url', description: 'Click link' },
    ],
    description: 'Display a single icon from the Divi icon library (thousands of icons). Can be linked and styled.',
    useCases: ['Decorative icons', 'Feature icons', 'Social icons', 'Navigation icons'],
    customCssTargets: ['Main Element', 'Icon', 'Before', 'After'],
  },
  {
    name: 'Icon List',
    slug: 'divi/icon-list',
    cssClass: 'et_pb_icon_list',
    cssSelectors: {
      wrapper: '.et_pb_icon_list',
    },
    category: 'utility',
    isContainer: true,
    isNewInDivi5: true,
    figmaMapping: ['Icon list', 'Feature list with icons', 'Checklist', 'Bullet list with icons'],
    properties: [
      { name: 'Icon', jsonPath: 'iconList.advanced.defaultIcon.desktop.value', type: 'icon', description: 'Default icon for all items' },
      { name: 'Icon Color', jsonPath: 'iconList.decoration.iconColor.desktop.value', type: 'color', description: 'Default icon color' },
    ],
    description: 'List with customizable icons per item. Simplifies creating visually appealing lists without manual CSS.',
    useCases: ['Feature lists', 'Benefits lists', 'Checklists', 'Process steps', 'Specification lists'],
    customCssTargets: ['Main Element', 'List Item', 'Icon', 'Text', 'Before', 'After'],
  },
  {
    name: 'Social Media Follow',
    slug: 'divi/social-media-follow',
    cssClass: 'et_pb_social_media_follow',
    cssSelectors: {
      wrapper: '.et_pb_social_media_follow',
      link: '.et_pb_social_media_follow li a',
      icon: '.et_pb_social_icon',
    },
    category: 'social',
    isContainer: true,
    isNewInDivi5: false,
    figmaMapping: ['Social icons', 'Social media links', 'Follow buttons', 'Social bar'],
    properties: [
      { name: 'Networks', jsonPath: 'social.innerContent.desktop.value', type: 'text', description: 'Social network configurations (up to 14+)' },
    ],
    description: 'Social media icon links supporting 50+ platforms including Facebook, Twitter/X, Instagram, LinkedIn, YouTube, TikTok, and more.',
    useCases: ['Footer social links', 'Header social icons', 'Author social profiles', 'Follow CTAs'],
    customCssTargets: ['Main Element', 'Social Icon', 'Social Link', 'Before', 'After'],
  },
  {
    name: 'Map',
    slug: 'divi/map',
    cssClass: 'et_pb_map_container',
    cssSelectors: {
      wrapper: '.et_pb_map_container',
      map: '.et_pb_map',
    },
    category: 'utility',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Map', 'Google Map', 'Location map', 'Address map'],
    properties: [
      { name: 'Address', jsonPath: 'map.innerContent.desktop.value.address', type: 'text', description: 'Map center address' },
      { name: 'Zoom', jsonPath: 'map.innerContent.desktop.value.zoom', type: 'number', description: 'Zoom level' },
    ],
    description: 'Google Maps embed with custom markers, styling, and interaction controls. Requires Google Maps API key.',
    useCases: ['Contact pages', 'Location displays', 'Store locators', 'Office locations'],
    customCssTargets: ['Main Element', 'Map', 'Pin', 'Before', 'After'],
  },
  {
    name: 'Link',
    slug: 'divi/link',
    cssClass: 'et_pb_link',
    cssSelectors: {
      wrapper: '.et_pb_link',
    },
    category: 'utility',
    isContainer: false,
    isNewInDivi5: true,
    figmaMapping: ['Text link', 'Hyperlink', 'Inline link'],
    properties: [
      { name: 'Text', jsonPath: 'link.innerContent.desktop.value.text', type: 'text', description: 'Link text' },
      { name: 'URL', jsonPath: 'link.innerContent.desktop.value.url', type: 'url', description: 'Link destination' },
    ],
    description: 'Standalone link element for text hyperlinks with full design control.',
    useCases: ['Text links', 'Read more links', 'Navigation links'],
    customCssTargets: ['Main Element', 'Link', 'Before', 'After'],
  },
  {
    name: 'Dropdown',
    slug: 'divi/dropdown',
    cssClass: 'et_pb_dropdown',
    cssSelectors: {
      wrapper: '.et_pb_dropdown',
    },
    category: 'utility',
    isContainer: true,
    isNewInDivi5: true,
    figmaMapping: ['Dropdown menu', 'Dropdown content', 'Expandable section'],
    properties: [
      { name: 'Trigger Text', jsonPath: 'trigger.innerContent.desktop.value', type: 'text', description: 'Dropdown trigger text' },
    ],
    description: 'Dropdown container that reveals content on click or hover. Can hold any nested modules.',
    useCases: ['Dropdown menus', 'Expandable content', 'Info popups', 'Mega menus'],
    customCssTargets: ['Main Element', 'Trigger', 'Content', 'Before', 'After'],
  },
];

// ---------------------------------------------------------------------------
// WooCommerce Modules (17 total)
// ---------------------------------------------------------------------------

export const DIVI5_WOOCOMMERCE_MODULES: Divi5Module[] = [
  {
    name: 'Woo Products',
    slug: 'divi/woo-products',
    cssClass: 'et_pb_wc_products',
    cssSelectors: { wrapper: '.et_pb_wc_products', product: '.product' },
    category: 'woocommerce',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Product grid', 'Shop grid', 'Product listing'],
    properties: [
      { name: 'Columns', jsonPath: 'products.advanced.columns.desktop.value', type: 'number', description: 'Grid columns' },
      { name: 'Number', jsonPath: 'products.advanced.number.desktop.value', type: 'number', description: 'Products to show' },
      { name: 'Category', jsonPath: 'products.advanced.category.desktop.value', type: 'text', description: 'Filter by category' },
    ],
    description: 'Display WooCommerce products in a customizable grid layout.',
    useCases: ['Shop pages', 'Featured products', 'Category listings'],
    customCssTargets: ['Main Element', 'Product', 'Product Image', 'Product Title', 'Product Price', 'Add to Cart Button'],
  },
  {
    name: 'Woo Product Title',
    slug: 'divi/woo-product-title',
    cssClass: 'et_pb_wc_title',
    cssSelectors: { wrapper: '.et_pb_wc_title' },
    category: 'woocommerce',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Product title', 'Product name'],
    properties: [],
    description: 'Display the current product title. Dynamic - pulls from WooCommerce product data.',
    useCases: ['Product page header', 'Custom product templates'],
    customCssTargets: ['Main Element', 'Title'],
  },
  {
    name: 'Woo Product Description',
    slug: 'divi/woo-product-description',
    cssClass: 'et_pb_wc_description',
    cssSelectors: { wrapper: '.et_pb_wc_description' },
    category: 'woocommerce',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Product description', 'Product details text'],
    properties: [],
    description: 'Display the product long-form description. Pulls dynamically from WooCommerce.',
    useCases: ['Product pages', 'Product detail templates'],
    customCssTargets: ['Main Element', 'Description'],
  },
  {
    name: 'Woo Product Price',
    slug: 'divi/woo-product-price',
    cssClass: 'et_pb_wc_price',
    cssSelectors: { wrapper: '.et_pb_wc_price', price: '.price', salePrice: '.sale_price' },
    category: 'woocommerce',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Product price', 'Price tag', 'Price display'],
    properties: [],
    description: 'Display the product price with sale price support. Updates in real-time from WooCommerce.',
    useCases: ['Product pages', 'Quick view', 'Product cards'],
    customCssTargets: ['Main Element', 'Price', 'Sale Price', 'Regular Price'],
  },
  {
    name: 'Woo Product Images',
    slug: 'divi/woo-product-images',
    cssClass: 'et_pb_wc_images',
    cssSelectors: { wrapper: '.et_pb_wc_images' },
    category: 'woocommerce',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Product image', 'Product photo', 'Product gallery'],
    properties: [],
    description: 'Display the main product image with optional zoom and lightbox effects.',
    useCases: ['Product pages', 'Product image display'],
    customCssTargets: ['Main Element', 'Image', 'Gallery Thumbnails'],
  },
  {
    name: 'Woo Product Gallery',
    slug: 'divi/woo-product-gallery',
    cssClass: 'et_pb_wc_gallery',
    cssSelectors: { wrapper: '.et_pb_wc_gallery' },
    category: 'woocommerce',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Product image gallery', 'Product thumbnails'],
    properties: [],
    description: 'Full product image gallery with thumbnails and navigation.',
    useCases: ['Product pages', 'Image galleries'],
    customCssTargets: ['Main Element', 'Main Image', 'Thumbnails'],
  },
  {
    name: 'Woo Product Add to Cart',
    slug: 'divi/woo-product-add-to-cart',
    cssClass: 'et_pb_wc_add_to_cart',
    cssSelectors: { wrapper: '.et_pb_wc_add_to_cart', button: '.single_add_to_cart_button' },
    category: 'woocommerce',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Add to cart button', 'Buy button', 'Purchase button'],
    properties: [],
    description: 'Product add-to-cart button with quantity selector and variation dropdowns.',
    useCases: ['Product pages', 'Quick buy sections'],
    customCssTargets: ['Main Element', 'Quantity Input', 'Button', 'Variations'],
  },
  {
    name: 'Woo Product Rating',
    slug: 'divi/woo-product-rating',
    cssClass: 'et_pb_wc_rating',
    cssSelectors: { wrapper: '.et_pb_wc_rating', stars: '.star-rating' },
    category: 'woocommerce',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Star rating', 'Product rating', 'Review stars'],
    properties: [],
    description: 'Display the product star rating pulled from WooCommerce reviews.',
    useCases: ['Product pages', 'Product cards'],
    customCssTargets: ['Main Element', 'Stars', 'Rating Count'],
  },
  {
    name: 'Woo Product Reviews',
    slug: 'divi/woo-product-reviews',
    cssClass: 'et_pb_wc_reviews',
    cssSelectors: { wrapper: '.et_pb_wc_reviews' },
    category: 'woocommerce',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Product reviews', 'Customer reviews section'],
    properties: [],
    description: 'Display and collect product reviews with rating and comment form.',
    useCases: ['Product pages', 'Review sections'],
    customCssTargets: ['Main Element', 'Review', 'Review Author', 'Review Rating', 'Review Form'],
  },
  {
    name: 'Woo Product Meta',
    slug: 'divi/woo-product-meta',
    cssClass: 'et_pb_wc_meta',
    cssSelectors: { wrapper: '.et_pb_wc_meta' },
    category: 'woocommerce',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Product meta', 'SKU', 'Categories', 'Tags'],
    properties: [],
    description: 'Display product metadata: SKU, categories, and tags.',
    useCases: ['Product pages', 'Product info sections'],
    customCssTargets: ['Main Element', 'SKU', 'Categories', 'Tags'],
  },
  {
    name: 'Woo Product Tabs',
    slug: 'divi/woo-product-tabs',
    cssClass: 'et_pb_wc_tabs',
    cssSelectors: { wrapper: '.et_pb_wc_tabs' },
    category: 'woocommerce',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Product tabs', 'Description/Reviews tabs'],
    properties: [],
    description: 'WooCommerce product tabs (Description, Additional Info, Reviews) in tabbed layout.',
    useCases: ['Product pages'],
    customCssTargets: ['Main Element', 'Tab', 'Tab Content', 'Active Tab'],
  },
  {
    name: 'Woo Product Stock',
    slug: 'divi/woo-product-stock',
    cssClass: 'et_pb_wc_stock',
    cssSelectors: { wrapper: '.et_pb_wc_stock' },
    category: 'woocommerce',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Stock status', 'Availability indicator'],
    properties: [],
    description: 'Display product stock status (in stock, out of stock, low stock).',
    useCases: ['Product pages', 'Inventory display'],
    customCssTargets: ['Main Element', 'Stock Status'],
  },
  {
    name: 'Woo Product Upsell',
    slug: 'divi/woo-product-upsell',
    cssClass: 'et_pb_wc_upsell',
    cssSelectors: { wrapper: '.et_pb_wc_upsell' },
    category: 'woocommerce',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Upsell products', 'Recommended products'],
    properties: [],
    description: 'Display upsell product suggestions on the product page.',
    useCases: ['Product pages', 'Cross-selling sections'],
    customCssTargets: ['Main Element', 'Product', 'Product Image', 'Product Title', 'Product Price'],
  },
  {
    name: 'Woo Related Products',
    slug: 'divi/woo-related-products',
    cssClass: 'et_pb_wc_related',
    cssSelectors: { wrapper: '.et_pb_wc_related' },
    category: 'woocommerce',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Related products', 'Similar products'],
    properties: [],
    description: 'Display related products based on category and tags.',
    useCases: ['Product pages', 'Related items sections'],
    customCssTargets: ['Main Element', 'Product', 'Product Image', 'Product Title', 'Product Price'],
  },
  {
    name: 'Woo Product Information',
    slug: 'divi/woo-product-info',
    cssClass: 'et_pb_wc_info',
    cssSelectors: { wrapper: '.et_pb_wc_info' },
    category: 'woocommerce',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Product additional info', 'Product attributes'],
    properties: [],
    description: 'Display additional product information and attributes.',
    useCases: ['Product pages', 'Specification displays'],
    customCssTargets: ['Main Element', 'Info Row', 'Label', 'Value'],
  },
  {
    name: 'Woo Breadcrumbs',
    slug: 'divi/woo-breadcrumbs',
    cssClass: 'et_pb_wc_breadcrumbs',
    cssSelectors: { wrapper: '.et_pb_wc_breadcrumbs' },
    category: 'woocommerce',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Breadcrumbs', 'Navigation trail'],
    properties: [],
    description: 'WooCommerce breadcrumb navigation trail (Home > Category > Product).',
    useCases: ['Product pages', 'Category pages', 'Shop navigation'],
    customCssTargets: ['Main Element', 'Breadcrumb Link', 'Separator'],
  },
  {
    name: 'Woo Notice',
    slug: 'divi/woo-notice',
    cssClass: 'et_pb_wc_notice',
    cssSelectors: { wrapper: '.et_pb_wc_notice' },
    category: 'woocommerce',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Notice', 'Alert message', 'Cart notification'],
    properties: [],
    description: 'WooCommerce notice/alert messages (success, error, info).',
    useCases: ['Cart pages', 'Checkout pages', 'Notifications'],
    customCssTargets: ['Main Element', 'Notice Text'],
  },
];

// ---------------------------------------------------------------------------
// WooCommerce Cart & Checkout Modules (6 additional)
// ---------------------------------------------------------------------------

export const DIVI5_WOO_CART_CHECKOUT_MODULES: Divi5Module[] = [
  {
    name: 'Woo Cart Products',
    slug: 'divi/woo-cart-products',
    cssClass: 'et_pb_wc_cart_products',
    cssSelectors: { wrapper: '.et_pb_wc_cart_products' },
    category: 'woocommerce',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Cart items list', 'Shopping cart table'],
    properties: [],
    description: 'Display the list of products in the user\'s cart with quantity controls.',
    useCases: ['Cart pages'],
    customCssTargets: ['Main Element', 'Product Row', 'Product Image', 'Product Name', 'Quantity', 'Remove', 'Subtotal'],
  },
  {
    name: 'Woo Cart Totals',
    slug: 'divi/woo-cart-totals',
    cssClass: 'et_pb_wc_cart_totals',
    cssSelectors: { wrapper: '.et_pb_wc_cart_totals' },
    category: 'woocommerce',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Cart summary', 'Order total', 'Cart totals'],
    properties: [],
    description: 'Display cart subtotal, shipping, tax, and total with checkout button.',
    useCases: ['Cart pages'],
    customCssTargets: ['Main Element', 'Subtotal', 'Shipping', 'Total', 'Checkout Button'],
  },
  {
    name: 'Woo Cross-Sells',
    slug: 'divi/woo-cross-sells',
    cssClass: 'et_pb_wc_cross_sells',
    cssSelectors: { wrapper: '.et_pb_wc_cross_sells' },
    category: 'woocommerce',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Cross-sell products', 'Suggested products'],
    properties: [],
    description: 'Display cross-sell product suggestions on the cart page.',
    useCases: ['Cart pages', 'Upselling'],
    customCssTargets: ['Main Element', 'Product', 'Product Image', 'Product Title', 'Product Price'],
  },
  {
    name: 'Woo Checkout Billing',
    slug: 'divi/woo-checkout-billing',
    cssClass: 'et_pb_wc_checkout_billing',
    cssSelectors: { wrapper: '.et_pb_wc_checkout_billing' },
    category: 'woocommerce',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Billing form', 'Checkout billing details'],
    properties: [],
    description: 'Checkout billing details form (name, address, email, phone).',
    useCases: ['Checkout pages'],
    customCssTargets: ['Main Element', 'Form Field', 'Label', 'Input'],
  },
  {
    name: 'Woo Checkout Details',
    slug: 'divi/woo-checkout-details',
    cssClass: 'et_pb_wc_checkout_details',
    cssSelectors: { wrapper: '.et_pb_wc_checkout_details' },
    category: 'woocommerce',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Order details', 'Checkout order summary'],
    properties: [],
    description: 'Checkout order details table showing purchased products and prices.',
    useCases: ['Checkout pages'],
    customCssTargets: ['Main Element', 'Product Row', 'Product Name', 'Product Price', 'Total'],
  },
  {
    name: 'Woo Checkout Payment',
    slug: 'divi/woo-checkout-payment',
    cssClass: 'et_pb_wc_checkout_payment',
    cssSelectors: { wrapper: '.et_pb_wc_checkout_payment' },
    category: 'woocommerce',
    isContainer: false,
    isNewInDivi5: false,
    figmaMapping: ['Payment form', 'Payment methods', 'Checkout payment'],
    properties: [],
    description: 'Payment method selection and payment form during checkout.',
    useCases: ['Checkout pages'],
    customCssTargets: ['Main Element', 'Payment Method', 'Payment Form', 'Place Order Button'],
  },
];

// ---------------------------------------------------------------------------
// Combined Master List
// ---------------------------------------------------------------------------

export const ALL_DIVI5_MODULES: Divi5Module[] = [
  ...DIVI5_STRUCTURAL_ELEMENTS,
  ...DIVI5_CONTENT_MODULES,
  ...DIVI5_MEDIA_MODULES,
  ...DIVI5_INTERACTIVE_MODULES,
  ...DIVI5_LAYOUT_MODULES,
  ...DIVI5_COUNTER_MODULES,
  ...DIVI5_FORM_MODULES,
  ...DIVI5_BLOG_MODULES,
  ...DIVI5_NAVIGATION_MODULES,
  ...DIVI5_UTILITY_MODULES,
  ...DIVI5_WOOCOMMERCE_MODULES,
  ...DIVI5_WOO_CART_CHECKOUT_MODULES,
];

// ---------------------------------------------------------------------------
// Lookup Helpers
// ---------------------------------------------------------------------------

/** Find a Divi 5 module by its block slug (e.g. 'divi/text') */
export function getModuleBySlug(slug: string): Divi5Module | undefined {
  return ALL_DIVI5_MODULES.find(m => m.slug === slug);
}

/** Find a Divi 5 module by its CSS class (e.g. 'et_pb_text') */
export function getModuleByCssClass(cssClass: string): Divi5Module | undefined {
  return ALL_DIVI5_MODULES.find(m => m.cssClass === cssClass);
}

/** Find modules that match a Figma element description */
export function findModulesForFigmaElement(description: string): Divi5Module[] {
  const lower = description.toLowerCase();
  return ALL_DIVI5_MODULES.filter(m =>
    m.figmaMapping.some(mapping => lower.includes(mapping.toLowerCase())) ||
    m.name.toLowerCase().includes(lower) ||
    m.description.toLowerCase().includes(lower)
  );
}

/** Get all modules in a category */
export function getModulesByCategory(category: Divi5ModuleCategory): Divi5Module[] {
  return ALL_DIVI5_MODULES.filter(m => m.category === category);
}

/** Get only modules that are new in Divi 5 */
export function getNewDivi5Modules(): Divi5Module[] {
  return ALL_DIVI5_MODULES.filter(m => m.isNewInDivi5);
}

/** Get all container modules (that can hold child modules) */
export function getContainerModules(): Divi5Module[] {
  return ALL_DIVI5_MODULES.filter(m => m.isContainer);
}

// ---------------------------------------------------------------------------
// Figma-to-Divi Mapping Guide (for AI prompt injection)
// ---------------------------------------------------------------------------

/**
 * Returns a concise mapping guide suitable for injecting into AI prompts.
 * This helps the AI map Figma design elements to the correct Divi 5 modules.
 */
export function getFigmaToDiviMappingPrompt(): string {
  const lines: string[] = [
    '## Figma Element to Divi 5 Module Mapping Guide',
    '',
    '### Structural Elements',
    '- Top-level frame/section -> divi/section',
    '- Horizontal auto layout -> divi/row + divi/column children',
    '- Vertical auto layout -> divi/column',
    '- Component group/wrapper -> divi/group (NEW in Divi 5)',
    '- Nested row/grid -> nested divi/row inside divi/column',
    '',
    '### Text Elements',
    '- Large heading text (H1-H6) -> divi/heading (NEW in Divi 5, preferred over divi/text for headings)',
    '- Body text / paragraphs -> divi/text',
    '- Rich text with mixed formatting -> divi/text (supports HTML)',
    '- Code snippets / embeds -> divi/code',
    '',
    '### Media Elements',
    '- Single image -> divi/image',
    '- Image grid / gallery -> divi/gallery',
    '- Video player / embed -> divi/video',
    '- Audio player -> divi/audio',
    '- Animated illustration -> divi/lottie (NEW in Divi 5)',
    '- Image comparison slider -> divi/before-after-image (NEW in Divi 5)',
    '',
    '### Interactive Elements',
    '- Button / CTA button -> divi/button',
    '- Tab component -> divi/tabs',
    '- Accordion / FAQ -> divi/accordion',
    '- Collapsible section -> divi/toggle',
    '- Image/content slider -> divi/slider',
    '- Card carousel -> divi/group-carousel (NEW in Divi 5)',
    '- Video carousel -> divi/video-slider',
    '',
    '### Layout Components',
    '- Feature card (icon + title + text) -> divi/blurb',
    '- Hero section (title + subtitle + buttons + image) -> divi/hero (NEW in Divi 5)',
    '- CTA banner (title + text + button) -> divi/cta',
    '- Team member card -> divi/person',
    '- Testimonial / review card -> divi/testimonial',
    '- Pricing table / plan card -> divi/pricing-tables',
    '',
    '### Counters & Stats',
    '- Progress bars -> divi/bar-counters',
    '- Circular progress -> divi/circle-counter',
    '- Number stat -> divi/number-counter',
    '- Countdown timer -> divi/countdown-timer',
    '',
    '### Forms',
    '- Contact form -> divi/contact-form',
    '- Email signup / newsletter -> divi/email-optin',
    '- Login form -> divi/login',
    '- Search bar -> divi/search',
    '',
    '### Navigation',
    '- Nav menu -> divi/menu',
    '- Sidebar -> divi/sidebar',
    '- Post prev/next -> divi/post-navigation',
    '- Pagination -> divi/pagination (NEW in Divi 5)',
    '',
    '### Utility',
    '- Divider / separator / spacer -> divi/divider',
    '- Single icon -> divi/icon (NEW in Divi 5)',
    '- Icon list / feature list -> divi/icon-list (NEW in Divi 5)',
    '- Social media icons -> divi/social-media-follow',
    '- Google Map -> divi/map',
    '- Text link -> divi/link (NEW in Divi 5)',
    '- Dropdown content -> divi/dropdown (NEW in Divi 5)',
    '',
    '### Blog & Posts',
    '- Blog post grid/list -> divi/blog',
    '- Portfolio grid -> divi/portfolio or divi/filterable-portfolio',
    '- Post slider -> divi/post-slider',
    '- Post carousel -> divi/post-carousel (NEW in Divi 5)',
    '- Post body content -> divi/post-content (NEW in Divi 5)',
    '- Post title header -> divi/post-title',
    '- Comments section -> divi/comments',
    '',
    '### WooCommerce (17 product + 6 cart/checkout modules)',
    '- Product grid -> divi/woo-products',
    '- Product title -> divi/woo-product-title',
    '- Product price -> divi/woo-product-price',
    '- Product images -> divi/woo-product-images',
    '- Product gallery -> divi/woo-product-gallery',
    '- Add to cart -> divi/woo-product-add-to-cart',
    '- Product description -> divi/woo-product-description',
    '- Product rating -> divi/woo-product-rating',
    '- Product reviews -> divi/woo-product-reviews',
    '- Product meta (SKU, categories) -> divi/woo-product-meta',
    '- Product tabs -> divi/woo-product-tabs',
    '- Product stock -> divi/woo-product-stock',
    '- Upsell products -> divi/woo-product-upsell',
    '- Related products -> divi/woo-related-products',
    '- Product info -> divi/woo-product-info',
    '- Breadcrumbs -> divi/woo-breadcrumbs',
    '- Notice/alert -> divi/woo-notice',
    '- Cart products list -> divi/woo-cart-products',
    '- Cart totals -> divi/woo-cart-totals',
    '- Cross-sells -> divi/woo-cross-sells',
    '- Checkout billing -> divi/woo-checkout-billing',
    '- Checkout details -> divi/woo-checkout-details',
    '- Checkout payment -> divi/woo-checkout-payment',
  ];

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CSS Class Reference (for CSS generation)
// ---------------------------------------------------------------------------

/**
 * Returns a map of module slugs to their primary CSS class,
 * useful for generating CSS targeting rules.
 */
export function getCssClassMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const mod of ALL_DIVI5_MODULES) {
    map[mod.slug] = mod.cssClass;
  }
  return map;
}

/**
 * Column width fraction reference.
 * Divi 5 uses fractions of 24 for column widths.
 */
export const COLUMN_WIDTH_MAP: Record<string, string> = {
  'full':      '24_24',  // 100%
  '3/4':       '18_24',  // 75%
  '2/3':       '16_24',  // 66.67%
  '1/2':       '12_24',  // 50%
  '1/3':       '8_24',   // 33.33%
  '1/4':       '6_24',   // 25%
  '1/5':       '5_24',   // ~20.83%
  '1/6':       '4_24',   // ~16.67%
};

/**
 * Common flex column structure presets.
 * Used in divi/row module.advanced.flexColumnStructure
 */
export const ROW_COLUMN_STRUCTURES: Record<string, string> = {
  '1 column':          'equal-columns_1',
  '2 equal columns':   'equal-columns_2',
  '3 equal columns':   'equal-columns_3',
  '4 equal columns':   'equal-columns_4',
  '5 equal columns':   'equal-columns_5',
  '6 equal columns':   'equal-columns_6',
};
