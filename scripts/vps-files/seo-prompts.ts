import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const promptsDir = join(__dirname, '../prompts');

function loadPrompt(filename: string): string {
  return readFileSync(join(promptsDir, filename), 'utf-8').trim();
}

// Reference materials (appended to relevant agent prompts)
const BRAND_VOICE = loadPrompt('ref-brand-voice.md');
const HUMANIZATION_TECHNIQUES = loadPrompt('ref-humanization-techniques.md');

// Agent SKILL.md content (without YAML frontmatter)
const STRATEGY = loadPrompt('strategy.md');
const CONTENT_WRITER = loadPrompt('content-writer.md');
const QUALITY_CONTROL = loadPrompt('quality-control.md');
const HUMANIZER = loadPrompt('humanizer.md');
const VALUE_SCORER = loadPrompt('value-scorer.md');
const WP_PUBLISHER = loadPrompt('wordpress-publisher.md');
const VISUAL_QA = loadPrompt('visual-qa.md');

const SEP = '\n\n---\n\n';

// Compose full system prompts with appended reference materials
export const PHASE_SYSTEM_PROMPTS: Record<string, string> = {
  planning: STRATEGY + SEP + '# Reference: Brand Voice and Company Info\n\n' + BRAND_VOICE,

  writing: CONTENT_WRITER + SEP + '# Reference: Brand Voice and Company Info\n\n' + BRAND_VOICE,

  qc: QUALITY_CONTROL + SEP + '# Reference: Brand Voice and Company Info\n\n' + BRAND_VOICE,

  humanizing: HUMANIZER + SEP
    + '# Reference: Humanization Techniques\n\n' + HUMANIZATION_TECHNIQUES + SEP
    + '# Reference: Brand Voice and Company Info\n\n' + BRAND_VOICE,

  scoring: VALUE_SCORER + SEP + '# Reference: Brand Voice and Company Info\n\n' + BRAND_VOICE,

  publishing: WP_PUBLISHER,

  visual_qa: VISUAL_QA,
};

// Model assignments per phase (from config.yaml)
export const PHASE_MODELS: Record<string, string> = {
  planning: 'claude-sonnet-4-5-20250929',
  writing: 'claude-sonnet-4-5-20250929',
  qc: 'claude-sonnet-4-5-20250929',
  humanizing: 'claude-sonnet-4-5-20250929',
  scoring: 'claude-sonnet-4-5-20250929',
  publishing: 'claude-haiku-4-5-20251001',
  visual_qa: 'claude-sonnet-4-5-20250929',
};
