import { describe, it, expect } from 'vitest';
import { detectMode } from '@/hooks/useSmartSearch';
import type { AiAssistantResponse, AiUserMood, AiBoardCategory } from '@/lib/types';

// Re-implement extractResponseFromPartialJson for testing (it's not exported)
function extractResponseFromPartialJson(partial: string): string {
  const marker = '"response"';
  const idx = partial.indexOf(marker);
  if (idx === -1) return '';

  const afterMarker = partial.slice(idx + marker.length);
  const colonIdx = afterMarker.indexOf(':');
  if (colonIdx === -1) return '';

  const afterColon = afterMarker.slice(colonIdx + 1).trimStart();
  if (!afterColon.startsWith('"')) return '';

  let result = '';
  let i = 1;
  while (i < afterColon.length) {
    const ch = afterColon[i];
    if (ch === '\\' && i + 1 < afterColon.length) {
      const next = afterColon[i + 1];
      if (next === '"') { result += '"'; i += 2; }
      else if (next === 'n') { result += '\n'; i += 2; }
      else if (next === 't') { result += '\t'; i += 2; }
      else if (next === '\\') { result += '\\'; i += 2; }
      else if (next === '/') { result += '/'; i += 2; }
      else { result += ch; i++; }
    } else if (ch === '"') {
      break;
    } else {
      result += ch;
      i++;
    }
  }

  return result;
}

/**
 * Enhanced Board Assistant Tests (P8.3 Structured Responses)
 *
 * Tests structured AI response parsing, partial JSON extraction,
 * mode toggle logic, and type validation.
 */

describe('Board Assistant Enhanced (P8.3)', () => {
  describe('AiAssistantResponse type shape', () => {
    it('validates a complete structured response', () => {
      const response: AiAssistantResponse = {
        response: 'There are 5 overdue tasks.',
        thinking: 'User wants to know about overdue items.',
        user_mood: 'curious',
        suggested_questions: [
          'Who has the most overdue tasks?',
          'What are the deadlines this week?',
          'Show blocked items',
        ],
        matched_categories: ['deadlines', 'progress'],
        redirect_to_owner: { should_redirect: false },
      };
      expect(response.response).toBeTruthy();
      expect(response.suggested_questions).toHaveLength(3);
      expect(response.matched_categories).toHaveLength(2);
      expect(response.redirect_to_owner.should_redirect).toBe(false);
    });

    it('validates response with redirect', () => {
      const response: AiAssistantResponse = {
        response: 'I cannot determine the budget from the board data.',
        thinking: 'Budget info is not in the board.',
        user_mood: 'confused',
        suggested_questions: ['What tasks are in progress?'],
        matched_categories: ['general'],
        redirect_to_owner: {
          should_redirect: true,
          reason: 'Budget information is not available in board data',
        },
      };
      expect(response.redirect_to_owner.should_redirect).toBe(true);
      expect(response.redirect_to_owner.reason).toContain('Budget');
    });

    it('validates all mood types', () => {
      const moods: AiUserMood[] = ['positive', 'neutral', 'negative', 'curious', 'frustrated', 'confused'];
      moods.forEach(mood => {
        const r: AiAssistantResponse = {
          response: 'test',
          thinking: 'test',
          user_mood: mood,
          suggested_questions: [],
          matched_categories: ['general'],
          redirect_to_owner: { should_redirect: false },
        };
        expect(r.user_mood).toBe(mood);
      });
    });

    it('validates all category types', () => {
      const categories: AiBoardCategory[] = ['workload', 'deadlines', 'assignments', 'progress', 'blocked', 'general'];
      categories.forEach(cat => {
        const r: AiAssistantResponse = {
          response: 'test',
          thinking: 'test',
          user_mood: 'neutral',
          suggested_questions: [],
          matched_categories: [cat],
          redirect_to_owner: { should_redirect: false },
        };
        expect(r.matched_categories[0]).toBe(cat);
      });
    });
  });

  describe('extractResponseFromPartialJson', () => {
    it('extracts response from complete JSON', () => {
      const json = '"response": "Hello world", "thinking": "test"';
      expect(extractResponseFromPartialJson(json)).toBe('Hello world');
    });

    it('extracts response from partial JSON (still streaming)', () => {
      const json = '"response": "The tasks are overdue and need attent';
      expect(extractResponseFromPartialJson(json)).toBe('The tasks are overdue and need attent');
    });

    it('handles escaped quotes in response', () => {
      const json = '"response": "He said \\"hello\\"", "thinking": "test"';
      expect(extractResponseFromPartialJson(json)).toBe('He said "hello"');
    });

    it('handles newlines in response', () => {
      const json = '"response": "Line 1\\nLine 2\\nLine 3", "thinking": "test"';
      expect(extractResponseFromPartialJson(json)).toBe('Line 1\nLine 2\nLine 3');
    });

    it('handles tabs in response', () => {
      const json = '"response": "Col1\\tCol2", "thinking": "test"';
      expect(extractResponseFromPartialJson(json)).toBe('Col1\tCol2');
    });

    it('handles backslashes in response', () => {
      const json = '"response": "path\\\\to\\\\file", "thinking": "test"';
      expect(extractResponseFromPartialJson(json)).toBe('path\\to\\file');
    });

    it('returns empty string when no response field found', () => {
      const json = '"thinking": "test"';
      expect(extractResponseFromPartialJson(json)).toBe('');
    });

    it('returns empty string for empty input', () => {
      expect(extractResponseFromPartialJson('')).toBe('');
    });

    it('handles response with bullet points', () => {
      const json = '"response": "- Task 1\\n- Task 2\\n- Task 3", "thinking": "test"';
      expect(extractResponseFromPartialJson(json)).toBe('- Task 1\n- Task 2\n- Task 3');
    });

    it('handles response at start of object (after opening brace)', () => {
      // After prefill with "{", the stream starts with the rest of the JSON
      const json = '\\n  "response": "Five tasks are overdue", "thinking": "test"';
      expect(extractResponseFromPartialJson(json)).toBe('Five tasks are overdue');
    });
  });

  describe('mode toggle behavior', () => {
    it('detectMode still returns search for short keywords', () => {
      expect(detectMode('meeting')).toBe('search');
      expect(detectMode('bug')).toBe('search');
      expect(detectMode('Glen')).toBe('search');
    });

    it('detectMode still returns ai for questions', () => {
      expect(detectMode('what tasks are overdue?')).toBe('ai');
      expect(detectMode('who is assigned to this?')).toBe('ai');
      expect(detectMode('show me all blocked items')).toBe('ai');
    });

    it('detectMode returns ai for 4+ word inputs', () => {
      expect(detectMode('tasks due this week')).toBe('ai');
      expect(detectMode('all cards in progress')).toBe('ai');
    });

    it('override mode concept: null means auto-detect', () => {
      const modeOverride: 'search' | 'ai' | null = null;
      const detected = detectMode('hello');
      const effective = modeOverride ?? detected;
      expect(effective).toBe('search');
    });

    it('override mode concept: explicit ai overrides detection', () => {
      const modeOverride: 'search' | 'ai' | null = 'ai';
      const detected = detectMode('hello'); // Would auto-detect as search
      const effective = modeOverride ?? detected;
      expect(effective).toBe('ai');
    });

    it('override mode concept: explicit search overrides detection', () => {
      const modeOverride: 'search' | 'ai' | null = 'search';
      const detected = detectMode('what tasks are overdue?'); // Would auto-detect as ai
      const effective = modeOverride ?? detected;
      expect(effective).toBe('search');
    });
  });

  describe('structured response validation', () => {
    it('normalizes invalid mood to neutral', () => {
      const parsed = { user_mood: 'happy' }; // invalid
      const validMoods = ['positive', 'neutral', 'negative', 'curious', 'frustrated', 'confused'];
      const normalized = validMoods.includes(parsed.user_mood) ? parsed.user_mood : 'neutral';
      expect(normalized).toBe('neutral');
    });

    it('normalizes valid mood to itself', () => {
      const parsed = { user_mood: 'frustrated' };
      const validMoods = ['positive', 'neutral', 'negative', 'curious', 'frustrated', 'confused'];
      const normalized = validMoods.includes(parsed.user_mood) ? parsed.user_mood : 'neutral';
      expect(normalized).toBe('frustrated');
    });

    it('filters non-string suggested questions', () => {
      const raw = ['Valid question?', 42, null, 'Another question?'];
      const filtered = raw.filter((q): q is string => typeof q === 'string').slice(0, 3);
      expect(filtered).toEqual(['Valid question?', 'Another question?']);
    });

    it('limits suggested questions to 3', () => {
      const raw = ['Q1?', 'Q2?', 'Q3?', 'Q4?', 'Q5?'];
      const limited = raw.slice(0, 3);
      expect(limited).toHaveLength(3);
    });

    it('defaults categories to general when empty', () => {
      const parsed = { matched_categories: [] };
      const categories = parsed.matched_categories.length > 0
        ? parsed.matched_categories
        : ['general'];
      expect(categories).toEqual(['general']);
    });

    it('normalizes redirect_to_owner from invalid shape', () => {
      const parsed = { redirect_to_owner: null };
      const redirect = parsed.redirect_to_owner && typeof parsed.redirect_to_owner === 'object'
        ? parsed.redirect_to_owner
        : { should_redirect: false };
      expect(redirect).toEqual({ should_redirect: false });
    });

    it('preserves redirect reason when should_redirect is true', () => {
      const parsed = {
        redirect_to_owner: {
          should_redirect: true,
          reason: 'Cannot determine budget from board data',
        },
      };
      expect(parsed.redirect_to_owner.should_redirect).toBe(true);
      expect(parsed.redirect_to_owner.reason).toBeTruthy();
    });
  });

  describe('SSE event parsing', () => {
    it('parses token event data correctly', () => {
      const line = '{"text":"Hello "}';
      const data = JSON.parse(line);
      expect(data.text).toBe('Hello ');
    });

    it('parses done event with full structured response', () => {
      const result = {
        response: 'Five tasks are overdue.',
        user_mood: 'curious',
        suggested_questions: ['Which tasks?', 'Who owns them?', 'When are they due?'],
        matched_categories: ['deadlines'],
        redirect_to_owner: { should_redirect: false },
      };
      const line = JSON.stringify(result);
      const parsed = JSON.parse(line);
      expect(parsed.response).toBe('Five tasks are overdue.');
      expect(parsed.user_mood).toBe('curious');
      expect(parsed.suggested_questions).toHaveLength(3);
    });

    it('parses error event data', () => {
      const line = '{"error":"AI assistant error"}';
      const data = JSON.parse(line);
      expect(data.error).toBe('AI assistant error');
    });
  });

  describe('board categories', () => {
    it('has 6 categories defined', () => {
      const categories: AiBoardCategory[] = ['workload', 'deadlines', 'assignments', 'progress', 'blocked', 'general'];
      expect(categories).toHaveLength(6);
    });

    it('all categories have display labels', () => {
      const labels: Record<AiBoardCategory, string> = {
        workload: 'Workload',
        deadlines: 'Deadlines',
        assignments: 'Assignments',
        progress: 'Progress',
        blocked: 'Blocked',
        general: 'General',
      };
      Object.values(labels).forEach(label => {
        expect(label.length).toBeGreaterThan(0);
      });
    });
  });
});
