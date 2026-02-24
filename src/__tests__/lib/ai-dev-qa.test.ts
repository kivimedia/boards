import { describe, it, expect } from 'vitest';
import {
  QA_VIEWPORTS,
  parseQAResponse,
  countFindings,
  scoreToStatus,
} from '@/lib/ai/dev-qa';
import type { QAFinding } from '@/lib/types';

describe('AI Dev QA (P2.2)', () => {
  // ===========================================================================
  // QA_VIEWPORTS
  // ===========================================================================

  describe('QA_VIEWPORTS', () => {
    it('has 3 viewports (desktop, tablet, mobile)', () => {
      expect(QA_VIEWPORTS).toHaveLength(3);
      const names = QA_VIEWPORTS.map((v) => v.name);
      expect(names).toEqual(['desktop', 'tablet', 'mobile']);
    });

    it('desktop is 1920x1080', () => {
      const desktop = QA_VIEWPORTS.find((v) => v.name === 'desktop');
      expect(desktop).toBeDefined();
      expect(desktop!.width).toBe(1920);
      expect(desktop!.height).toBe(1080);
    });

    it('tablet is 768x1024', () => {
      const tablet = QA_VIEWPORTS.find((v) => v.name === 'tablet');
      expect(tablet).toBeDefined();
      expect(tablet!.width).toBe(768);
      expect(tablet!.height).toBe(1024);
    });

    it('mobile is 375x812', () => {
      const mobile = QA_VIEWPORTS.find((v) => v.name === 'mobile');
      expect(mobile).toBeDefined();
      expect(mobile!.width).toBe(375);
      expect(mobile!.height).toBe(812);
    });
  });

  // ===========================================================================
  // parseQAResponse
  // ===========================================================================

  describe('parseQAResponse', () => {
    it('parses valid JSON with findings and checklist_results', () => {
      const json = JSON.stringify({
        findings: [
          { severity: 'critical', category: 'layout', description: 'Overflow on mobile', location: 'header' },
          { severity: 'minor', category: 'typography', description: 'Font too small', location: 'footer' },
        ],
        checklist_results: [
          { index: 1, passed: true, notes: 'Looks good' },
          { index: 2, passed: false, notes: 'Needs fix' },
        ],
        overall_score: 72,
        summary: 'Mostly passing with minor issues.',
      });

      const result = parseQAResponse(json, 2);
      expect(result.findings).toHaveLength(2);
      expect(result.checklistResults).toHaveLength(2);
      expect(result.overallScore).toBe(72);
      expect(result.summary).toBe('Mostly passing with minor issues.');
      expect(result.findings[0].severity).toBe('critical');
      expect(result.findings[1].severity).toBe('minor');
      expect(result.checklistResults[0].passed).toBe(true);
      expect(result.checklistResults[1].passed).toBe(false);
    });

    it('parses JSON in markdown code blocks', () => {
      const responseText = '```json\n' + JSON.stringify({
        findings: [
          { severity: 'major', category: 'accessibility', description: 'Missing alt text', location: 'hero image' },
        ],
        checklist_results: [],
        overall_score: 60,
        summary: 'Accessibility issues found.',
      }) + '\n```';

      const result = parseQAResponse(responseText, 0);
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].category).toBe('accessibility');
      expect(result.overallScore).toBe(60);
    });

    it('normalizes severity: "critical" stays "critical"', () => {
      const json = JSON.stringify({
        findings: [{ severity: 'critical', category: 'bug', description: 'Crash', location: 'app' }],
        checklist_results: [],
        overall_score: 20,
        summary: '',
      });

      const result = parseQAResponse(json, 0);
      expect(result.findings[0].severity).toBe('critical');
    });

    it('normalizes severity: "blocker" becomes "critical"', () => {
      const json = JSON.stringify({
        findings: [{ severity: 'blocker', category: 'bug', description: 'Blocks deploy', location: 'ci' }],
        checklist_results: [],
        overall_score: 10,
        summary: '',
      });

      const result = parseQAResponse(json, 0);
      expect(result.findings[0].severity).toBe('critical');
    });

    it('normalizes severity: "high" becomes "major"', () => {
      const json = JSON.stringify({
        findings: [{ severity: 'high', category: 'perf', description: 'Slow load', location: 'page' }],
        checklist_results: [],
        overall_score: 50,
        summary: '',
      });

      const result = parseQAResponse(json, 0);
      expect(result.findings[0].severity).toBe('major');
    });

    it('normalizes severity: "medium" becomes "minor"', () => {
      const json = JSON.stringify({
        findings: [{ severity: 'medium', category: 'style', description: 'Spacing off', location: 'sidebar' }],
        checklist_results: [],
        overall_score: 65,
        summary: '',
      });

      const result = parseQAResponse(json, 0);
      expect(result.findings[0].severity).toBe('minor');
    });

    it('normalizes severity: "low" becomes "minor"', () => {
      const json = JSON.stringify({
        findings: [{ severity: 'low', category: 'style', description: 'Tiny gap', location: 'footer' }],
        checklist_results: [],
        overall_score: 80,
        summary: '',
      });

      const result = parseQAResponse(json, 0);
      expect(result.findings[0].severity).toBe('minor');
    });

    it('normalizes severity: unknown becomes "info"', () => {
      const json = JSON.stringify({
        findings: [{ severity: 'banana', category: 'unknown', description: 'Something odd', location: 'somewhere' }],
        checklist_results: [],
        overall_score: 90,
        summary: '',
      });

      const result = parseQAResponse(json, 0);
      expect(result.findings[0].severity).toBe('info');
    });

    it('handles missing fields with defaults', () => {
      const json = JSON.stringify({
        findings: [{}],
        checklist_results: [{}],
      });

      const result = parseQAResponse(json, 1);
      // Finding defaults
      expect(result.findings[0].severity).toBe('info');
      expect(result.findings[0].category).toBe('general');
      expect(result.findings[0].description).toBe('');
      expect(result.findings[0].location).toBe('');
      // Checklist defaults
      expect(result.checklistResults[0].index).toBe(1);
      expect(result.checklistResults[0].passed).toBe(false);
      expect(result.checklistResults[0].notes).toBe('');
      // Score defaults to 0, summary defaults to ''
      expect(result.overallScore).toBe(0);
      expect(result.summary).toBe('');
    });

    it('returns score 0 for unparseable response', () => {
      const result = parseQAResponse('This is not valid JSON at all!!!', 2);
      expect(result.overallScore).toBe(0);
      expect(result.findings).toHaveLength(0);
      expect(result.checklistResults).toHaveLength(0);
    });

    it('clamps score to 0-100 range', () => {
      const jsonOver = JSON.stringify({
        findings: [],
        checklist_results: [],
        overall_score: 150,
        summary: 'Over 100',
      });
      const resultOver = parseQAResponse(jsonOver, 0);
      expect(resultOver.overallScore).toBe(100);

      const jsonUnder = JSON.stringify({
        findings: [],
        checklist_results: [],
        overall_score: -20,
        summary: 'Under 0',
      });
      const resultUnder = parseQAResponse(jsonUnder, 0);
      expect(resultUnder.overallScore).toBe(0);
    });

    it('includes summary from parsed JSON', () => {
      const json = JSON.stringify({
        findings: [],
        checklist_results: [],
        overall_score: 85,
        summary: 'The implementation looks solid with responsive layouts across all breakpoints.',
      });

      const result = parseQAResponse(json, 0);
      expect(result.summary).toBe('The implementation looks solid with responsive layouts across all breakpoints.');
    });

    it('handles empty findings array', () => {
      const json = JSON.stringify({
        findings: [],
        checklist_results: [{ index: 1, passed: true, notes: 'OK' }],
        overall_score: 100,
        summary: 'No issues found.',
      });

      const result = parseQAResponse(json, 1);
      expect(result.findings).toHaveLength(0);
      expect(result.findingsCount).toEqual({ critical: 0, major: 0, minor: 0, info: 0 });
    });

    it('handles empty checklist_results array', () => {
      const json = JSON.stringify({
        findings: [{ severity: 'minor', category: 'style', description: 'Small issue', location: 'nav' }],
        checklist_results: [],
        overall_score: 88,
        summary: 'Minor issues only.',
      });

      const result = parseQAResponse(json, 0);
      expect(result.checklistResults).toHaveLength(0);
      expect(result.findings).toHaveLength(1);
    });

    it('calculates findings count correctly', () => {
      const json = JSON.stringify({
        findings: [
          { severity: 'critical', category: 'a', description: 'a', location: 'a' },
          { severity: 'critical', category: 'b', description: 'b', location: 'b' },
          { severity: 'high', category: 'c', description: 'c', location: 'c' },
          { severity: 'medium', category: 'd', description: 'd', location: 'd' },
          { severity: 'low', category: 'e', description: 'e', location: 'e' },
          { severity: 'unknown', category: 'f', description: 'f', location: 'f' },
        ],
        checklist_results: [],
        overall_score: 30,
        summary: 'Many issues.',
      });

      const result = parseQAResponse(json, 0);
      expect(result.findingsCount.critical).toBe(2);
      expect(result.findingsCount.major).toBe(1);
      expect(result.findingsCount.minor).toBe(2);
      expect(result.findingsCount.info).toBe(1);
    });
  });

  // ===========================================================================
  // countFindings
  // ===========================================================================

  describe('countFindings', () => {
    it('counts empty array as all zeros', () => {
      const result = countFindings([]);
      expect(result).toEqual({ critical: 0, major: 0, minor: 0, info: 0 });
    });

    it('counts single critical finding', () => {
      const findings: QAFinding[] = [
        { severity: 'critical', category: 'bug', description: 'Crash on load', location: 'app' },
      ];
      const result = countFindings(findings);
      expect(result.critical).toBe(1);
      expect(result.major).toBe(0);
      expect(result.minor).toBe(0);
      expect(result.info).toBe(0);
    });

    it('counts mixed severities correctly', () => {
      const findings: QAFinding[] = [
        { severity: 'critical', category: 'a', description: 'a', location: 'a' },
        { severity: 'major', category: 'b', description: 'b', location: 'b' },
        { severity: 'minor', category: 'c', description: 'c', location: 'c' },
        { severity: 'info', category: 'd', description: 'd', location: 'd' },
      ];
      const result = countFindings(findings);
      expect(result).toEqual({ critical: 1, major: 1, minor: 1, info: 1 });
    });

    it('returns correct totals for large arrays', () => {
      const findings: QAFinding[] = [
        { severity: 'critical', category: 'a', description: 'a', location: 'a' },
        { severity: 'critical', category: 'b', description: 'b', location: 'b' },
        { severity: 'critical', category: 'c', description: 'c', location: 'c' },
        { severity: 'major', category: 'd', description: 'd', location: 'd' },
        { severity: 'major', category: 'e', description: 'e', location: 'e' },
        { severity: 'minor', category: 'f', description: 'f', location: 'f' },
        { severity: 'minor', category: 'g', description: 'g', location: 'g' },
        { severity: 'minor', category: 'h', description: 'h', location: 'h' },
        { severity: 'minor', category: 'i', description: 'i', location: 'i' },
        { severity: 'info', category: 'j', description: 'j', location: 'j' },
      ];
      const result = countFindings(findings);
      expect(result.critical).toBe(3);
      expect(result.major).toBe(2);
      expect(result.minor).toBe(4);
      expect(result.info).toBe(1);
    });

    it('all severity types counted', () => {
      const severities: QAFinding['severity'][] = ['critical', 'major', 'minor', 'info'];
      const findings: QAFinding[] = severities.map((s) => ({
        severity: s,
        category: 'test',
        description: 'test',
        location: 'test',
      }));
      const result = countFindings(findings);
      for (const s of severities) {
        expect(result[s]).toBe(1);
      }
    });
  });

  // ===========================================================================
  // scoreToStatus
  // ===========================================================================

  describe('scoreToStatus', () => {
    it('score 70 returns "passed"', () => {
      expect(scoreToStatus(70)).toBe('passed');
    });

    it('score 100 returns "passed"', () => {
      expect(scoreToStatus(100)).toBe('passed');
    });

    it('score 69 returns "failed"', () => {
      expect(scoreToStatus(69)).toBe('failed');
    });

    it('score 0 returns "failed"', () => {
      expect(scoreToStatus(0)).toBe('failed');
    });
  });
});
