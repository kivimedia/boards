// ============================================================================
// AGENT SKILL SEED DATA
// All 16 skills from Skills Pack + Creative Pack with quality assessments
// ============================================================================

import type { AgentSkillCategory, AgentSkillPack, AgentQualityTier } from './types';

export interface SkillSeed {
  slug: string;
  name: string;
  description: string;
  category: AgentSkillCategory;
  pack: AgentSkillPack;
  system_prompt: string;
  quality_tier: AgentQualityTier;
  quality_score: number;
  quality_notes: string;
  strengths: string[];
  weaknesses: string[];
  improvement_suggestions: string[];
  supported_tools: string[];
  required_context: string[];
  output_format: string;
  estimated_tokens: number;
  depends_on: string[];
  feeds_into: string[];
  requires_mcp_tools: string[];
  fallback_behavior: string | null;
  reference_docs: { name: string; content_summary: string; quality: string }[];
  icon: string;
  color: string;
  sort_order: number;
}

export const SKILL_SEEDS: SkillSeed[] = [
  // =========================================================================
  // SKILLS PACK (10 skills)
  // =========================================================================
  {
    slug: 'orchestrator',
    name: 'Orchestrator',
    description: 'Meta-skill that routes to other skills based on user goals. Manages workflow dependencies and selective context passing between skills.',
    category: 'meta',
    pack: 'skills',
    quality_tier: 'genuinely_smart',
    quality_score: 88,
    quality_notes: 'Architecturally smart. Solves the real hard problem — not "how do I write copy" but "what should I do first, and what feeds into what." The Context Paradox section (selective context passing) shows real systems thinking.',
    strengths: [
      'Dependency tree: Foundation → Strategy → Execution → Distribution layers',
      'Context Paradox section: explains why NOT to pass full context between skills',
      '6 pre-built workflows covering common marketing scenarios',
      'Qualifying questions with routing logic',
      'Compression principle for inter-skill context'
    ],
    weaknesses: [
      'Workflows are prescriptive — no adaptive path-finding',
      'No error recovery if a mid-workflow skill fails',
      'Doesn\'t account for partial outputs from failed skills'
    ],
    improvement_suggestions: [
      'Add adaptive routing based on available context/outputs',
      'Add error recovery and skip/retry logic for failed skills',
      'Add a "discovery mode" that interviews the user before routing'
    ],
    supported_tools: ['create_card', 'post_comment', 'add_label', 'assign_user'],
    required_context: ['user_goal', 'available_skills'],
    output_format: 'markdown',
    estimated_tokens: 1500,
    depends_on: [],
    feeds_into: ['brand-voice', 'positioning-angles', 'keyword-research', 'content-atomizer', 'direct-response-copy', 'email-sequences', 'lead-magnet', 'newsletter', 'seo-content'],
    requires_mcp_tools: [],
    fallback_behavior: null,
    reference_docs: [],
    icon: '🧠',
    color: '#8B5CF6',
    sort_order: 0,
  },
  {
    slug: 'direct-response-copy',
    name: 'Direct Response Copy',
    description: 'Full-spectrum direct response copywriting. Covers headlines, opening lines, curiosity gaps, pain quantification, flow techniques, founder stories, testimonials, disqualification, and CTAs.',
    category: 'content',
    pack: 'skills',
    quality_tier: 'genuinely_smart',
    quality_score: 95,
    quality_notes: 'Best in class. 2,168 lines of actual copywriting knowledge. Encodes Schwartz\'s 5 awareness levels, Sugarman\'s psychological triggers, the "slippery slide" technique. The "AI tells to avoid" section alone is worth the entire pack.',
    strengths: [
      'Opinionated — says "do this, not that" with specific before/after examples',
      'AI tells to avoid: lists specific words/patterns that make AI copy sound robotic',
      'Real reference material (Hopkins, Ogilvy, Halbert, Caples, Sugarman, Collier) distilled into actionable patterns',
      'Modern internet-native examples alongside classic frameworks',
      'Pain quantification formulas and rhythm alternation patterns'
    ],
    weaknesses: [
      'Very long (2168 lines) — could overwhelm context window',
      'Slightly biased toward long-form copy; short-form (ads, taglines) underrepresented',
      'No industry-specific variations'
    ],
    improvement_suggestions: [
      'Add a "mode" selector for short-form vs long-form copy',
      'Add industry-specific tone adjustments (B2B, e-commerce, SaaS, etc.)',
      'Create a condensed version for smaller context windows'
    ],
    supported_tools: ['post_comment', 'update_custom_field'],
    required_context: ['target_audience', 'product_info', 'awareness_level'],
    output_format: 'markdown',
    estimated_tokens: 3000,
    depends_on: ['brand-voice', 'positioning-angles'],
    feeds_into: ['email-sequences', 'lead-magnet', 'content-atomizer'],
    requires_mcp_tools: [],
    fallback_behavior: null,
    reference_docs: [],
    icon: '✍️',
    color: '#EF4444',
    sort_order: 1,
  },
  {
    slug: 'content-atomizer',
    name: 'Content Atomizer',
    description: 'Transforms one piece of content into platform-optimized assets for LinkedIn, Twitter/X, Instagram, TikTok, and YouTube with algorithm-aware formatting.',
    category: 'content',
    pack: 'skills',
    quality_tier: 'genuinely_smart',
    quality_score: 90,
    quality_notes: 'Smart and current. Platform playbooks with algorithm signals dated Dec 2025 are the killer feature. Anti-patterns per platform show real experience.',
    strengths: [
      'Platform-specific algorithm knowledge (dated, updatable)',
      'Hook formulas per platform are specific and tested',
      'Anti-patterns section shows real experience ("Don\'t use more than 3 hashtags on LinkedIn")',
      'Posting sequence strategies are practical',
      'Format specs match current platform requirements'
    ],
    weaknesses: [
      'Algorithm signals will need quarterly updates',
      'No engagement metrics or A/B testing guidance',
      'Doesn\'t handle audio/podcast content well'
    ],
    improvement_suggestions: [
      'Add 5-3-2 weekly posting rhythm from reference docs',
      'Add content repurposing matrix (source → platform mapping)',
      'Add common mistakes per platform section from references',
      'Add engagement benchmark expectations per format'
    ],
    supported_tools: ['create_card', 'post_comment'],
    required_context: ['source_content', 'target_platforms', 'brand_voice'],
    output_format: 'markdown',
    estimated_tokens: 2500,
    depends_on: ['brand-voice'],
    feeds_into: [],
    requires_mcp_tools: [],
    fallback_behavior: null,
    reference_docs: [
      { name: 'platform-playbook.md', content_summary: 'Deep-dive per-platform playbooks with creator examples, tested hooks, weekly rhythm, repurposing matrix, common mistakes', quality: 'high — adds operational detail and real examples' }
    ],
    icon: '⚡',
    color: '#F59E0B',
    sort_order: 2,
  },
  {
    slug: 'brand-voice',
    name: 'Brand Voice',
    description: 'Extract voice from existing content or build from scratch. Outputs a structured voice profile (tone spectrum, vocabulary, rhythm, personality patterns).',
    category: 'strategy',
    pack: 'skills',
    quality_tier: 'solid',
    quality_score: 75,
    quality_notes: 'Good framework, well-structured, but not groundbreaking. Two worked examples (Marc Lou, coaching business) demonstrate the output well. More of a "run once" foundation skill.',
    strengths: [
      'Extract vs Build modes are practical',
      'Voice profile output format is complete and reusable',
      'Two full worked examples show real output quality',
      'Analysis patterns (sentence length, punctuation frequency) are specific'
    ],
    weaknesses: [
      'Analysis patterns feel listed rather than battle-tested',
      'No guidance on adapting voice across channels (email vs social vs landing page)',
      'No voice evolution tracking over time'
    ],
    improvement_suggestions: [
      'Add channel-specific voice adaptation guidance',
      'Add voice consistency scoring for new content',
      'Add competitive voice differentiation analysis'
    ],
    supported_tools: ['post_comment', 'update_custom_field'],
    required_context: ['existing_content_samples'],
    output_format: 'markdown',
    estimated_tokens: 2000,
    depends_on: [],
    feeds_into: ['direct-response-copy', 'email-sequences', 'newsletter', 'content-atomizer', 'seo-content'],
    requires_mcp_tools: [],
    fallback_behavior: null,
    reference_docs: [],
    icon: '🎤',
    color: '#8B5CF6',
    sort_order: 3,
  },
  {
    slug: 'email-sequences',
    name: 'Email Sequences',
    description: 'Design complete email sequences: welcome, nurture, conversion, launch, re-engagement, post-purchase. Full architecture with timing and subject line formulas.',
    category: 'content',
    pack: 'skills',
    quality_tier: 'solid',
    quality_score: 78,
    quality_notes: 'Comprehensive and practical, slightly formulaic. The DELIVER → CONNECT → VALUE → BRIDGE framework is good. Complete 7-email example welcome sequence with full copy is genuinely useful.',
    strengths: [
      '6 sequence types with clear templates',
      'Complete 7-email example with full copy',
      'Subject line formulas are battle-tested patterns',
      'Architecture patterns (Straight Line, Branch, Hybrid) described'
    ],
    weaknesses: [
      'Reads like a compiled email marketing course',
      'Architecture patterns described but not deeply explored',
      'No personalization/segmentation strategies',
      'No deliverability considerations'
    ],
    improvement_suggestions: [
      'Add dynamic segmentation and personalization strategies',
      'Add deliverability best practices (warm-up, authentication)',
      'Expand architecture patterns with decision trees',
      'Add A/B testing framework for subject lines and send times'
    ],
    supported_tools: ['create_card', 'post_comment'],
    required_context: ['brand_voice', 'target_audience', 'product_info', 'sequence_goal'],
    output_format: 'markdown',
    estimated_tokens: 3000,
    depends_on: ['brand-voice', 'direct-response-copy'],
    feeds_into: [],
    requires_mcp_tools: [],
    fallback_behavior: null,
    reference_docs: [],
    icon: '📧',
    color: '#3B82F6',
    sort_order: 4,
  },
  {
    slug: 'seo-content',
    name: 'SEO Content',
    description: '7-phase SEO content workflow: RESEARCH → BRIEF → OUTLINE → DRAFT → HUMANIZE → OPTIMIZE → REVIEW. Includes AI detection avoidance and E-E-A-T signals.',
    category: 'seo',
    pack: 'skills',
    quality_tier: 'solid',
    quality_score: 80,
    quality_notes: 'The "Humanize" section elevates the whole skill. Catalogs specific AI writing patterns at word, phrase, structure, and voice levels with before/after rewrites. Outside the Humanize section, it\'s a competent but unremarkable SEO playbook.',
    strengths: [
      'Humanize phase catalogs AI detection patterns with before/after rewrites',
      '4 content structure templates (Pillar Guide, How-To, Comparison, Listicle)',
      'E-E-A-T signals checklist is actionable',
      '7-phase workflow provides clear process'
    ],
    weaknesses: [
      'Outside Humanize phase, fairly standard SEO process',
      'No keyword gap analysis methodology',
      'No link building or content promotion strategies',
      'Doesn\'t integrate with actual SEO tools data'
    ],
    improvement_suggestions: [
      'Pull in "what makes content human" 5 criteria from eeat-examples reference',
      'Pull in the 7-pattern synthesis (specific numbers, named sources, etc.)',
      'Add content brief template for writer handoff',
      'Add internal linking strategy section'
    ],
    supported_tools: ['create_card', 'post_comment', 'update_custom_field'],
    required_context: ['target_keyword', 'brand_voice', 'audience_expertise_level'],
    output_format: 'markdown',
    estimated_tokens: 3000,
    depends_on: ['keyword-research', 'brand-voice'],
    feeds_into: ['content-atomizer'],
    requires_mcp_tools: [],
    fallback_behavior: null,
    reference_docs: [
      { name: 'eeat-examples.md', content_summary: '20 writer profiles with E-E-A-T breakdowns, 7-pattern synthesis for human content, 5 self-diagnostic questions', quality: 'high — essential for the Humanize phase' }
    ],
    icon: '🔍',
    color: '#10B981',
    sort_order: 5,
  },
  {
    slug: 'keyword-research',
    name: 'Keyword Research',
    description: '6 Circles Method for keyword expansion. SEED → EXPAND → CLUSTER → PRIORITIZE → MAP process with Pillar Validation and 90-day content calendar.',
    category: 'seo',
    pack: 'skills',
    quality_tier: 'solid',
    quality_score: 70,
    quality_notes: 'Good process, but inherently limited without actual keyword tool data. The 6 Circles expansion and Pillar Validation (4 checks) are genuinely useful frameworks.',
    strengths: [
      '6 Circles expansion method is systematic',
      'Pillar Validation with 4 checks prevents bad investments',
      'Priority matrix for deciding what to write first',
      '90-day content calendar template'
    ],
    weaknesses: [
      'No access to actual search volume, difficulty, or SERP data',
      'Lists free tools but can\'t use them directly',
      'Clustering is manual and potentially inconsistent',
      'No competitive keyword gap analysis'
    ],
    improvement_suggestions: [
      'Add structured prompts that help users import data from keyword tools',
      'Add SERP analysis framework (what to look for manually)',
      'Add competitive content gap methodology',
      'Add keyword intent classification guide'
    ],
    supported_tools: ['create_card', 'post_comment'],
    required_context: ['seed_keywords', 'niche', 'business_model'],
    output_format: 'markdown',
    estimated_tokens: 2000,
    depends_on: [],
    feeds_into: ['seo-content', 'content-atomizer'],
    requires_mcp_tools: [],
    fallback_behavior: null,
    reference_docs: [],
    icon: '🔑',
    color: '#6366F1',
    sort_order: 6,
  },
  {
    slug: 'newsletter',
    name: 'Newsletter',
    description: '6 newsletter archetypes (Deep-Dive, News Briefing, Curated Links, Personal Essay, Builder Updates, Irreverent News) with full templates and voice guidance.',
    category: 'content',
    pack: 'skills',
    quality_tier: 'solid',
    quality_score: 72,
    quality_notes: 'Good archetypes, nice templates, slightly safe. Referencing real newsletters (Lenny, Morning Brew, Ben\'s Bites) grounds it in reality. Doesn\'t go deep enough on WHY certain newsletters win.',
    strengths: [
      '6 well-chosen archetypes with full templates',
      'Real newsletter references ground the theory in practice',
      'Scannability checklist is practical',
      'Subject line formulas cover multiple styles'
    ],
    weaknesses: [
      'Voice & tone section is generic',
      'Doesn\'t explain WHY certain newsletters win (growth mechanics)',
      'No monetization strategy guidance',
      'No subscriber acquisition tactics'
    ],
    improvement_suggestions: [
      'Pull in Morning Brew\'s "22% humor rule" from references',
      'Pull in The Hustle\'s "Why it\'s weird" reframing technique',
      'Add referral program design principles from references',
      'Add growth/monetization considerations per archetype'
    ],
    supported_tools: ['create_card', 'post_comment'],
    required_context: ['brand_voice', 'newsletter_archetype', 'target_audience'],
    output_format: 'markdown',
    estimated_tokens: 2500,
    depends_on: ['brand-voice'],
    feeds_into: ['content-atomizer'],
    requires_mcp_tools: [],
    fallback_behavior: null,
    reference_docs: [
      { name: 'newsletter-examples.md', content_summary: 'Deep profiles of 7 newsletters with voice markers, growth tactics, and the 22% humor rule', quality: 'moderate — significant overlap with main skill' }
    ],
    icon: '📰',
    color: '#EC4899',
    sort_order: 7,
  },
  {
    slug: 'positioning-angles',
    name: 'Positioning & Angles',
    description: 'Find differentiated positioning angles using 9 generators (Contrarian, Unique Mechanism, Transformation, Enemy, Speed/Ease, Specificity, Social Proof, Risk Reversal, Overlooked Fact) + Kennedy diagnostic questions + Schwartz sophistication stages + Bencivenga validation.',
    category: 'strategy',
    pack: 'skills',
    quality_tier: 'genuinely_smart',
    quality_score: 82,
    quality_notes: 'Major rewrite integrated all 5 reference docs. Now 748 lines with Kennedy\'s 10 diagnostic questions as Step 0, So What Chain, 3 mechanism types (Named/Revealed/Innovated), MAGIC naming formula, 25 Schwartz diagnostic signals, Hopkins\' overlooked fact as 9th angle, Bencivenga Persuasion Equation validation, and a complete worked example. Each angle generator now has real examples, common mistakes, and when-to-use/when-not-to-use guidance.',
    strengths: [
      '9 angle generators with deep dives — each has examples, common mistakes, when-to-use/not-to-use',
      'Kennedy\'s 10 diagnostic questions as Step 0 surface emotional raw material before angle generation',
      'Schwartz 5 stages with 25 diagnostic signals — properly operationalized for market assessment',
      'So What Chain (Feature → Functional → Business Impact → Emotional Payoff) drives angles to emotional depth',
      '3 mechanism types (Named, Revealed, Innovated) with 4-step discovery process and language patterns',
      'MAGIC naming formula makes angles into named, proprietary-feeling concepts',
      'Bencivenga Persuasion Equation (Problem + Promise + Proof + Proposition) as validation gate',
      'Hopkins\' overlooked fact angle adds a genuinely non-obvious 9th angle type',
      'Complete worked example with 5 angles scored against persuasion equation',
      'Positioning Statement Template provides strategic foundation before angle exploration'
    ],
    weaknesses: [
      'Only one worked example (could use 2-3 across different industries)',
      'Dunford\'s 3 category options (head-to-head, create-new, subcategory) mentioned but not fully developed',
      'Could use more explicit competitive analysis framework',
      'No A/B testing guidance for choosing between generated angles'
    ],
    improvement_suggestions: [
      'Add 2 more worked examples across different industries (SaaS, services)',
      'Expand Dunford\'s category options into a decision framework',
      'Add competitive angle mapping tool (visual positioning of competitors)',
      'Add guidance on A/B testing and validating angles post-generation'
    ],
    supported_tools: ['post_comment', 'update_custom_field'],
    required_context: ['product_info', 'target_audience', 'competitors', 'market_maturity'],
    output_format: 'markdown',
    estimated_tokens: 2000,
    depends_on: [],
    feeds_into: ['direct-response-copy', 'lead-magnet', 'content-atomizer'],
    requires_mcp_tools: [],
    fallback_behavior: null,
    reference_docs: [
      { name: 'angle-frameworks.md', content_summary: 'Kennedy\'s 10 diagnostic questions, Hopkins overlooked fact technique, Bencivenga Persuasion Equation, 6-step synthesis', quality: 'INTEGRATED — Kennedy\'s questions as Step 0, Hopkins as 9th angle, Bencivenga as validation gate' },
      { name: 'dunford-positioning.md', content_summary: 'Dunford\'s 5 components, So What Chain, positioning statement template, 3 category options', quality: 'INTEGRATED — So What Chain and positioning statement template added to Step 1' },
      { name: 'hormozi-offer.md', content_summary: 'MAGIC naming formula, Starving Crowd criteria, guarantee types, bonus stacking rules', quality: 'INTEGRATED — MAGIC naming formula as dedicated section with examples' },
      { name: 'schwartz-sophistication.md', content_summary: '25 diagnostic signals for identifying market stage, proactive stage-shifting strategy', quality: 'INTEGRATED — 25 diagnostic signals added to Step 4 market sophistication assessment' },
      { name: 'unique-mechanism.md', content_summary: '3 mechanism types (Named, Revealed, Innovated), 4-step discovery process, language patterns', quality: 'INTEGRATED — 3 mechanism types, 4-step process, and language patterns in Step 3' }
    ],
    icon: '🎯',
    color: '#F97316',
    sort_order: 8,
  },
  {
    slug: 'lead-magnet',
    name: 'Lead Magnet',
    description: 'Generate lead magnet concepts using psychology-driven framework: 7 Cialdini/Kahneman triggers, Trust Equation, format selection matrix with conversion benchmarks, 8 hook generators, qualification signals, 3 business-type strategies, and 11-dimension psychology checklist.',
    category: 'strategy',
    pack: 'skills',
    quality_tier: 'genuinely_smart',
    quality_score: 79,
    quality_notes: 'Major rewrite integrated all 5 reference docs. Now 629 lines (was 349). Added 7 psychology triggers from Cialdini/Kahneman, Trust Equation, Commitment Ladder, Peak-End Rule, identity/aspiration concept, Format Selection Matrix with conversion benchmarks per format, 8 hook types (added Identity hook), qualification signals in output format, SaaS-specific patterns, 3 complete worked examples across industries, and 11-dimension psychology checklist replacing the old 5-point test.',
    strengths: [
      '7 psychology triggers (Reciprocity, Scarcity, Authority, Social Proof, Curiosity Gap, Loss Aversion, Commitment/Consistency) deeply integrated',
      'Trust Equation (Credibility + Reliability + Intimacy / Self-Orientation) applied to lead magnet design',
      'Format Selection Matrix with actual conversion benchmarks (Quizzes 15-25%, PDFs 2-8%, Calculators 10-20%, etc.)',
      '8 hook generators each with formula, example, and "works best when" guidance',
      '3 complete worked examples (copywriting course, PM SaaS, marketing agency) — different business types',
      'Qualification signals added to output format — each concept tells you what downloading reveals about the lead',
      'Commitment Ladder and Peak-End Rule make the psychological framework actionable',
      'SaaS-specific patterns (5 named patterns, SaaS vs Info Product comparison)',
      '11-dimension psychology checklist (scored 1-5) replaces old simplistic 5-point test',
      'Business type segmentation (Info Products, SaaS, Services) with distinct bridge patterns'
    ],
    weaknesses: [
      'Could use more on multi-step lead magnets (challenge → email → webinar → offer)',
      'No explicit competitive analysis of existing lead magnets in market',
      'Levesque quiz mechanism mentioned but could be deeper',
      'No guidance on lead magnet distribution/promotion strategy'
    ],
    improvement_suggestions: [
      'Add multi-step funnel architecture guidance (lead magnet → nurture → offer)',
      'Add competitive lead magnet audit framework',
      'Expand Levesque quiz mechanism into full implementation guide',
      'Add distribution channel guidance (where to promote each format type)'
    ],
    supported_tools: ['create_card', 'post_comment'],
    required_context: ['product_info', 'target_audience', 'business_model'],
    output_format: 'markdown',
    estimated_tokens: 1500,
    depends_on: ['positioning-angles'],
    feeds_into: ['email-sequences', 'direct-response-copy'],
    requires_mcp_tools: [],
    fallback_behavior: null,
    reference_docs: [
      { name: 'psychology.md', content_summary: '7 psychological triggers, commitment ladder, trust equation, peak-end rule, psychology checklist', quality: 'INTEGRATED — all 7 triggers, Trust Equation, Commitment Ladder, Peak-End Rule, 11-dimension checklist' },
      { name: 'format-examples.md', content_summary: 'Conversion rate benchmarks per format, format selection matrix, brand examples', quality: 'INTEGRATED — full Format Selection Matrix with conversion benchmarks per format' },
      { name: 'services-magnets.md', content_summary: 'Audit methodology, qualification framework (high-intent vs low-intent), ROI considerations', quality: 'INTEGRATED — audit deep dive, qualification signals in output format, services bridge pattern' },
      { name: 'info-product-magnets.md', content_summary: 'Practitioner profiles, Value Ladder, bridge pattern, quiz mechanism', quality: 'INTEGRATED — Value Ladder, Levesque quiz mechanism, micro-transformation bridge pattern' },
      { name: 'saas-magnets.md', content_summary: '5 SaaS patterns, SaaS vs Info Product comparison, metrics to track', quality: 'INTEGRATED — SaaS-specific patterns section with product experience bridge pattern' }
    ],
    icon: '🧲',
    color: '#14B8A6',
    sort_order: 9,
  },

  // =========================================================================
  // CREATIVE PACK (6 skills)
  // =========================================================================
  {
    slug: 'ai-creative-strategist',
    name: 'AI Creative Strategist',
    description: 'Creative director and thinking partner. Uses lateral thinking (Inversion, Analogy, Constraint, Mashup) + research to generate differentiated creative concepts.',
    category: 'creative',
    pack: 'creative',
    quality_tier: 'solid',
    quality_score: 77,
    quality_notes: 'The thinking framework is genuinely smart. Anti-Generic Imperative is great philosophy. Lateral thinking techniques are well-applied. Heavy MCP dependency for execution.',
    strengths: [
      '7-step creative process (Reframe → Research → Ideate → Angles → Visual → Naming → Brief)',
      'Lateral thinking techniques (Inversion, Analogy, Constraint, Mashup)',
      'Anti-Generic Imperative — philosophical backbone',
      'Content systems approach (beyond single assets)',
      'Style architecture framework'
    ],
    weaknesses: [
      'Heavy MCP dependency (Glif, Replicate, Playwright, Firecrawl, Perplexity)',
      'Without MCP tools it becomes a thinking framework only',
      'No visual psychology knowledge in main skill (relegated to reference)',
      'Research phase assumes tool access'
    ],
    improvement_suggestions: [
      'Pull in visual attention hierarchy (5 levels) from VISUAL_INTELLIGENCE reference',
      'Pull in 7-tier style taxonomy with keyword lists',
      'Pull in generic AI markers list (17 markers)',
      'Pull in quality checklist (16 points)',
      'Add fallback research methods for when MCP tools unavailable'
    ],
    supported_tools: ['create_card', 'post_comment', 'update_custom_field'],
    required_context: ['brand_info', 'campaign_goal', 'target_audience'],
    output_format: 'markdown',
    estimated_tokens: 2500,
    depends_on: ['brand-voice'],
    feeds_into: ['ai-image-generation', 'ai-product-photo', 'ai-social-graphics', 'ai-product-video', 'ai-talking-head'],
    requires_mcp_tools: ['glif', 'replicate', 'playwright', 'firecrawl', 'perplexity'],
    fallback_behavior: 'Functions as a creative thinking/briefing framework without image generation. Can output prompts for manual tool use.',
    reference_docs: [
      { name: 'VISUAL_INTELLIGENCE.md', content_summary: 'Visual psychology (attention hierarchy, 3-second threshold), 7-tier AI style taxonomy, 17 generic AI markers, brand identity breakdowns, 16-point quality checklist', quality: 'extremely high — most information-dense reference file' }
    ],
    icon: '🎨',
    color: '#A855F7',
    sort_order: 10,
  },
  {
    slug: 'ai-image-generation',
    name: 'AI Image Generation',
    description: 'Core image generation with structured prompt engineering. Default model: Nano Banana Pro via Glif. Prompt formula: SUBJECT + SETTING + STYLE + LIGHTING + QUALITY BOOSTERS.',
    category: 'creative',
    pack: 'creative',
    quality_tier: 'solid',
    quality_score: 73,
    quality_notes: 'Good prompt engineering guide. The prompt formula is clean and teachable. Style/lighting presets are useful reference. Entirely dependent on Glif/Replicate for execution.',
    strengths: [
      'Clean prompt formula (SUBJECT + SETTING + STYLE + LIGHTING + QUALITY)',
      'Opinionated model default (Nano Banana Pro) — avoids decision paralysis',
      'Style and lighting preset libraries',
      'Iteration strategies are practical',
      'Aspect ratio guide with use cases'
    ],
    weaknesses: [
      'Cannot generate images without Glif MCP tool',
      'Model-specific (Nano Banana Pro) — may not adapt well to other models',
      'No brand consistency guidance across multiple generations',
      'No negative prompt engineering'
    ],
    improvement_suggestions: [
      'Add negative prompt engineering section',
      'Add multi-model prompt adaptation guide',
      'Add brand consistency techniques (style reference images, seed values)',
      'Add batch generation workflow for campaigns'
    ],
    supported_tools: ['post_comment', 'update_custom_field'],
    required_context: ['image_description', 'style_preference', 'aspect_ratio'],
    output_format: 'markdown',
    estimated_tokens: 1500,
    depends_on: ['ai-creative-strategist'],
    feeds_into: ['ai-product-photo', 'ai-social-graphics', 'ai-product-video'],
    requires_mcp_tools: ['glif'],
    fallback_behavior: 'Outputs detailed generation prompts that can be copied into any image generation tool manually.',
    reference_docs: [],
    icon: '🖼️',
    color: '#EC4899',
    sort_order: 11,
  },
  {
    slug: 'ai-product-photo',
    name: 'AI Product Photo',
    description: 'Specialized product photography with 6 shot types, 6 category deep dives (Electronics, Fashion, Food, Beauty, Jewelry, Home), and platform-specific optimization.',
    category: 'creative',
    pack: 'creative',
    quality_tier: 'solid',
    quality_score: 82,
    quality_notes: 'The most thorough creative skill. Real product photography knowledge encoded. Category-specific prompts (e.g., "for jewelry, use a 3:1 key-to-fill ratio") show genuine expertise.',
    strengths: [
      '6 shot types with correct industry terminology',
      '6 product category deep dives with specific prompt strategies',
      'Lighting mastery section is genuinely knowledgeable',
      'Platform optimization (Amazon requirements vs Instagram aesthetic)',
      'Category-specific knowledge that saves real research time'
    ],
    weaknesses: [
      'Dependent on image generation tools',
      'No post-production guidance (editing, retouching workflows)',
      'No A/B testing framework for product images',
      'Batch workflow for full product catalog not addressed'
    ],
    improvement_suggestions: [
      'Add post-production workflow (common edits, background removal)',
      'Add A/B testing framework for e-commerce product images',
      'Add batch workflow for product catalogs',
      'Add brand consistency across product line guidance'
    ],
    supported_tools: ['post_comment', 'update_custom_field'],
    required_context: ['product_description', 'product_category', 'target_platform'],
    output_format: 'markdown',
    estimated_tokens: 2000,
    depends_on: ['ai-image-generation'],
    feeds_into: ['ai-product-video', 'ai-social-graphics'],
    requires_mcp_tools: ['glif', 'replicate'],
    fallback_behavior: 'Outputs detailed product photography prompts and shot lists for manual generation.',
    reference_docs: [],
    icon: '📸',
    color: '#F43F5E',
    sort_order: 12,
  },
  {
    slug: 'ai-social-graphics',
    name: 'AI Social Graphics',
    description: 'Platform-optimized social graphics for 7 platforms with detailed specs, content type templates, and multi-platform scaling strategy.',
    category: 'creative',
    pack: 'creative',
    quality_tier: 'solid',
    quality_score: 74,
    quality_notes: 'Practical and well-organized. More of a reference guide than a creative skill — tells you the specs but doesn\'t teach creative thinking. Good for daily agency work.',
    strengths: [
      'Detailed specs for 7 platforms with dimensions and safe zones',
      'Platform-specific prompt templates are ready to use',
      'Multi-platform scaling strategy (generate once, adapt for each)',
      'Content type templates (Quote, Announcement, Event, BTS, Testimonial)'
    ],
    weaknesses: [
      'More reference guide than creative skill',
      'Doesn\'t teach creative thinking about social graphics',
      'No trend awareness or cultural moment guidance',
      'No engagement data feedback loop'
    ],
    improvement_suggestions: [
      'Add creative thinking prompts (not just specs)',
      'Add trend-aware content framework',
      'Add engagement feedback loop (what performed well → generate more like it)',
      'Add accessibility considerations (alt text, contrast ratios)'
    ],
    supported_tools: ['create_card', 'post_comment'],
    required_context: ['brand_guidelines', 'target_platform', 'content_type'],
    output_format: 'markdown',
    estimated_tokens: 2000,
    depends_on: ['ai-creative-strategist', 'ai-image-generation'],
    feeds_into: ['content-atomizer'],
    requires_mcp_tools: ['glif'],
    fallback_behavior: 'Outputs platform specs, prompt templates, and creative briefs for manual generation.',
    reference_docs: [],
    icon: '📱',
    color: '#06B6D4',
    sort_order: 13,
  },
  {
    slug: 'ai-product-video',
    name: 'AI Product Video',
    description: 'Product video from static images. Model Provider Interface abstraction, 5 motion styles, quality validation checklist, graceful degradation protocol, I2V workflow, camera motion vocabulary, cost estimation.',
    category: 'creative',
    pack: 'creative',
    quality_tier: 'solid',
    quality_score: 76,
    quality_notes: 'Major rewrite addressed all original weaknesses. Now 1190 lines (was ~480). Model Provider Interface cleanly separates durable creative knowledge from perishable API details. Quality validation checklist with red flags table. Graceful degradation protocol with Motion Brief fallback when no models available. Cost estimation section. Complete example prompts for 5 product types. Iteration strategies. Still tool-dependent by nature but now handles model turnover gracefully.',
    strengths: [
      'Model Provider Interface abstraction — durable skill survives model turnover, only roster table needs updating',
      'Quality validation checklist with specific red flags table and remediation steps',
      'Graceful degradation protocol — Motion Brief output when all models unavailable',
      '5 motion styles with deep prompt templates and platform-specific guidance',
      'Camera motion vocabulary organized by emotion/effect — useful beyond AI video',
      'Cost estimation section (per-generation and full pipeline costs)',
      'Iteration strategies organized by failure type (close-but-wrong vs completely-wrong vs technical)',
      'Complete handoff protocols for receiving/returning between skills',
      'I2V workflow remains the smart core recommendation',
      '5 complete example prompts covering tech, skincare, food, watch, fashion'
    ],
    weaknesses: [
      'Still fundamentally tool-dependent (needs video generation APIs to produce output)',
      'Model roster will need manual updates as new models release (by design — isolated to one table)',
      'Sound design section still relatively thin',
      'No A/B testing framework for video performance'
    ],
    improvement_suggestions: [
      'Expand sound design into full audio design framework',
      'Add A/B testing guidance for product video performance metrics',
      'Add platform-specific performance benchmarks (CTR, engagement by platform)',
      'Consider adding storyboard/sequence guidance for multi-shot product videos'
    ],
    supported_tools: ['post_comment', 'update_custom_field'],
    required_context: ['product_image', 'motion_style', 'target_platform'],
    output_format: 'markdown',
    estimated_tokens: 2000,
    depends_on: ['ai-product-photo', 'ai-image-generation'],
    feeds_into: [],
    requires_mcp_tools: ['replicate'],
    fallback_behavior: 'Outputs detailed motion briefs, storyboards, and generation prompts for manual execution in any video generation tool.',
    reference_docs: [],
    icon: '🎬',
    color: '#7C3AED',
    sort_order: 14,
  },
  {
    slug: 'ai-talking-head',
    name: 'AI Talking Head',
    description: 'AI talking head and lip-sync videos. Pipeline resilience with fallback chain, quality gates at every stage, 5 presenter archetypes, ethical/legal disclosure framework, cost estimation, multi-model generation.',
    category: 'creative',
    pack: 'creative',
    quality_tier: 'solid',
    quality_score: 75,
    quality_notes: 'Major rewrite addressed all original weaknesses. Now 1360 lines (was ~600). Pipeline Resilience section with full failure mode table and fallback priorities. Quality gates at every stage (GO/RETRY/FALLBACK). Comprehensive ethical guidelines with FTC, Meta, TikTok, YouTube, LinkedIn, EU AI Act compliance and disclosure templates. Cost estimation table. Model abstraction with isolated roster. Creative Brief fallback when everything fails. Still the most dependency-heavy skill but now handles failure gracefully.',
    strengths: [
      'Pipeline Resilience — full failure mode table with minimum viable output per stage',
      'Quality gates at every stage with GO/RETRY/FALLBACK decision framework',
      'Ethical guidelines with platform-specific disclosure requirements (FTC, Meta, TikTok, YouTube, LinkedIn, EU AI Act)',
      'Ready-to-use disclosure templates for ads, social media, websites, video descriptions, email',
      '5 presenter archetypes remain creative and well-thought-out',
      'Cost estimation with per-generation and full pipeline estimates',
      'Creative Brief fallback — delivers comprehensive brief when all services are down',
      'Model abstraction isolates model-specific details from durable creative knowledge',
      'Script mastery section with duration calculation, tone templates, and delivery notes',
      'Partial Delivery Output format handles graceful degradation at any pipeline stage'
    ],
    weaknesses: [
      'Still chains 4+ external dependencies by nature (most complex skill in the pack)',
      'Model roster needs manual updates (by design — isolated to one section)',
      'No guidance on training custom presenter models or fine-tuning',
      'Lip-sync quality is heavily model-dependent with limited control'
    ],
    improvement_suggestions: [
      'Add guidance on training/fine-tuning custom presenter models when available',
      'Add A/B testing framework for presenter style effectiveness',
      'Add audience perception research on AI vs human presenters by context',
      'Consider adding multi-language/localization guidance for global content'
    ],
    supported_tools: ['post_comment', 'update_custom_field'],
    required_context: ['script', 'presenter_archetype', 'target_platform'],
    output_format: 'markdown',
    estimated_tokens: 2500,
    depends_on: ['ai-creative-strategist', 'ai-image-generation'],
    feeds_into: [],
    requires_mcp_tools: ['replicate', 'glif'],
    fallback_behavior: 'Outputs detailed presenter briefs, scripts, and generation prompts. Can produce the creative strategy even without generation tools.',
    reference_docs: [],
    icon: '🗣️',
    color: '#D946EF',
    sort_order: 15,
  },

  // =========================================================================
  // WEB RESEARCH SKILL
  // =========================================================================
  {
    slug: 'web-research',
    name: 'Web Research Agent',
    description: 'Autonomous web research agent that can browse websites, extract content, check links, and gather competitive intelligence. Uses Browserless for page rendering with Scrapling stealth fallback (Camoufox anti-bot browser) for Cloudflare-protected sites. NOT effective on LinkedIn (auth-walled, returns login page). Claude controls browsing decisions.',
    category: 'strategy',
    pack: 'skills',
    quality_tier: 'genuinely_smart',
    quality_score: 82,
    quality_notes: 'Upgraded with Scrapling stealth integration (Feb 2026). 7 tools including stealth_navigate and stealth_extract for anti-bot bypass. Auto-fallback from Browserless to Scrapling when Cloudflare/403 detected. IMPORTANT: Scrapling CANNOT scrape LinkedIn (auth-wall, status 999 block). For LinkedIn data, use Snov.io API or Claude web_search (Google index). Scrapling excels at: personal websites, portfolios, blogs, company pages, directories, news sites with Cloudflare.',
    strengths: [
      'Autonomous browsing loop with up to 15 iterations',
      '7 research tools: navigate, scrape, screenshot, check_link, web_search, stealth_navigate, stealth_extract',
      '6 task-specific prompts for different research types',
      'Domain allowlist for safety',
      'Cost tracking for both AI and browser usage',
      'Scrapling 3-tier fallback: HTTP+TLS spoofing -> Chromium -> Camoufox stealth',
      'Bypasses Cloudflare Turnstile, TLS fingerprinting, canvas fingerprinting',
      'Adaptive CSS selectors that survive site redesigns (Scrapling core feature)',
      'Browserless auto-detects anti-bot blocks and falls back to Scrapling',
      'Best targets: company sites, portfolios, blogs, news, directories, Cloudflare-protected pages',
    ],
    weaknesses: [
      'CANNOT scrape LinkedIn -- auth-walled, returns login page (status 999). Use Snov.io API or Claude web_search instead.',
      'CANNOT scrape Facebook, Instagram, or any login-required site -- no session/cookie support',
      'Scrapling service runs on VPS (157.180.37.69:8099), not on Vercel',
      'StealthyFetcher (Camoufox) is slower than Browserless (~2-5s per page)',
      'No form submission or multi-page authenticated flows',
    ],
    improvement_suggestions: [
      'Add caching for recently visited pages',
      'Support for PDF extraction',
      'Integrate Proxycurl API for reliable LinkedIn profile data (paid, ~$0.01/profile)',
      'Add cookie-jar support for session-based multi-page flows on non-auth-walled sites',
    ],
    supported_tools: ['navigate_and_extract', 'scrape_elements', 'take_screenshot', 'check_link', 'web_search', 'stealth_navigate', 'stealth_extract'],
    required_context: [],
    output_format: 'Structured research report with extracted items, source URLs, and optional screenshots',
    estimated_tokens: 4000,
    depends_on: [],
    feeds_into: ['seo-content', 'brand-voice'],
    requires_mcp_tools: [],
    fallback_behavior: 'Falls back to web_search only if neither Browserless nor Scrapling are configured. Browserless auto-escalates to Scrapling on 403/Cloudflare blocks. Claude can directly invoke stealth tools when it detects anti-bot resistance. For auth-walled sites (LinkedIn, Facebook, Instagram): skip scrapling entirely, use dedicated APIs (Snov.io, Hunter.io) or Claude web_search which reads Google-cached content.',
    reference_docs: [
      { name: 'scrapling-integration', content_summary: 'Scrapling Python microservice on VPS (157.180.37.69:8099) provides 3 fetcher tiers: Fetcher (curl_cffi HTTP), DynamicFetcher (Playwright/Chromium), StealthyFetcher (Camoufox modified Firefox). TypeScript client at src/lib/integrations/scrapling.ts. Auto-fallback in browserless.ts on 403/Cloudflare detection. KNOWN LIMITATION: LinkedIn blocks all 3 tiers (auth-wall, status 999). Scrapling is effective for: company websites, personal portfolios, blogs, news sites, directories, and any Cloudflare-protected public page. For LinkedIn: use Snov.io enrichment API or Claude web_search (Google cache).', quality: 'high -- complete integration with fallback chain, honest about LinkedIn limitation' }
    ],
    icon: '🔍',
    color: '#0EA5E9',
    sort_order: 16,
  },
];

// ============================================================================
// IMPROVEMENT LOG ENTRIES
// Records of quality improvements made to skills. These entries are used by
// the updateImprovedSkills() function to both update the skill data and log
// the improvement in skill_improvement_log for dashboard tracking.
// ============================================================================

export interface ImprovementEntry {
  slug: string;
  change_type: 'major_rewrite' | 'reference_integration' | 'bug_fix' | 'prompt_tuning' | 'quality_review';
  change_description: string;
  quality_score_before: number;
  quality_score_after: number;
  quality_tier_before: string;
  quality_tier_after: string;
}

export const IMPROVEMENT_LOG: ImprovementEntry[] = [
  {
    slug: 'positioning-angles',
    change_type: 'major_rewrite',
    change_description: 'Integrated all 5 reference docs. Added Kennedy\'s 10 diagnostic questions as Step 0, So What Chain + Positioning Statement Template, 3 mechanism types (Named/Revealed/Innovated) with language patterns, MAGIC naming formula, 25 Schwartz diagnostic signals, Hopkins\' overlooked fact as 9th angle type, Bencivenga Persuasion Equation as validation gate. Expanded from 299 to 748 lines. Each angle generator now has real examples, common mistakes, and when-to-use guidance.',
    quality_score_before: 55,
    quality_score_after: 82,
    quality_tier_before: 'has_potential',
    quality_tier_after: 'genuinely_smart',
  },
  {
    slug: 'lead-magnet',
    change_type: 'major_rewrite',
    change_description: 'Integrated all 5 reference docs. Added 7 Cialdini/Kahneman psychology triggers, Trust Equation, Commitment Ladder, Peak-End Rule, identity/aspiration concept. Format Selection Matrix with conversion benchmarks per format. 8 hook generators (added Identity hook). Qualification signals in output format. SaaS-specific patterns. 3 complete worked examples (copywriting course, PM SaaS, marketing agency). 11-dimension psychology checklist replacing old 5-point test. Expanded from 349 to 629 lines.',
    quality_score_before: 48,
    quality_score_after: 79,
    quality_tier_before: 'has_potential',
    quality_tier_after: 'genuinely_smart',
  },
  {
    slug: 'ai-product-video',
    change_type: 'major_rewrite',
    change_description: 'Added Model Provider Interface abstraction separating durable creative knowledge from perishable API details. Capability comparison table. Quality validation checklist with red flags table and remediation steps. Graceful degradation protocol with Motion Brief fallback when no models available. Cost estimation section. Iteration strategies organized by failure type. 5 complete example prompts. Handoff protocols. Expanded from ~480 to 1190 lines.',
    quality_score_before: 58,
    quality_score_after: 76,
    quality_tier_before: 'has_potential',
    quality_tier_after: 'solid',
  },
  {
    slug: 'ai-talking-head',
    change_type: 'major_rewrite',
    change_description: 'Added Pipeline Resilience section with full failure mode table and fallback priorities. Quality gates at every stage (GO/RETRY/FALLBACK). Ethical guidelines with FTC, Meta, TikTok, YouTube, LinkedIn, EU AI Act compliance. Ready-to-use disclosure templates. Cost estimation with per-generation and full pipeline estimates. Creative Brief fallback for when all services are down. Partial Delivery Output format. Expanded from ~600 to 1360 lines.',
    quality_score_before: 55,
    quality_score_after: 75,
    quality_tier_before: 'has_potential',
    quality_tier_after: 'solid',
  },
  {
    slug: 'web-research',
    change_type: 'major_rewrite',
    change_description: 'Integrated Scrapling Python microservice (VPS-hosted) as stealth fallback for anti-bot bypass. Added 2 new Claude tools (stealth_navigate, stealth_extract) powered by Camoufox modified Firefox. Browserless.getContent() now auto-detects Cloudflare/403 blocks and escalates to Scrapling tiered fetch (HTTP+TLS -> Chromium -> Camoufox). Scout Pipeline Step 3 pre-fetches candidate personal websites/portfolios (NOT LinkedIn -- auth-walled, always blocked). Scrapling effective for: company sites, portfolios, blogs, directories, Cloudflare-protected pages. For LinkedIn data: Snov.io API or Claude web_search (Google cache).',
    quality_score_before: 70,
    quality_score_after: 82,
    quality_tier_before: 'solid',
    quality_tier_after: 'genuinely_smart',
  },
];
