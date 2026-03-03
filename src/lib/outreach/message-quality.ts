// ============================================================================
// MESSAGE QUALITY CHECKER
// ============================================================================
// Validates outreach messages against voice compliance rules, personalization
// requirements, and sequence integrity. Returns hard blocks and soft warnings.

export interface QualityCheckResult {
  passed: boolean;
  hardBlocks: string[];
  warnings: string[];
  scores: {
    voice_compliance: number; // 0-100
    personalization: number;  // 0-100
    length_compliance: number; // 0-100
    overall: number;           // 0-100
  };
}

// ============================================================================
// BANNED PHRASES (from PRD Section 8.6 - hard block)
// ============================================================================

const BANNED_PHRASES = [
  'game-changer',
  'game changer',
  'invaluable',
  'next level',
  'next-level',
  'truly inspiring',
  'incredible journey',
  'blown away',
  'phenomenal',
  'groundbreaking',
  'revolutionary',
  'it would be an honor',
  'would be an honor',
  'leverage',
  'synergy',
  'paradigm',
  'disruptive',
  'innovative solution',
  'cutting-edge',
  'best-in-class',
  'world-class',
  'thought leader',
  'circle back',
  'touch base',
  'low-hanging fruit',
  'move the needle',
];

// ============================================================================
// EMDASH DETECTION (hard block per user preference)
// ============================================================================

const EMDASH_PATTERNS = [
  '\u2014',     // em dash
  '\u2013',     // en dash
  '--',         // double hyphen
];

// ============================================================================
// EXCESSIVE EMOJI DETECTION
// ============================================================================

const EMOJI_REGEX = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2702}-\u{27B0}\u{24C2}-\u{1F251}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;

// ============================================================================
// QUALITY CHECK
// ============================================================================

export function checkMessageQuality(
  message: string,
  options?: {
    maxLength?: number;
    templateNumber?: number;
    leadName?: string;
    isFollowup?: boolean;
  }
): QualityCheckResult {
  const hardBlocks: string[] = [];
  const warnings: string[] = [];
  const maxLen = options?.maxLength || 300;

  // ---- HARD BLOCKS ----

  // 1. Banned phrases
  const lowerMsg = message.toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    if (lowerMsg.includes(phrase.toLowerCase())) {
      hardBlocks.push(`Contains banned phrase: "${phrase}"`);
    }
  }

  // 2. Emdash detection
  for (const pattern of EMDASH_PATTERNS) {
    if (message.includes(pattern)) {
      hardBlocks.push('Contains em dash or double dash - use single dash instead');
      break;
    }
  }

  // 3. Length check (hard block if >120% of max)
  if (message.length > maxLen * 1.2) {
    hardBlocks.push(`Message too long: ${message.length} chars (hard limit: ${Math.floor(maxLen * 1.2)})`);
  }

  // 4. Empty message
  if (message.trim().length === 0) {
    hardBlocks.push('Message is empty');
  }

  // 5. Unresolved template variables
  const unresolvedVars = message.match(/\{\{[^}]+\}\}/g);
  if (unresolvedVars) {
    hardBlocks.push(`Unresolved template variables: ${unresolvedVars.join(', ')}`);
  }

  // 6. Contains placeholder text
  if (message.includes('[Insert ') || message.includes('[TODO]') || message.includes('[PLACEHOLDER]')) {
    hardBlocks.push('Contains placeholder text that needs to be replaced');
  }

  // ---- WARNINGS ----

  // 1. Soft length warning (over max but under hard limit)
  if (message.length > maxLen && message.length <= maxLen * 1.2) {
    warnings.push(`Message slightly over limit: ${message.length}/${maxLen} chars`);
  }

  // 2. Too short
  if (message.trim().length > 0 && message.trim().length < 20) {
    warnings.push('Message may be too short');
  }

  // 3. Excessive emojis
  const emojis = message.match(EMOJI_REGEX);
  if (emojis && emojis.length > 2) {
    warnings.push(`Too many emojis (${emojis.length}) - keep to 0-2 max`);
  }

  // 4. First person start (T1 shouldn't start with "I")
  if (options?.templateNumber === 1) {
    const firstWord = message.trim().split(/\s+/)[0]?.toLowerCase();
    if (firstWord === 'i' || firstWord === "i'm" || firstWord === "i've") {
      warnings.push('Connection note starts with "I" - lead with the prospect instead');
    }
  }

  // 5. Personalization check
  if (options?.leadName) {
    const firstName = options.leadName.split(' ')[0];
    if (!message.includes(firstName)) {
      warnings.push('Message does not contain the lead\'s first name');
    }
  }

  // 6. Missing sign-off for non-T1 messages
  if (options?.templateNumber && options.templateNumber > 1) {
    const lastLine = message.trim().split('\n').pop()?.trim() || '';
    if (!lastLine.match(/ziv|cheers|best|thanks/i)) {
      warnings.push('Message may be missing a sign-off');
    }
  }

  // 7. All caps detection
  const words = message.split(/\s+/);
  const capsWords = words.filter(w => w.length > 2 && w === w.toUpperCase() && /[A-Z]/.test(w));
  if (capsWords.length > 2) {
    warnings.push('Multiple ALL CAPS words detected - may seem aggressive');
  }

  // 8. URL check for Loom template
  if (options?.templateNumber === 3 && !message.includes('loom.com') && !message.includes('[Insert Loom Link]')) {
    warnings.push('Loom delivery template should contain a Loom link');
  }

  // ---- SCORES ----

  // Voice compliance score
  let voiceScore = 100;
  voiceScore -= hardBlocks.length * 25;
  voiceScore -= warnings.filter(w =>
    w.includes('banned') || w.includes('em dash') || w.includes('ALL CAPS') || w.includes('emoji')
  ).length * 10;

  // Personalization score
  let personalizationScore = 50; // Base
  if (options?.leadName) {
    const firstName = options.leadName.split(' ')[0];
    if (message.includes(firstName)) personalizationScore += 30;
  }
  if (message.match(/your (website|site|work|show|business|act)/i)) personalizationScore += 20;

  // Length compliance score
  let lengthScore = 100;
  if (message.length > maxLen * 1.2) lengthScore = 0;
  else if (message.length > maxLen) lengthScore = 50;
  else if (message.length < 20) lengthScore = 30;

  const overall = Math.max(0, Math.min(100, Math.round(
    voiceScore * 0.4 + personalizationScore * 0.3 + lengthScore * 0.3
  )));

  return {
    passed: hardBlocks.length === 0,
    hardBlocks,
    warnings,
    scores: {
      voice_compliance: Math.max(0, Math.min(100, voiceScore)),
      personalization: Math.min(100, personalizationScore),
      length_compliance: lengthScore,
      overall,
    },
  };
}

// ============================================================================
// BATCH QUALITY CHECK
// ============================================================================

export interface BatchQualityResult {
  total: number;
  passed: number;
  failed: number;
  warnings_count: number;
  avg_quality_score: number;
  results: { lead_id: string; check: QualityCheckResult }[];
}

export function checkBatchQuality(
  messages: { lead_id: string; message: string; template_number?: number; lead_name?: string; max_length?: number }[]
): BatchQualityResult {
  const results = messages.map(m => ({
    lead_id: m.lead_id,
    check: checkMessageQuality(m.message, {
      maxLength: m.max_length,
      templateNumber: m.template_number,
      leadName: m.lead_name,
    }),
  }));

  const passed = results.filter(r => r.check.passed).length;
  const avgScore = results.length > 0
    ? Math.round(results.reduce((sum, r) => sum + r.check.scores.overall, 0) / results.length)
    : 0;

  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    warnings_count: results.reduce((sum, r) => sum + r.check.warnings.length, 0),
    avg_quality_score: avgScore,
    results,
  };
}
