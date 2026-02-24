import { describe, it, expect } from 'vitest';
import {
  HUNTER_COSTS,
  SNOV_COSTS,
  RESEND_COSTS,
  formatCostReport,
} from '@/lib/ai/scout-cost-tracker';
import type { ScoutCostReport } from '@/lib/ai/scout-cost-tracker';

// ============================================================================
// Cost rate constants
// ============================================================================

describe('cost rates', () => {
  it('has correct Hunter.io rates', () => {
    expect(HUNTER_COSTS.domain_search).toBe(0.098);
    expect(HUNTER_COSTS.email_finder).toBe(0.049);
    expect(HUNTER_COSTS.email_verifier).toBe(0.049);
  });

  it('has correct Snov.io rates', () => {
    expect(SNOV_COSTS.linkedin_enrichment).toBe(0.039);
    expect(SNOV_COSTS.email_search).toBe(0.039);
    expect(SNOV_COSTS.email_verify).toBe(0.0);
  });

  it('has free Resend rates', () => {
    expect(RESEND_COSTS.email_send).toBe(0.0);
  });

  it('Snov.io linkedin enrichment costs per credit are defined', () => {
    // Snov: $0.039/credit, Hunter finder: $0.049/call
    // Both are affordable but track independently
    expect(SNOV_COSTS.linkedin_enrichment).toBeGreaterThan(0);
    expect(HUNTER_COSTS.email_finder).toBeGreaterThan(0);
  });
});

// ============================================================================
// formatCostReport
// ============================================================================

describe('formatCostReport', () => {
  const sampleReport: ScoutCostReport = {
    run_id: 'test-run-123',
    period: '2025-02-01 to 2025-02-17',
    total_cost_usd: 1.234567,
    total_api_calls: 42,
    by_service: {
      hunter: {
        cost_usd: 0.49,
        credits_used: 10,
        api_calls: 10,
        operations: {
          email_finder: { cost_usd: 0.49, credits: 10, calls: 10 },
        },
      },
      anthropic: {
        cost_usd: 0.74,
        credits_used: 25000,
        api_calls: 12,
        operations: {
          dossier_research: { cost_usd: 0.54, credits: 18000, calls: 6 },
          email_generation: { cost_usd: 0.2, credits: 7000, calls: 6 },
        },
      },
    },
    candidates_processed: 6,
    cost_per_candidate: 0.205761,
  };

  it('formats a complete report with all sections', () => {
    const text = formatCostReport(sampleReport);

    expect(text).toContain('SCOUT PIPELINE COST REPORT');
    expect(text).toContain('2025-02-01 to 2025-02-17');
    expect(text).toContain('HUNTER');
    expect(text).toContain('ANTHROPIC');
    expect(text).toContain('SUMMARY');
  });

  it('includes total cost', () => {
    const text = formatCostReport(sampleReport);
    expect(text).toContain('$1.2346'); // 4 decimal places
  });

  it('includes per-candidate cost', () => {
    const text = formatCostReport(sampleReport);
    expect(text).toContain('Cost per candidate');
    expect(text).toContain('$0.2058');
  });

  it('includes API call counts', () => {
    const text = formatCostReport(sampleReport);
    expect(text).toContain('42');
  });

  it('includes operation-level breakdown', () => {
    const text = formatCostReport(sampleReport);
    expect(text).toContain('email_finder');
    expect(text).toContain('dossier_research');
    expect(text).toContain('email_generation');
  });

  it('handles empty report', () => {
    const empty: ScoutCostReport = {
      run_id: null,
      period: 'all time',
      total_cost_usd: 0,
      total_api_calls: 0,
      by_service: {},
      candidates_processed: 0,
      cost_per_candidate: 0,
    };
    const text = formatCostReport(empty);
    expect(text).toContain('SUMMARY');
    expect(text).toContain('$0.0000');
  });
});
