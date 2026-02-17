import type { BriefingTemplateField } from './types';

/**
 * Calculate completeness score for a brief given its data and template fields.
 * Returns a score between 0 and 100.
 */
export function calculateCompleteness(
  data: Record<string, unknown>,
  fields: BriefingTemplateField[]
): { score: number; isComplete: boolean; missingRequired: string[] } {
  if (fields.length === 0) {
    return { score: 100, isComplete: true, missingRequired: [] };
  }

  const requiredFields = fields.filter((f) => f.required);
  const missingRequired: string[] = [];
  let filledCount = 0;

  for (const field of fields) {
    const value = data[field.key];
    const isFilled = isFieldFilled(value, field.type);

    if (isFilled) {
      filledCount++;
    } else if (field.required) {
      missingRequired.push(field.label);
    }
  }

  const score = Math.round((filledCount / fields.length) * 100);
  const isComplete = missingRequired.length === 0;

  return { score, isComplete, missingRequired };
}

/**
 * Determines if a field value is considered "filled" based on field type.
 */
function isFieldFilled(value: unknown, fieldType: string): boolean {
  if (value === null || value === undefined) return false;

  switch (fieldType) {
    case 'text':
    case 'textarea':
    case 'url':
    case 'dropdown':
      return typeof value === 'string' && value.trim().length > 0;

    case 'number':
      return typeof value === 'number' || (typeof value === 'string' && value.trim().length > 0 && !isNaN(Number(value)));

    case 'date':
      return typeof value === 'string' && value.trim().length > 0;

    case 'checkbox':
      return typeof value === 'boolean';

    case 'url_list':
      if (typeof value === 'string') return value.trim().length > 0;
      if (Array.isArray(value)) return value.length > 0;
      return false;

    default:
      return typeof value === 'string' ? value.trim().length > 0 : !!value;
  }
}

/**
 * Get the board types that have briefing templates available.
 */
export const BOARD_TYPES_WITH_BRIEFS: string[] = [
  'graphic_designer',
  'dev',
  'copy',
  'video_editor',
];

/**
 * Get the "Briefed" list name for enforcing brief completeness.
 * Cards cannot move FROM this list unless their brief is complete.
 */
export function getBriefedListName(): string {
  return 'Briefed';
}
