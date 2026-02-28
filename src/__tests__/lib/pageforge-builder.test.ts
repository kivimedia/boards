import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

vi.mock('@/lib/integrations/figma-client', () => ({
  createFigmaClient: vi.fn(() => ({ token: 'mock-token' })),
  figmaGetFile: vi.fn(),
  figmaGetFileNodes: vi.fn(),
  figmaGetImages: vi.fn(),
  figmaDownloadImage: vi.fn(),
  figmaExtractSections: vi.fn(),
  figmaExtractColors: vi.fn(),
  figmaExtractTypography: vi.fn(),
}));

vi.mock('@/lib/integrations/wordpress-client', () => ({
  createWpClient: vi.fn(() => ({ config: {}, headers: {} })),
  wpCreatePage: vi.fn(),
  wpUpdatePage: vi.fn(),
  wpUploadMedia: vi.fn(),
}));

vi.mock('@/lib/ai/pageforge-pipeline', () => ({
  callPageForgeAgent: vi.fn(),
}));

vi.mock('@/lib/ai/prompt-templates', () => ({
  getSystemPrompt: vi.fn(() => 'mock-system-prompt'),
}));

// ============================================================================
// IMPORTS (after mocks)
// ============================================================================

import {
  analyzeFigmaDesign,
  classifySections,
  generateMarkup,
  validateMarkup,
  deployDraftToWP,
  optimizeImages,
} from '@/lib/ai/pageforge/builder';
import type {
  FigmaAnalysisResult,
  SectionClassification,
  MarkupResult,
  DeployResult,
  ImageOptResult,
} from '@/lib/ai/pageforge/builder';

import {
  createFigmaClient,
  figmaGetFile,
  figmaGetFileNodes,
  figmaGetImages,
  figmaDownloadImage,
  figmaExtractSections,
  figmaExtractColors,
  figmaExtractTypography,
} from '@/lib/integrations/figma-client';
import type { FigmaSection, FigmaDesignTokens, FigmaNode } from '@/lib/integrations/figma-client';

import {
  createWpClient,
  wpCreatePage,
  wpUpdatePage,
  wpUploadMedia,
} from '@/lib/integrations/wordpress-client';

import { callPageForgeAgent } from '@/lib/ai/pageforge-pipeline';
import { getSystemPrompt } from '@/lib/ai/prompt-templates';

import type { PageForgeSiteProfile, PageForgeBuild } from '@/lib/types';

// ============================================================================
// HELPERS
// ============================================================================

function mockSupabase() {
  return {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://cdn.example.com/img.png' } })),
      }),
    },
  } as any;
}

function makeSiteProfile(overrides?: Partial<PageForgeSiteProfile>): PageForgeSiteProfile {
  return {
    id: 'sp-1',
    client_id: null,
    site_name: 'Test Site',
    site_url: 'https://example.com',
    wp_rest_url: 'https://example.com/wp-json/wp/v2',
    wp_username: 'admin',
    wp_app_password: 'xxxx-xxxx-xxxx',
    wp_ssh_host: null,
    wp_ssh_user: null,
    wp_ssh_key_path: null,
    figma_personal_token: 'figd_token_abc',
    figma_team_id: null,
    page_builder: 'gutenberg',
    theme_name: null,
    theme_css_url: null,
    global_css: null,
    yoast_enabled: false,
    vqa_pass_threshold: 95,
    lighthouse_min_score: 80,
    max_vqa_fix_loops: 3,
    created_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeBuild(overrides?: Partial<PageForgeBuild>): PageForgeBuild {
  return {
    id: 'build-1',
    site_profile_id: 'sp-1',
    vps_job_id: null,
    client_id: null,
    figma_file_key: 'abc123',
    figma_node_ids: ['1:2', '1:3'],
    page_title: 'Landing Page',
    page_slug: 'landing-page',
    page_builder: 'gutenberg',
    status: 'figma_analysis',
    current_phase: 1,
    phase_results: {},
    artifacts: {},
    error_log: [],
    wp_page_id: null,
    wp_draft_url: null,
    wp_preview_url: null,
    wp_live_url: null,
    vqa_score_desktop: null,
    vqa_score_tablet: null,
    vqa_score_mobile: null,
    vqa_score_overall: null,
    lighthouse_performance: null,
    lighthouse_accessibility: null,
    lighthouse_best_practices: null,
    lighthouse_seo: null,
    qa_checks_passed: 0,
    qa_checks_failed: 0,
    qa_checks_total: 0,
    total_cost_usd: 0,
    agent_costs: {},
    dev_gate_decision: null,
    dev_gate_feedback: null,
    dev_gate_decided_by: null,
    dev_gate_decided_at: null,
    am_gate_decision: null,
    am_gate_feedback: null,
    am_gate_decided_by: null,
    am_gate_decided_at: null,
    vqa_fix_iteration: 0,
    created_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    published_at: null,
    ...overrides,
  };
}

function makeFigmaSection(overrides?: Partial<FigmaSection>): FigmaSection {
  return {
    id: '1:10',
    name: 'Hero Section',
    type: 'FRAME',
    bounds: { x: 0, y: 0, width: 1440, height: 800 },
    children: [],
    node: { id: '1:10', name: 'Hero Section', type: 'FRAME' } as FigmaNode,
    ...overrides,
  };
}

function makeFigmaNode(overrides?: Partial<FigmaNode>): FigmaNode {
  return {
    id: '0:1',
    name: 'Page 1',
    type: 'CANVAS',
    children: [],
    ...overrides,
  } as FigmaNode;
}

const mockAgentResult = (text: string) => ({
  text,
  inputTokens: 100,
  outputTokens: 200,
  costUsd: 0.003,
  durationMs: 1500,
  model: 'claude-sonnet-4-20250514',
  provider: 'anthropic',
});

// ============================================================================
// TESTS
// ============================================================================

describe('PageForge Builder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-apply default mock returns after clearing
    vi.mocked(createFigmaClient).mockReturnValue({ token: 'mock-token' } as any);
    vi.mocked(getSystemPrompt).mockReturnValue('mock-system-prompt');
    vi.mocked(createWpClient).mockReturnValue({ config: {}, headers: {} } as any);
  });

  // ==========================================================================
  // analyzeFigmaDesign
  // ==========================================================================

  describe('analyzeFigmaDesign', () => {
    const sections: FigmaSection[] = [
      makeFigmaSection({ id: '1:10', name: 'Hero' }),
      makeFigmaSection({ id: '1:20', name: 'Features', bounds: { x: 0, y: 800, width: 1440, height: 600 } }),
    ];
    const colors: FigmaDesignTokens['colors'] = [
      { name: 'Primary', hex: '#3B82F6', rgba: { r: 0.23, g: 0.51, b: 0.96, a: 1 } },
    ];
    const fonts: FigmaDesignTokens['fonts'] = [
      { family: 'Inter', weight: 700, size: 48 },
    ];

    it('calls figmaGetFileNodes with correct file key and node IDs', async () => {
      const supabase = mockSupabase();
      const siteProfile = makeSiteProfile();
      const pageNode = makeFigmaNode({
        children: [makeFigmaNode({ id: '1:10', name: 'Hero', type: 'FRAME' })],
      });

      vi.mocked(figmaGetFileNodes).mockResolvedValue({
        '1:2': { document: pageNode, components: {}, schemaVersion: 0, name: '', lastModified: '', thumbnailUrl: '', version: '' },
      } as any);
      vi.mocked(figmaExtractSections).mockReturnValue(sections);
      vi.mocked(figmaExtractColors).mockReturnValue(colors);
      vi.mocked(figmaExtractTypography).mockReturnValue(fonts);
      vi.mocked(callPageForgeAgent).mockResolvedValue(mockAgentResult('A landing page with hero and features.'));

      await analyzeFigmaDesign(supabase, 'build-1', siteProfile, 'abc123', ['1:2', '1:3']);

      expect(figmaGetFileNodes).toHaveBeenCalledWith(
        expect.anything(),
        'abc123',
        ['1:2', '1:3']
      );
    });

    it('falls back to full file when no node IDs are provided', async () => {
      const supabase = mockSupabase();
      const siteProfile = makeSiteProfile();
      const fullFile = {
        document: {
          children: [makeFigmaNode({ id: '0:1', name: 'Page 1', type: 'CANVAS' })],
        },
      };

      vi.mocked(figmaGetFile).mockResolvedValue(fullFile as any);
      vi.mocked(figmaExtractSections).mockReturnValue(sections);
      vi.mocked(figmaExtractColors).mockReturnValue(colors);
      vi.mocked(figmaExtractTypography).mockReturnValue(fonts);
      vi.mocked(callPageForgeAgent).mockResolvedValue(mockAgentResult('Summary text'));

      await analyzeFigmaDesign(supabase, 'build-1', siteProfile, 'abc123', []);

      expect(figmaGetFile).toHaveBeenCalledWith(expect.anything(), 'abc123');
      expect(figmaGetFileNodes).not.toHaveBeenCalled();
    });

    it('extracts sections, colors, and typography from the page node', async () => {
      const supabase = mockSupabase();
      const siteProfile = makeSiteProfile();
      const pageNode = makeFigmaNode();

      vi.mocked(figmaGetFileNodes).mockResolvedValue({
        'node-1': { document: pageNode, components: {}, schemaVersion: 0, name: '', lastModified: '', thumbnailUrl: '', version: '' },
      } as any);
      vi.mocked(figmaExtractSections).mockReturnValue(sections);
      vi.mocked(figmaExtractColors).mockReturnValue(colors);
      vi.mocked(figmaExtractTypography).mockReturnValue(fonts);
      vi.mocked(callPageForgeAgent).mockResolvedValue(mockAgentResult('Summary'));

      const result = await analyzeFigmaDesign(supabase, 'build-1', siteProfile, 'abc123', ['node-1']);

      expect(figmaExtractSections).toHaveBeenCalledWith(pageNode);
      expect(figmaExtractColors).toHaveBeenCalledWith(pageNode);
      expect(figmaExtractTypography).toHaveBeenCalledWith(pageNode);
      expect(result.sections).toEqual(sections);
      expect(result.colors).toEqual(colors);
      expect(result.fonts).toEqual(fonts);
    });

    it('returns image node IDs for nodes with IMAGE fills', async () => {
      const supabase = mockSupabase();
      const siteProfile = makeSiteProfile();
      const nodeWithImage = makeFigmaNode({
        id: '5:1',
        name: 'Hero BG',
        type: 'RECTANGLE',
        fills: [{ type: 'IMAGE', imageRef: 'img_abc' } as any],
      });
      const pageNode = makeFigmaNode({ children: [nodeWithImage] });

      vi.mocked(figmaGetFileNodes).mockResolvedValue({
        'n-1': { document: pageNode, components: {}, schemaVersion: 0, name: '', lastModified: '', thumbnailUrl: '', version: '' },
      } as any);
      vi.mocked(figmaExtractSections).mockReturnValue([]);
      vi.mocked(figmaExtractColors).mockReturnValue([]);
      vi.mocked(figmaExtractTypography).mockReturnValue([]);
      vi.mocked(callPageForgeAgent).mockResolvedValue(mockAgentResult('Summary'));

      const result = await analyzeFigmaDesign(supabase, 'build-1', siteProfile, 'abc123', ['n-1']);

      expect(result.imageNodeIds).toContain('5:1');
    });

    it('calls AI to generate a design summary', async () => {
      const supabase = mockSupabase();
      const siteProfile = makeSiteProfile();
      const pageNode = makeFigmaNode();

      vi.mocked(figmaGetFileNodes).mockResolvedValue({
        'n-1': { document: pageNode, components: {}, schemaVersion: 0, name: '', lastModified: '', thumbnailUrl: '', version: '' },
      } as any);
      vi.mocked(figmaExtractSections).mockReturnValue(sections);
      vi.mocked(figmaExtractColors).mockReturnValue(colors);
      vi.mocked(figmaExtractTypography).mockReturnValue(fonts);
      vi.mocked(callPageForgeAgent).mockResolvedValue(mockAgentResult('A modern landing page.'));

      const result = await analyzeFigmaDesign(supabase, 'build-1', siteProfile, 'abc123', ['n-1']);

      expect(callPageForgeAgent).toHaveBeenCalledWith(
        supabase,
        'build-1',
        'pageforge_analyzer',
        'figma_analysis',
        expect.any(String),
        expect.stringContaining('Analyze this Figma design'),
        { activity: 'pageforge_builder' }
      );
      expect(result.designSummary).toBe('A modern landing page.');
    });

    it('throws when figmaGetFileNodes returns empty object', async () => {
      const supabase = mockSupabase();
      const siteProfile = makeSiteProfile();

      vi.mocked(figmaGetFileNodes).mockResolvedValue({});

      await expect(
        analyzeFigmaDesign(supabase, 'build-1', siteProfile, 'abc123', ['1:2'])
      ).rejects.toThrow('No Figma nodes found');
    });

    it('throws when figmaGetFile returns a file with no pages', async () => {
      const supabase = mockSupabase();
      const siteProfile = makeSiteProfile();

      vi.mocked(figmaGetFile).mockResolvedValue({
        document: { children: [] },
      } as any);

      await expect(
        analyzeFigmaDesign(supabase, 'build-1', siteProfile, 'abc123', [])
      ).rejects.toThrow('Figma file has no pages');
    });

    it('creates Figma client with the site profile token', async () => {
      const supabase = mockSupabase();
      const siteProfile = makeSiteProfile({ figma_personal_token: 'figd_my_special_token' });
      const pageNode = makeFigmaNode();

      vi.mocked(figmaGetFileNodes).mockResolvedValue({
        'n-1': { document: pageNode, components: {}, schemaVersion: 0, name: '', lastModified: '', thumbnailUrl: '', version: '' },
      } as any);
      vi.mocked(figmaExtractSections).mockReturnValue([]);
      vi.mocked(figmaExtractColors).mockReturnValue([]);
      vi.mocked(figmaExtractTypography).mockReturnValue([]);
      vi.mocked(callPageForgeAgent).mockResolvedValue(mockAgentResult('Summary'));

      await analyzeFigmaDesign(supabase, 'build-1', siteProfile, 'abc123', ['n-1']);

      expect(createFigmaClient).toHaveBeenCalledWith('figd_my_special_token');
    });

    it('handles nested image nodes recursively', async () => {
      const supabase = mockSupabase();
      const siteProfile = makeSiteProfile();
      const deepNode = makeFigmaNode({
        id: '9:9',
        name: 'Deep Image',
        type: 'RECTANGLE',
        fills: [{ type: 'IMAGE', imageRef: 'img_deep' } as any],
      });
      const middleNode = makeFigmaNode({ id: '5:5', name: 'Container', type: 'FRAME', children: [deepNode] });
      const pageNode = makeFigmaNode({ children: [middleNode] });

      vi.mocked(figmaGetFileNodes).mockResolvedValue({
        'n-1': { document: pageNode, components: {}, schemaVersion: 0, name: '', lastModified: '', thumbnailUrl: '', version: '' },
      } as any);
      vi.mocked(figmaExtractSections).mockReturnValue([]);
      vi.mocked(figmaExtractColors).mockReturnValue([]);
      vi.mocked(figmaExtractTypography).mockReturnValue([]);
      vi.mocked(callPageForgeAgent).mockResolvedValue(mockAgentResult('Summary'));

      const result = await analyzeFigmaDesign(supabase, 'build-1', siteProfile, 'abc123', ['n-1']);

      expect(result.imageNodeIds).toContain('9:9');
    });

    it('propagates Figma API errors', async () => {
      const supabase = mockSupabase();
      const siteProfile = makeSiteProfile();

      vi.mocked(figmaGetFileNodes).mockRejectedValue(new Error('Figma API rate limit exceeded'));

      await expect(
        analyzeFigmaDesign(supabase, 'build-1', siteProfile, 'abc123', ['1:2'])
      ).rejects.toThrow('Figma API rate limit exceeded');
    });
  });

  // ==========================================================================
  // classifySections
  // ==========================================================================

  describe('classifySections', () => {
    const sections: FigmaSection[] = [
      makeFigmaSection({ id: '1:10', name: 'Hero Section' }),
      makeFigmaSection({ id: '1:20', name: 'Features Grid' }),
      makeFigmaSection({ id: '1:30', name: 'Call to Action' }),
      makeFigmaSection({ id: '1:40', name: 'Testimonials' }),
      makeFigmaSection({ id: '1:50', name: 'Pricing Plans' }),
      makeFigmaSection({ id: '1:60', name: 'Footer' }),
    ];

    it('calls AI with section details and returns parsed classifications', async () => {
      const supabase = mockSupabase();
      const aiResponse = JSON.stringify([
        { sectionId: '1:10', sectionName: 'Hero Section', type: 'hero', tier: 2, description: 'Main hero' },
        { sectionId: '1:20', sectionName: 'Features Grid', type: 'features', tier: 2, description: 'Feature cards' },
      ]);

      vi.mocked(callPageForgeAgent).mockResolvedValue(mockAgentResult(aiResponse));

      const result = await classifySections(supabase, 'build-1', sections.slice(0, 2));

      expect(callPageForgeAgent).toHaveBeenCalledWith(
        supabase,
        'build-1',
        'pageforge_classifier',
        'section_classification',
        expect.any(String),
        expect.stringContaining('Classify each page section'),
        { activity: 'pageforge_builder' }
      );
      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('hero');
      expect(result[1].type).toBe('features');
    });

    it('handles hero section type', async () => {
      const supabase = mockSupabase();
      const aiResponse = JSON.stringify([
        { sectionId: '1:10', sectionName: 'Hero', type: 'hero', tier: 1, description: 'Simple hero with text' },
      ]);
      vi.mocked(callPageForgeAgent).mockResolvedValue(mockAgentResult(aiResponse));

      const result = await classifySections(supabase, 'build-1', [sections[0]]);
      expect(result[0].type).toBe('hero');
      expect(result[0].tier).toBe(1);
    });

    it('handles features section type', async () => {
      const supabase = mockSupabase();
      const aiResponse = JSON.stringify([
        { sectionId: '1:20', sectionName: 'Features', type: 'features', tier: 3, description: 'Feature cards grid' },
      ]);
      vi.mocked(callPageForgeAgent).mockResolvedValue(mockAgentResult(aiResponse));

      const result = await classifySections(supabase, 'build-1', [sections[1]]);
      expect(result[0].type).toBe('features');
      expect(result[0].tier).toBe(3);
    });

    it('handles cta section type', async () => {
      const supabase = mockSupabase();
      const aiResponse = JSON.stringify([
        { sectionId: '1:30', sectionName: 'CTA', type: 'cta', tier: 1, description: 'Call to action' },
      ]);
      vi.mocked(callPageForgeAgent).mockResolvedValue(mockAgentResult(aiResponse));

      const result = await classifySections(supabase, 'build-1', [sections[2]]);
      expect(result[0].type).toBe('cta');
    });

    it('handles testimonials section type', async () => {
      const supabase = mockSupabase();
      const aiResponse = JSON.stringify([
        { sectionId: '1:40', sectionName: 'Testimonials', type: 'testimonials', tier: 2, description: 'Client quotes' },
      ]);
      vi.mocked(callPageForgeAgent).mockResolvedValue(mockAgentResult(aiResponse));

      const result = await classifySections(supabase, 'build-1', [sections[3]]);
      expect(result[0].type).toBe('testimonials');
    });

    it('handles pricing section type', async () => {
      const supabase = mockSupabase();
      const aiResponse = JSON.stringify([
        { sectionId: '1:50', sectionName: 'Pricing', type: 'pricing', tier: 3, description: 'Pricing tiers' },
      ]);
      vi.mocked(callPageForgeAgent).mockResolvedValue(mockAgentResult(aiResponse));

      const result = await classifySections(supabase, 'build-1', [sections[4]]);
      expect(result[0].type).toBe('pricing');
    });

    it('handles footer section type', async () => {
      const supabase = mockSupabase();
      const aiResponse = JSON.stringify([
        { sectionId: '1:60', sectionName: 'Footer', type: 'footer', tier: 1, description: 'Site footer' },
      ]);
      vi.mocked(callPageForgeAgent).mockResolvedValue(mockAgentResult(aiResponse));

      const result = await classifySections(supabase, 'build-1', [sections[5]]);
      expect(result[0].type).toBe('footer');
    });

    it('returns tier values correctly (1-4)', async () => {
      const supabase = mockSupabase();
      const aiResponse = JSON.stringify([
        { sectionId: '1:10', sectionName: 'Hero', type: 'hero', tier: 1, description: 'Tier 1' },
        { sectionId: '1:20', sectionName: 'Features', type: 'features', tier: 4, description: 'Tier 4' },
      ]);
      vi.mocked(callPageForgeAgent).mockResolvedValue(mockAgentResult(aiResponse));

      const result = await classifySections(supabase, 'build-1', sections.slice(0, 2));
      expect(result[0].tier).toBe(1);
      expect(result[1].tier).toBe(4);
    });

    it('falls back to default classification when AI returns invalid JSON', async () => {
      const supabase = mockSupabase();
      vi.mocked(callPageForgeAgent).mockResolvedValue(mockAgentResult('This is not JSON at all'));

      const result = await classifySections(supabase, 'build-1', sections.slice(0, 2));

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('content');
      expect(result[0].tier).toBe(2);
      expect(result[0].sectionId).toBe('1:10');
      expect(result[0].sectionName).toBe('Hero Section');
    });

    it('falls back to default classification when AI response has no JSON array', async () => {
      const supabase = mockSupabase();
      vi.mocked(callPageForgeAgent).mockResolvedValue(
        mockAgentResult('Here are the sections: { "type": "object" }')
      );

      const result = await classifySections(supabase, 'build-1', [sections[0]]);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('content');
      expect(result[0].tier).toBe(2);
    });
  });

  // ==========================================================================
  // generateMarkup
  // ==========================================================================

  describe('generateMarkup', () => {
    const sections: FigmaSection[] = [
      makeFigmaSection({ id: '1:10', name: 'Hero' }),
    ];
    const classifications: SectionClassification[] = [
      { sectionId: '1:10', sectionName: 'Hero', type: 'hero', tier: 1, description: 'Hero section' },
    ];
    const designTokens = {
      colors: [{ name: 'Primary', hex: '#3B82F6', rgba: { r: 0.23, g: 0.51, b: 0.96, a: 1 } }] as FigmaDesignTokens['colors'],
      fonts: [{ family: 'Inter', weight: 700, size: 48 }] as FigmaDesignTokens['fonts'],
    };

    it('generates Gutenberg block markup', async () => {
      const supabase = mockSupabase();
      const aiResponse = JSON.stringify({
        markup: '<!-- wp:group --><div class="wp-block-group"><h1>Hero</h1></div><!-- /wp:group -->',
        sections: [{ name: 'Hero', markup: '<!-- wp:heading --><h1>Hero</h1><!-- /wp:heading -->' }],
      });
      vi.mocked(callPageForgeAgent).mockResolvedValue(mockAgentResult(aiResponse));

      const result = await generateMarkup(supabase, 'build-1', 'gutenberg', sections, classifications, designTokens);

      expect(result.builder).toBe('gutenberg');
      expect(result.markup).toContain('wp-block-group');
      expect(result.sections).toHaveLength(1);
    });

    it('generates Divi 5 JSON markup', async () => {
      const supabase = mockSupabase();
      const aiResponse = JSON.stringify({
        markup: '{"type":"section","children":[{"type":"heading","text":"Hero"}]}',
        sections: [{ name: 'Hero', markup: '{"type":"heading","text":"Hero"}' }],
      });
      vi.mocked(callPageForgeAgent).mockResolvedValue(mockAgentResult(aiResponse));

      const result = await generateMarkup(supabase, 'build-1', 'divi5', sections, classifications, designTokens);

      expect(result.builder).toBe('divi5');
      expect(callPageForgeAgent).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.stringContaining('Divi 5'),
        expect.anything()
      );
    });

    it('generates Divi 4 shortcodes markup', async () => {
      const supabase = mockSupabase();
      const aiResponse = JSON.stringify({
        markup: '[et_pb_section][et_pb_row][et_pb_column type="4_4"][et_pb_text]Hero[/et_pb_text][/et_pb_column][/et_pb_row][/et_pb_section]',
        sections: [{ name: 'Hero', markup: '[et_pb_text]Hero[/et_pb_text]' }],
      });
      vi.mocked(callPageForgeAgent).mockResolvedValue(mockAgentResult(aiResponse));

      const result = await generateMarkup(supabase, 'build-1', 'divi4', sections, classifications, designTokens);

      expect(result.builder).toBe('divi4');
      expect(result.markup).toContain('et_pb_section');
    });

    it('includes design tokens (colors and fonts) in the prompt', async () => {
      const supabase = mockSupabase();
      vi.mocked(callPageForgeAgent).mockResolvedValue(mockAgentResult('{"markup":"<div>test</div>","sections":[]}'));

      await generateMarkup(supabase, 'build-1', 'gutenberg', sections, classifications, designTokens);

      const call = vi.mocked(callPageForgeAgent).mock.calls[0];
      const userMessage = call[5] as string;
      expect(userMessage).toContain('#3B82F6');
      expect(userMessage).toContain('Inter');
      expect(userMessage).toContain('700');
      expect(userMessage).toContain('48px');
    });

    it('includes global CSS in the prompt when provided', async () => {
      const supabase = mockSupabase();
      vi.mocked(callPageForgeAgent).mockResolvedValue(mockAgentResult('{"markup":"<div/>","sections":[]}'));

      await generateMarkup(supabase, 'build-1', 'gutenberg', sections, classifications, designTokens, ':root { --primary: blue; }');

      const call = vi.mocked(callPageForgeAgent).mock.calls[0];
      const userMessage = call[5] as string;
      expect(userMessage).toContain('Global CSS');
      expect(userMessage).toContain('--primary: blue');
    });

    it('falls back to raw text when AI returns non-JSON', async () => {
      const supabase = mockSupabase();
      vi.mocked(callPageForgeAgent).mockResolvedValue(
        mockAgentResult('<div class="hero">Fallback markup</div>')
      );

      const result = await generateMarkup(supabase, 'build-1', 'gutenberg', sections, classifications, designTokens);

      expect(result.markup).toContain('Fallback markup');
      expect(result.sections).toEqual([]);
      expect(result.builder).toBe('gutenberg');
    });

    it('handles JSON with markup field but no sections', async () => {
      const supabase = mockSupabase();
      vi.mocked(callPageForgeAgent).mockResolvedValue(
        mockAgentResult('{"markup":"<div>Only markup</div>"}')
      );

      const result = await generateMarkup(supabase, 'build-1', 'gutenberg', sections, classifications, designTokens);

      expect(result.markup).toBe('<div>Only markup</div>');
      expect(result.sections).toEqual([]);
    });
  });

  // ==========================================================================
  // validateMarkup
  // ==========================================================================

  describe('validateMarkup', () => {
    it('passes valid Gutenberg blocks', async () => {
      const supabase = mockSupabase();
      const markup = `<!-- wp:group {"layout":{"type":"constrained"}} -->
<div class="wp-block-group">
  <!-- wp:heading {"level":2} -->
  <h2 class="wp-block-heading">Welcome</h2>
  <!-- /wp:heading -->
  <!-- wp:paragraph -->
  <p>Hello world content that is long enough to pass the length check.</p>
  <!-- /wp:paragraph -->
</div>
<!-- /wp:group -->`;

      const result = await validateMarkup(supabase, 'build-1', markup, 'gutenberg');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('fails on unbalanced wp:group blocks', async () => {
      const supabase = mockSupabase();
      const markup = `<!-- wp:group -->
<div class="wp-block-group">
  <!-- wp:heading -->
  <h2>Title</h2>
  <!-- /wp:heading -->
  <!-- wp:paragraph -->
  <p>Some content that is long enough to pass the length check with enough chars.</p>
  <!-- /wp:paragraph -->
</div>`;
      // Missing <!-- /wp:group -->

      const result = await validateMarkup(supabase, 'build-1', markup, 'gutenberg');

      expect(result.errors).toEqual(
        expect.arrayContaining([expect.stringContaining('Unbalanced Gutenberg blocks')])
      );
      expect(result.valid).toBe(false);
    });

    it('warns when no Gutenberg block markers found', async () => {
      const supabase = mockSupabase();
      const markup = '<div class="hero"><h1>Plain HTML without blocks</h1><p>Content that is long enough to not trigger the too-short error check.</p></div>';

      const result = await validateMarkup(supabase, 'build-1', markup, 'gutenberg');

      expect(result.warnings).toEqual(
        expect.arrayContaining([expect.stringContaining('No Gutenberg block markers')])
      );
    });

    it('detects potentially unclosed HTML tags', async () => {
      const supabase = mockSupabase();
      const markup = `<!-- wp:group -->
<div class="wp-block-group">
  <section><div><p>Paragraph inside section and div that are never closed. Extra padding text to be long enough.</p>
</div>
<!-- /wp:group -->`;

      const result = await validateMarkup(supabase, 'build-1', markup, 'gutenberg');

      expect(result.warnings.some(w => w.includes('unclosed tags'))).toBe(true);
    });

    it('errors on empty or too-short markup', async () => {
      const supabase = mockSupabase();

      const result = await validateMarkup(supabase, 'build-1', '   ', 'gutenberg');

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.stringContaining('empty or too short')])
      );
    });

    it('warns when Divi 5 markup is invalid JSON', async () => {
      const supabase = mockSupabase();
      const markup = '{invalid json that is long enough to pass the empty check with plenty of chars to go around}';

      const result = await validateMarkup(supabase, 'build-1', markup, 'divi5');

      expect(result.warnings).toEqual(
        expect.arrayContaining([expect.stringContaining('does not parse as valid JSON')])
      );
    });

    it('does not warn on valid Divi 5 JSON', async () => {
      const supabase = mockSupabase();
      const markup = JSON.stringify({
        type: 'section',
        children: [{ type: 'heading', text: 'Hello' }, { type: 'paragraph', text: 'World content goes here nicely' }],
      });

      const result = await validateMarkup(supabase, 'build-1', markup, 'divi5');

      expect(result.warnings.filter(w => w.includes('JSON'))).toHaveLength(0);
    });

    it('treats Divi 4 shortcode-only content as valid', async () => {
      const supabase = mockSupabase();
      const markup = '[et_pb_section][et_pb_row][et_pb_column type="4_4"][et_pb_text]Hello World content[/et_pb_text][/et_pb_column][/et_pb_row][/et_pb_section]';

      const result = await validateMarkup(supabase, 'build-1', markup, 'divi4');

      expect(result.valid).toBe(true);
    });
  });

  // ==========================================================================
  // deployDraftToWP
  // ==========================================================================

  describe('deployDraftToWP', () => {
    it('creates a new page when no wp_page_id exists', async () => {
      const siteProfile = makeSiteProfile();
      const build = makeBuild({ wp_page_id: null });
      const markup = '<div>Page content</div>';

      vi.mocked(wpCreatePage).mockResolvedValue({
        id: 42,
        title: { rendered: 'Landing Page' },
        content: { rendered: markup },
        slug: 'landing-page',
        status: 'draft',
        link: 'https://example.com/landing-page/',
      });

      const result = await deployDraftToWP(siteProfile, build, markup);

      expect(wpCreatePage).toHaveBeenCalledWith(expect.anything(), {
        title: 'Landing Page',
        content: markup,
        slug: 'landing-page',
        status: 'draft',
      });
      expect(wpUpdatePage).not.toHaveBeenCalled();
      expect(result.pageId).toBe(42);
    });

    it('updates existing page when wp_page_id exists', async () => {
      const siteProfile = makeSiteProfile();
      const build = makeBuild({ wp_page_id: 99 });
      const markup = '<div>Updated content</div>';

      vi.mocked(wpUpdatePage).mockResolvedValue({
        id: 99,
        title: { rendered: 'Landing Page' },
        content: { rendered: markup },
        slug: 'landing-page',
        status: 'draft',
        link: 'https://example.com/landing-page/',
      });

      const result = await deployDraftToWP(siteProfile, build, markup);

      expect(wpUpdatePage).toHaveBeenCalledWith(expect.anything(), 99, {
        title: 'Landing Page',
        content: markup,
        slug: 'landing-page',
      });
      expect(wpCreatePage).not.toHaveBeenCalled();
      expect(result.pageId).toBe(99);
    });

    it('returns draft URL and preview URL', async () => {
      const siteProfile = makeSiteProfile({ site_url: 'https://mysite.com/' });
      const build = makeBuild({ wp_page_id: null });

      vi.mocked(wpCreatePage).mockResolvedValue({
        id: 55,
        title: { rendered: 'Test' },
        content: { rendered: '' },
        slug: 'test-page',
        status: 'draft',
        link: 'https://mysite.com/test-page/',
      });

      const result = await deployDraftToWP(siteProfile, build, '<div>test</div>');

      expect(result.draftUrl).toBe('https://mysite.com/?page_id=55&preview=true');
      expect(result.previewUrl).toBe('https://mysite.com/test-page/');
    });

    it('strips trailing slash from site_url in draft URL', async () => {
      const siteProfile = makeSiteProfile({ site_url: 'https://mysite.com/' });
      const build = makeBuild({ wp_page_id: null });

      vi.mocked(wpCreatePage).mockResolvedValue({
        id: 10,
        title: { rendered: 'Page' },
        content: { rendered: '' },
        slug: 'page',
        status: 'draft',
        link: '',
      });

      const result = await deployDraftToWP(siteProfile, build, '<div>x</div>');

      expect(result.draftUrl).toBe('https://mysite.com/?page_id=10&preview=true');
    });

    it('uses slug fallback in preview URL when link is empty', async () => {
      const siteProfile = makeSiteProfile({ site_url: 'https://mysite.com' });
      const build = makeBuild({ wp_page_id: null });

      vi.mocked(wpCreatePage).mockResolvedValue({
        id: 7,
        title: { rendered: 'Page' },
        content: { rendered: '' },
        slug: 'my-slug',
        status: 'draft',
        link: '',
      });

      const result = await deployDraftToWP(siteProfile, build, '<div>x</div>');

      expect(result.previewUrl).toBe('https://mysite.com/my-slug/');
    });

    it('throws when WordPress credentials are not configured', async () => {
      const siteProfile = makeSiteProfile({ wp_username: null, wp_app_password: null });
      const build = makeBuild();

      await expect(
        deployDraftToWP(siteProfile, build, '<div>content</div>')
      ).rejects.toThrow('WordPress credentials not configured');
    });

    it('propagates WP API errors', async () => {
      const siteProfile = makeSiteProfile();
      const build = makeBuild({ wp_page_id: null });

      vi.mocked(wpCreatePage).mockRejectedValue(new Error('WP REST API: 403 Forbidden'));

      await expect(
        deployDraftToWP(siteProfile, build, '<div>content</div>')
      ).rejects.toThrow('WP REST API: 403 Forbidden');
    });

    it('creates WP client with correct credentials', async () => {
      const siteProfile = makeSiteProfile({
        wp_rest_url: 'https://site.com/wp-json/wp/v2',
        wp_username: 'user1',
        wp_app_password: 'pass1',
      });
      const build = makeBuild({ wp_page_id: null });

      vi.mocked(wpCreatePage).mockResolvedValue({
        id: 1, title: { rendered: '' }, content: { rendered: '' },
        slug: '', status: 'draft', link: '',
      });

      await deployDraftToWP(siteProfile, build, '<div>x</div>');

      expect(createWpClient).toHaveBeenCalledWith({
        restUrl: 'https://site.com/wp-json/wp/v2',
        username: 'user1',
        appPassword: 'pass1',
      });
    });
  });

  // ==========================================================================
  // optimizeImages
  // ==========================================================================

  describe('optimizeImages', () => {
    it('returns empty result for empty image list', async () => {
      const supabase = mockSupabase();
      const siteProfile = makeSiteProfile();

      const result = await optimizeImages(supabase, 'build-1', siteProfile, 'abc123', []);

      expect(result).toEqual({ uploaded: 0, failed: 0, mediaIds: [] });
      expect(figmaGetImages).not.toHaveBeenCalled();
    });

    it('downloads images from Figma and uploads to WP media library', async () => {
      const supabase = mockSupabase();
      const siteProfile = makeSiteProfile();
      const imageNodeIds = ['5:1', '5:2'];

      vi.mocked(figmaGetImages).mockResolvedValue({
        images: {
          '5:1': 'https://figma-cdn.com/img1.png',
          '5:2': 'https://figma-cdn.com/img2.png',
        },
      } as any);
      vi.mocked(figmaDownloadImage).mockResolvedValue(Buffer.from('fake-image-data'));
      vi.mocked(wpUploadMedia).mockResolvedValueOnce({ id: 101, source_url: '', title: { rendered: '' }, alt_text: '', media_details: {} as any })
        .mockResolvedValueOnce({ id: 102, source_url: '', title: { rendered: '' }, alt_text: '', media_details: {} as any });

      const result = await optimizeImages(supabase, 'build-1', siteProfile, 'abc123', imageNodeIds);

      expect(figmaGetImages).toHaveBeenCalledWith(expect.anything(), 'abc123', imageNodeIds, {
        format: 'png',
        scale: 2,
      });
      expect(figmaDownloadImage).toHaveBeenCalledTimes(2);
      expect(wpUploadMedia).toHaveBeenCalledTimes(2);
      expect(result.uploaded).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.mediaIds).toEqual([101, 102]);
    });

    it('increments failed count for null image URLs', async () => {
      const supabase = mockSupabase();
      const siteProfile = makeSiteProfile();

      vi.mocked(figmaGetImages).mockResolvedValue({
        images: {
          '5:1': null,
          '5:2': 'https://figma-cdn.com/img2.png',
        },
      } as any);
      vi.mocked(figmaDownloadImage).mockResolvedValue(Buffer.from('data'));
      vi.mocked(wpUploadMedia).mockResolvedValue({ id: 200, source_url: '', title: { rendered: '' }, alt_text: '', media_details: {} as any });

      const result = await optimizeImages(supabase, 'build-1', siteProfile, 'abc123', ['5:1', '5:2']);

      expect(result.uploaded).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.mediaIds).toEqual([200]);
    });

    it('handles upload failure gracefully and increments failed count', async () => {
      const supabase = mockSupabase();
      const siteProfile = makeSiteProfile();

      vi.mocked(figmaGetImages).mockResolvedValue({
        images: { '5:1': 'https://figma-cdn.com/img1.png' },
      } as any);
      vi.mocked(figmaDownloadImage).mockResolvedValue(Buffer.from('data'));
      vi.mocked(wpUploadMedia).mockRejectedValue(new Error('Upload failed'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = await optimizeImages(supabase, 'build-1', siteProfile, 'abc123', ['5:1']);

      expect(result.uploaded).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.mediaIds).toEqual([]);
      consoleSpy.mockRestore();
    });

    it('generates correct filename from build ID and node ID', async () => {
      const supabase = mockSupabase();
      const siteProfile = makeSiteProfile();

      vi.mocked(figmaGetImages).mockResolvedValue({
        images: { '5:1': 'https://figma-cdn.com/img.png' },
      } as any);
      vi.mocked(figmaDownloadImage).mockResolvedValue(Buffer.from('data'));
      vi.mocked(wpUploadMedia).mockResolvedValue({ id: 300, source_url: '', title: { rendered: '' }, alt_text: '', media_details: {} as any });

      await optimizeImages(supabase, 'build-1', siteProfile, 'abc123', ['5:1']);

      expect(wpUploadMedia).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(Buffer),
        expect.stringMatching(/^pageforge-build-1-.*\.png$/),
        'image/png'
      );
    });

    it('creates both Figma and WP clients with correct credentials', async () => {
      const supabase = mockSupabase();
      const siteProfile = makeSiteProfile({
        figma_personal_token: 'fig_token_xyz',
        wp_rest_url: 'https://site.com/wp-json/wp/v2',
        wp_username: 'wpuser',
        wp_app_password: 'wppass',
      });

      vi.mocked(figmaGetImages).mockResolvedValue({ images: {} } as any);

      await optimizeImages(supabase, 'build-1', siteProfile, 'abc123', ['5:1']);

      expect(createFigmaClient).toHaveBeenCalledWith('fig_token_xyz');
      expect(createWpClient).toHaveBeenCalledWith({
        restUrl: 'https://site.com/wp-json/wp/v2',
        username: 'wpuser',
        appPassword: 'wppass',
      });
    });
  });
});
