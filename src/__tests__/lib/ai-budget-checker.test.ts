import { describe, it, expect } from 'vitest';
import {
  canMakeAICall,
  checkBudgetStatus,
  getAllBudgetStatuses,
} from '@/lib/ai/budget-checker';

describe('AI Budget Checker (P2.0)', () => {
  // ===========================================================================
  // Import verification
  // ===========================================================================

  describe('module exports', () => {
    it('canMakeAICall is exported as a function', () => {
      expect(typeof canMakeAICall).toBe('function');
    });

    it('checkBudgetStatus is exported as a function', () => {
      expect(typeof checkBudgetStatus).toBe('function');
    });

    it('getAllBudgetStatuses is exported as a function', () => {
      expect(typeof getAllBudgetStatuses).toBe('function');
    });

    it('canMakeAICall accepts 2 parameters (supabase, context)', () => {
      // Function.length reflects the number of declared parameters
      expect(canMakeAICall.length).toBe(2);
    });

    it('checkBudgetStatus accepts 2-3 parameters (supabase, scope, scopeId?)', () => {
      // scopeId is optional, so .length reports the required params before the first optional
      expect(checkBudgetStatus.length).toBeGreaterThanOrEqual(2);
      expect(checkBudgetStatus.length).toBeLessThanOrEqual(3);
    });

    it('getAllBudgetStatuses accepts 1 parameter (supabase)', () => {
      expect(getAllBudgetStatuses.length).toBe(1);
    });
  });
});
