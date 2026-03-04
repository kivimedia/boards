// ============================================================================
// PAGEFORGE CONSTANTS - Safe for client-side imports
//
// Extracted from pageforge-pipeline.ts so client components can import
// these without pulling in server-only dependencies (web-push, net, tls).
// ============================================================================

export interface PageForgeModelProfile {
  id: string;
  label: string;
  description: string;
  estimatedCost: string;
  models: {
    orchestrator: string;
    builder: string;
    vqa: string;
    qa: string;
    seo: string;
  };
}

export const MODEL_PROFILES: PageForgeModelProfile[] = [
  {
    id: 'cost_optimized',
    label: 'Cost-Optimized',
    description: 'Gemini Flash for most agents, Claude Sonnet for Builder',
    estimatedCost: '~$2.50/build',
    models: {
      orchestrator: 'gemini-2.5-flash',
      builder: 'claude-sonnet-4-5-20250929',
      vqa: 'gemini-2.5-pro',
      qa: 'gemini-2.5-flash',
      seo: 'gemini-2.5-flash',
    },
  },
  {
    id: 'quality_first',
    label: 'Quality-First',
    description: 'Claude Sonnet for Builder, Gemini Pro for VQA, premium models throughout',
    estimatedCost: '~$6/build',
    models: {
      orchestrator: 'claude-sonnet-4-5-20250929',
      builder: 'claude-sonnet-4-5-20250929',
      vqa: 'gemini-2.5-pro',
      qa: 'claude-haiku-4-5-20251001',
      seo: 'claude-sonnet-4-5-20250929',
    },
  },
  {
    id: 'budget',
    label: 'Budget',
    description: 'Cheapest models for all agents - good for simple landing pages',
    estimatedCost: '~$1/build',
    models: {
      orchestrator: 'gemini-2.5-flash',
      builder: 'claude-haiku-4-5-20251001',
      vqa: 'gemini-2.5-flash',
      qa: 'gemini-2.5-flash',
      seo: 'gemini-2.5-flash',
    },
  },
  {
    id: 'custom',
    label: 'Custom',
    description: 'Choose models per agent - full control',
    estimatedCost: 'Varies',
    models: {
      orchestrator: 'gemini-2.5-flash',
      builder: 'claude-sonnet-4-5-20250929',
      vqa: 'gemini-2.5-pro',
      qa: 'gemini-2.5-flash',
      seo: 'gemini-2.5-flash',
    },
  },
];

export const AVAILABLE_MODELS = [
  { id: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5', provider: 'anthropic' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', provider: 'anthropic' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'google' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'google' },
  { id: 'gpt-4.1', label: 'GPT-4.1', provider: 'openai' },
  { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini', provider: 'openai' },
  { id: 'gpt-4.1-nano', label: 'GPT-4.1 Nano', provider: 'openai' },
] as const;

export const AGENT_ROLES = [
  { key: 'orchestrator', label: 'Orchestrator', description: 'Preflight checks & report generation' },
  { key: 'builder', label: 'Builder', description: 'Figma analysis, markup generation, deployment' },
  { key: 'vqa', label: 'VQA', description: 'Visual quality assurance & screenshot comparison' },
  { key: 'qa', label: 'QA', description: 'Functional testing, Lighthouse, accessibility' },
  { key: 'seo', label: 'SEO', description: 'Yoast config, meta tags, heading hierarchy' },
] as const;
