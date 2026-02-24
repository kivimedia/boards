import { describe, it, expect } from 'vitest';
import type {
  AIQAResult,
  QAChecklistTemplate,
  QAScreenshot,
  QAFinding,
  QAChecklistResult,
  QAConsoleError,
  QAPerformanceMetrics,
  QAFindingsCount,
  QAStatus,
  QAFindingSeverity,
} from '@/lib/types';

/**
 * Type-shape tests for AI Dev QA types (P2.2).
 *
 * These tests verify that the type definitions compile correctly and that
 * sample objects conforming to each interface contain all expected fields.
 * The assertions run at both compile time (TypeScript) and runtime (Vitest).
 */

describe('AI Dev QA Types (P2.2)', () => {
  // ===========================================================================
  // AIQAResult
  // ===========================================================================

  describe('AIQAResult interface', () => {
    it('has all expected fields', () => {
      const sample: AIQAResult = {
        id: 'qa-1',
        card_id: 'card-abc',
        url: 'https://example.com',
        screenshots: [
          { viewport: 'desktop', width: 1920, height: 1080, storage_path: 'qa/card-abc/qa-1_desktop.png' },
        ],
        results: {
          findings: [
            { severity: 'minor', category: 'style', description: 'Font mismatch', location: 'header' },
          ],
          checklist_results: [
            { index: 1, passed: true, notes: 'Responsive layout confirmed' },
          ],
          overall_score: 85,
          summary: 'Minor style issues found.',
        },
        console_errors: [
          { type: 'error', text: '404 not found', url: 'https://example.com/api', line: 0 },
        ],
        performance_metrics: {
          load_time_ms: 1200,
          first_paint_ms: 300,
          dom_content_loaded_ms: 800,
        },
        checklist_template_id: 'tmpl-1',
        checklist_results: [
          { index: 1, passed: true, notes: 'Responsive layout confirmed' },
        ],
        overall_score: 85,
        overall_status: 'passed',
        findings_count: { critical: 0, major: 0, minor: 1, info: 0 },
        model_used: 'claude-sonnet-4-5-20250929',
        usage_log_id: 'log-1',
        created_by: 'user-1',
        created_at: '2026-01-20T10:00:00Z',
        updated_at: '2026-01-20T10:00:00Z',
      };

      expect(sample.id).toBe('qa-1');
      expect(sample.card_id).toBe('card-abc');
      expect(sample.url).toBe('https://example.com');
      expect(sample.screenshots).toHaveLength(1);
      expect(sample.results.findings).toHaveLength(1);
      expect(sample.results.checklist_results).toHaveLength(1);
      expect(sample.results.overall_score).toBe(85);
      expect(sample.results.summary).toBe('Minor style issues found.');
      expect(sample.console_errors).toHaveLength(1);
      expect(sample.performance_metrics.load_time_ms).toBe(1200);
      expect(sample.checklist_template_id).toBe('tmpl-1');
      expect(sample.checklist_results).toHaveLength(1);
      expect(sample.overall_score).toBe(85);
      expect(sample.overall_status).toBe('passed');
      expect(sample.findings_count.minor).toBe(1);
      expect(sample.model_used).toBe('claude-sonnet-4-5-20250929');
      expect(sample.usage_log_id).toBe('log-1');
      expect(sample.created_by).toBe('user-1');
      expect(sample.created_at).toBeDefined();
      expect(sample.updated_at).toBeDefined();
    });
  });

  // ===========================================================================
  // QAChecklistTemplate
  // ===========================================================================

  describe('QAChecklistTemplate interface', () => {
    it('has all expected fields', () => {
      const sample: QAChecklistTemplate = {
        id: 'tmpl-1',
        name: 'Standard Web QA',
        description: 'Default checklist for web projects',
        items: [
          { category: 'responsive', text: 'Works on mobile viewports' },
          { category: 'accessibility', text: 'Has proper ARIA labels' },
        ],
        is_default: true,
        created_by: 'user-1',
        created_at: '2026-01-15T08:00:00Z',
        updated_at: '2026-01-15T08:00:00Z',
      };

      expect(sample.id).toBe('tmpl-1');
      expect(sample.name).toBe('Standard Web QA');
      expect(sample.description).toBe('Default checklist for web projects');
      expect(sample.items).toHaveLength(2);
      expect(sample.items[0].category).toBe('responsive');
      expect(sample.items[0].text).toBe('Works on mobile viewports');
      expect(sample.is_default).toBe(true);
      expect(sample.created_by).toBe('user-1');
      expect(sample.created_at).toBeDefined();
      expect(sample.updated_at).toBeDefined();
    });
  });

  // ===========================================================================
  // QAScreenshot
  // ===========================================================================

  describe('QAScreenshot interface', () => {
    it('has viewport, width, height, storage_path', () => {
      const sample: QAScreenshot = {
        viewport: 'desktop',
        width: 1920,
        height: 1080,
        storage_path: 'qa/card-1/qa-1_desktop.png',
      };

      expect(sample.viewport).toBe('desktop');
      expect(sample.width).toBe(1920);
      expect(sample.height).toBe(1080);
      expect(sample.storage_path).toBe('qa/card-1/qa-1_desktop.png');
    });
  });

  // ===========================================================================
  // QAFinding
  // ===========================================================================

  describe('QAFinding interface', () => {
    it('has severity, category, description, location', () => {
      const sample: QAFinding = {
        severity: 'major',
        category: 'layout',
        description: 'Content overflows container on tablet',
        location: 'hero section',
      };

      expect(sample.severity).toBe('major');
      expect(sample.category).toBe('layout');
      expect(sample.description).toBe('Content overflows container on tablet');
      expect(sample.location).toBe('hero section');
    });
  });

  // ===========================================================================
  // QAChecklistResult
  // ===========================================================================

  describe('QAChecklistResult interface', () => {
    it('has index, passed, notes', () => {
      const sample: QAChecklistResult = {
        index: 1,
        passed: true,
        notes: 'All breakpoints render correctly.',
      };

      expect(sample.index).toBe(1);
      expect(sample.passed).toBe(true);
      expect(sample.notes).toBe('All breakpoints render correctly.');
    });
  });

  // ===========================================================================
  // QAConsoleError
  // ===========================================================================

  describe('QAConsoleError interface', () => {
    it('has all fields', () => {
      const sample: QAConsoleError = {
        type: 'error',
        text: 'Uncaught TypeError: Cannot read property of undefined',
        url: 'https://example.com/app.js',
        line: 42,
      };

      expect(sample.type).toBe('error');
      expect(sample.text).toBe('Uncaught TypeError: Cannot read property of undefined');
      expect(sample.url).toBe('https://example.com/app.js');
      expect(sample.line).toBe(42);
    });
  });

  // ===========================================================================
  // QAPerformanceMetrics
  // ===========================================================================

  describe('QAPerformanceMetrics interface', () => {
    it('has all fields', () => {
      const sample: QAPerformanceMetrics = {
        load_time_ms: 2500,
        first_paint_ms: 450,
        dom_content_loaded_ms: 1200,
      };

      expect(sample.load_time_ms).toBe(2500);
      expect(sample.first_paint_ms).toBe(450);
      expect(sample.dom_content_loaded_ms).toBe(1200);
    });
  });

  // ===========================================================================
  // QAFindingsCount
  // ===========================================================================

  describe('QAFindingsCount interface', () => {
    it('has all 4 severity levels', () => {
      const sample: QAFindingsCount = {
        critical: 1,
        major: 2,
        minor: 3,
        info: 4,
      };

      expect(sample.critical).toBe(1);
      expect(sample.major).toBe(2);
      expect(sample.minor).toBe(3);
      expect(sample.info).toBe(4);
    });
  });

  // ===========================================================================
  // QAStatus
  // ===========================================================================

  describe('QAStatus type', () => {
    it('covers all 5 values', () => {
      const statuses: QAStatus[] = ['pending', 'running', 'passed', 'failed', 'error'];
      expect(statuses).toHaveLength(5);
      for (const s of statuses) {
        expect(typeof s).toBe('string');
      }
    });
  });

  // ===========================================================================
  // QAFindingSeverity
  // ===========================================================================

  describe('QAFindingSeverity type', () => {
    it('covers all 4 values', () => {
      const severities: QAFindingSeverity[] = ['critical', 'major', 'minor', 'info'];
      expect(severities).toHaveLength(4);
      for (const s of severities) {
        expect(typeof s).toBe('string');
      }
    });
  });
});
