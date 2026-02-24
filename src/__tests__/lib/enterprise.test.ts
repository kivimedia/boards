import { describe, it, expect, vi } from 'vitest';
import {
  matchesCIDR,
  getSSOConfigs,
  getSSOConfig,
  createSSOConfig,
  updateSSOConfig,
  deleteSSOConfig,
  getIPWhitelist,
  addIPWhitelistEntry,
  removeIPWhitelistEntry,
  toggleIPWhitelistEntry,
  isIPAllowed,
  createAuditEntry,
  getAuditLog,
  getAuditLogForResource,
  setReviewConfidence,
  verifyReviewAccuracy,
  getReviewAccuracyStats,
} from '../../lib/enterprise';
import type { SSOConfig, IPWhitelistEntry, AuditLogEntry } from '@/lib/types';

// ============================================================================
// MOCK SUPABASE
// ============================================================================

function createMockSupabase(overrides: Record<string, unknown> = {}) {
  const chainable: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  };
  return {
    from: vi.fn(() => chainable),
    _chain: chainable,
  } as unknown as ReturnType<typeof vi.fn> & { _chain: Record<string, unknown>; from: ReturnType<typeof vi.fn> };
}

// ============================================================================
// matchesCIDR (pure function tests)
// ============================================================================

describe('matchesCIDR', () => {
  it('matches exact IP when no CIDR prefix is given', () => {
    expect(matchesCIDR('192.168.1.1', '192.168.1.1')).toBe(true);
  });

  it('does not match different exact IPs', () => {
    expect(matchesCIDR('192.168.1.1', '192.168.1.2')).toBe(false);
  });

  it('matches IP within a /24 CIDR range', () => {
    expect(matchesCIDR('192.168.1.50', '192.168.1.0/24')).toBe(true);
  });

  it('does not match IP outside a /24 CIDR range', () => {
    expect(matchesCIDR('192.168.2.1', '192.168.1.0/24')).toBe(false);
  });

  it('matches IP within a /16 CIDR range', () => {
    expect(matchesCIDR('10.0.99.1', '10.0.0.0/16')).toBe(true);
  });

  it('does not match IP outside a /16 CIDR range', () => {
    expect(matchesCIDR('10.1.0.1', '10.0.0.0/16')).toBe(false);
  });

  it('returns false for invalid CIDR prefix', () => {
    expect(matchesCIDR('10.0.0.1', '10.0.0.0/abc')).toBe(false);
  });

  it('returns false for negative prefix', () => {
    expect(matchesCIDR('10.0.0.1', '10.0.0.0/-1')).toBe(false);
  });

  it('returns false for prefix > 32', () => {
    expect(matchesCIDR('10.0.0.1', '10.0.0.0/33')).toBe(false);
  });

  it('/0 matches everything', () => {
    expect(matchesCIDR('1.2.3.4', '0.0.0.0/0')).toBe(true);
    expect(matchesCIDR('255.255.255.255', '0.0.0.0/0')).toBe(true);
  });

  it('/32 matches only exact IP', () => {
    expect(matchesCIDR('10.0.0.1', '10.0.0.1/32')).toBe(true);
    expect(matchesCIDR('10.0.0.2', '10.0.0.1/32')).toBe(false);
  });

  it('returns false for malformed IP address', () => {
    expect(matchesCIDR('not-an-ip', '10.0.0.0/24')).toBe(false);
  });

  it('returns false for malformed CIDR IP', () => {
    expect(matchesCIDR('10.0.0.1', 'not-an-ip/24')).toBe(false);
  });

  it('handles /8 range correctly', () => {
    expect(matchesCIDR('10.255.255.255', '10.0.0.0/8')).toBe(true);
    expect(matchesCIDR('11.0.0.0', '10.0.0.0/8')).toBe(false);
  });
});

// ============================================================================
// getSSOConfigs (mock)
// ============================================================================

describe('getSSOConfigs', () => {
  it('returns array of SSO configs', async () => {
    const mockData: Partial<SSOConfig>[] = [
      { id: 'sso-1', name: 'Okta', provider_type: 'saml', is_active: true },
      { id: 'sso-2', name: 'Azure AD', provider_type: 'oidc', is_active: false },
    ];
    const supabase = createMockSupabase();
    (supabase._chain as any).order = vi.fn().mockResolvedValue({ data: mockData });

    const result = await getSSOConfigs(supabase as any);
    expect(result).toEqual(mockData);
    expect(supabase.from).toHaveBeenCalledWith('sso_configs');
  });

  it('returns empty array when data is null', async () => {
    const supabase = createMockSupabase();
    (supabase._chain as any).order = vi.fn().mockResolvedValue({ data: null });

    const result = await getSSOConfigs(supabase as any);
    expect(result).toEqual([]);
  });
});

// ============================================================================
// createSSOConfig (mock)
// ============================================================================

describe('createSSOConfig', () => {
  it('returns created config on success', async () => {
    const mockConfig: Partial<SSOConfig> = {
      id: 'sso-new',
      name: 'New SSO',
      provider_type: 'saml',
      is_active: true,
    };
    const supabase = createMockSupabase({
      single: vi.fn().mockResolvedValue({ data: mockConfig, error: null }),
    });

    const result = await createSSOConfig(supabase as any, {
      providerType: 'saml',
      name: 'New SSO',
      issuerUrl: 'https://idp.example.com',
      allowedDomains: ['example.com'],
    });

    expect(result).toEqual(mockConfig);
    expect(supabase.from).toHaveBeenCalledWith('sso_configs');
  });

  it('returns null on error', async () => {
    const supabase = createMockSupabase({
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'fail' } }),
    });

    const result = await createSSOConfig(supabase as any, {
      providerType: 'oidc',
      name: 'Fail SSO',
    });

    expect(result).toBeNull();
  });
});

// ============================================================================
// updateSSOConfig (mock)
// ============================================================================

describe('updateSSOConfig', () => {
  it('returns updated config', async () => {
    const mockUpdated: Partial<SSOConfig> = { id: 'sso-1', name: 'Updated', is_active: false };
    const supabase = createMockSupabase({
      single: vi.fn().mockResolvedValue({ data: mockUpdated, error: null }),
    });

    const result = await updateSSOConfig(supabase as any, 'sso-1', { name: 'Updated', is_active: false });
    expect(result).toEqual(mockUpdated);
    expect(supabase.from).toHaveBeenCalledWith('sso_configs');
    expect(supabase._chain.eq).toHaveBeenCalledWith('id', 'sso-1');
  });

  it('returns null on error', async () => {
    const supabase = createMockSupabase({
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    });

    const result = await updateSSOConfig(supabase as any, 'missing', { name: 'Nope' });
    expect(result).toBeNull();
  });
});

// ============================================================================
// deleteSSOConfig (mock)
// ============================================================================

describe('deleteSSOConfig', () => {
  it('calls delete with correct id', async () => {
    const supabase = createMockSupabase();

    await deleteSSOConfig(supabase as any, 'sso-del');
    expect(supabase.from).toHaveBeenCalledWith('sso_configs');
    expect(supabase._chain.delete).toHaveBeenCalled();
    expect(supabase._chain.eq).toHaveBeenCalledWith('id', 'sso-del');
  });
});

// ============================================================================
// getIPWhitelist (mock)
// ============================================================================

describe('getIPWhitelist', () => {
  it('returns array of IP whitelist entries', async () => {
    const mockData: Partial<IPWhitelistEntry>[] = [
      { id: 'ip-1', cidr: '10.0.0.0/24', is_active: true },
    ];
    const supabase = createMockSupabase();
    (supabase._chain as any).order = vi.fn().mockResolvedValue({ data: mockData });

    const result = await getIPWhitelist(supabase as any);
    expect(result).toEqual(mockData);
    expect(supabase.from).toHaveBeenCalledWith('ip_whitelist');
  });

  it('returns empty array when data is null', async () => {
    const supabase = createMockSupabase();
    (supabase._chain as any).order = vi.fn().mockResolvedValue({ data: null });

    const result = await getIPWhitelist(supabase as any);
    expect(result).toEqual([]);
  });
});

// ============================================================================
// addIPWhitelistEntry (mock)
// ============================================================================

describe('addIPWhitelistEntry', () => {
  it('returns created entry', async () => {
    const mockEntry: Partial<IPWhitelistEntry> = {
      id: 'ip-new',
      cidr: '192.168.1.0/24',
      is_active: true,
      description: 'Office',
    };
    const supabase = createMockSupabase({
      single: vi.fn().mockResolvedValue({ data: mockEntry, error: null }),
    });

    const result = await addIPWhitelistEntry(supabase as any, {
      cidr: '192.168.1.0/24',
      description: 'Office',
      createdBy: 'user-1',
    });

    expect(result).toEqual(mockEntry);
    expect(supabase.from).toHaveBeenCalledWith('ip_whitelist');
  });

  it('returns null on error', async () => {
    const supabase = createMockSupabase({
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'fail' } }),
    });

    const result = await addIPWhitelistEntry(supabase as any, { cidr: 'bad' });
    expect(result).toBeNull();
  });
});

// ============================================================================
// isIPAllowed (mock)
// ============================================================================

describe('isIPAllowed', () => {
  it('returns true when no whitelist entries exist', async () => {
    const supabase = createMockSupabase();
    (supabase._chain as any).order = vi.fn().mockResolvedValue({ data: [] });

    const result = await isIPAllowed(supabase as any, '1.2.3.4');
    expect(result).toBe(true);
  });

  it('returns true when IP matches an active entry', async () => {
    const entries: Partial<IPWhitelistEntry>[] = [
      { id: 'ip-1', cidr: '10.0.0.0/8', is_active: true },
    ];
    const supabase = createMockSupabase();
    (supabase._chain as any).order = vi.fn().mockResolvedValue({ data: entries });

    const result = await isIPAllowed(supabase as any, '10.5.5.5');
    expect(result).toBe(true);
  });

  it('returns false when IP does not match any active entry', async () => {
    const entries: Partial<IPWhitelistEntry>[] = [
      { id: 'ip-1', cidr: '10.0.0.0/8', is_active: true },
    ];
    const supabase = createMockSupabase();
    (supabase._chain as any).order = vi.fn().mockResolvedValue({ data: entries });

    const result = await isIPAllowed(supabase as any, '192.168.1.1');
    expect(result).toBe(false);
  });

  it('ignores inactive entries and returns true if no active entries', async () => {
    const entries: Partial<IPWhitelistEntry>[] = [
      { id: 'ip-1', cidr: '10.0.0.0/8', is_active: false },
    ];
    const supabase = createMockSupabase();
    (supabase._chain as any).order = vi.fn().mockResolvedValue({ data: entries });

    const result = await isIPAllowed(supabase as any, '192.168.1.1');
    expect(result).toBe(true);
  });
});

// ============================================================================
// createAuditEntry (mock)
// ============================================================================

describe('createAuditEntry', () => {
  it('calls insert with correct fields', async () => {
    const supabase = createMockSupabase();

    await createAuditEntry(supabase as any, {
      userId: 'user-1',
      action: 'create',
      resourceType: 'sso_config',
      resourceId: 'sso-1',
      newValues: { name: 'New Config' },
      ipAddress: '10.0.0.1',
    });

    expect(supabase.from).toHaveBeenCalledWith('audit_log');
    expect(supabase._chain.insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      action: 'create',
      resource_type: 'sso_config',
      resource_id: 'sso-1',
      old_values: null,
      new_values: { name: 'New Config' },
      ip_address: '10.0.0.1',
      user_agent: null,
      metadata: {},
    });
  });

  it('uses null defaults for optional fields', async () => {
    const supabase = createMockSupabase();

    await createAuditEntry(supabase as any, {
      action: 'delete',
      resourceType: 'card',
    });

    expect(supabase._chain.insert).toHaveBeenCalledWith({
      user_id: null,
      action: 'delete',
      resource_type: 'card',
      resource_id: null,
      old_values: null,
      new_values: null,
      ip_address: null,
      user_agent: null,
      metadata: {},
    });
  });
});

// ============================================================================
// getAuditLog (mock)
// ============================================================================

describe('getAuditLog', () => {
  it('returns audit entries', async () => {
    const mockData: Partial<AuditLogEntry>[] = [
      { id: 'al-1', action: 'create', resource_type: 'sso_config' },
    ];
    const supabase = createMockSupabase();
    (supabase._chain as any).limit = vi.fn().mockResolvedValue({ data: mockData });

    const result = await getAuditLog(supabase as any);
    expect(result).toEqual(mockData);
    expect(supabase.from).toHaveBeenCalledWith('audit_log');
  });

  it('applies userId filter when provided', async () => {
    const supabase = createMockSupabase();
    // Make limit resolve the chain
    (supabase._chain as any).limit = vi.fn().mockReturnThis();
    (supabase._chain as any).eq = vi.fn().mockResolvedValue({ data: [] });

    await getAuditLog(supabase as any, { userId: 'user-1' });
    expect(supabase._chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('applies multiple filters', async () => {
    const supabase = createMockSupabase();
    // Chain methods resolve at the end
    (supabase._chain as any).limit = vi.fn().mockReturnThis();
    (supabase._chain as any).eq = vi.fn().mockReturnThis();
    (supabase._chain as any).gte = vi.fn().mockReturnThis();
    (supabase._chain as any).lte = vi.fn().mockResolvedValue({ data: [] });

    await getAuditLog(supabase as any, {
      action: 'update',
      resourceType: 'card',
      startDate: '2025-01-01',
      endDate: '2025-12-31',
    });

    expect(supabase._chain.eq).toHaveBeenCalledWith('action', 'update');
    expect(supabase._chain.eq).toHaveBeenCalledWith('resource_type', 'card');
    expect(supabase._chain.gte).toHaveBeenCalledWith('created_at', '2025-01-01');
    expect(supabase._chain.lte).toHaveBeenCalledWith('created_at', '2025-12-31');
  });

  it('returns empty array when data is null', async () => {
    const supabase = createMockSupabase();
    (supabase._chain as any).limit = vi.fn().mockResolvedValue({ data: null });

    const result = await getAuditLog(supabase as any);
    expect(result).toEqual([]);
  });
});

// ============================================================================
// getAuditLogForResource (mock)
// ============================================================================

describe('getAuditLogForResource', () => {
  it('filters by resource_type and resource_id', async () => {
    const mockData: Partial<AuditLogEntry>[] = [
      { id: 'al-1', action: 'update', resource_type: 'card', resource_id: 'card-1' },
    ];
    const supabase = createMockSupabase();
    (supabase._chain as any).limit = vi.fn().mockResolvedValue({ data: mockData });

    const result = await getAuditLogForResource(supabase as any, 'card', 'card-1');
    expect(result).toEqual(mockData);
    expect(supabase._chain.eq).toHaveBeenCalledWith('resource_type', 'card');
    expect(supabase._chain.eq).toHaveBeenCalledWith('resource_id', 'card-1');
  });

  it('respects custom limit parameter', async () => {
    const supabase = createMockSupabase();
    (supabase._chain as any).limit = vi.fn().mockResolvedValue({ data: [] });

    await getAuditLogForResource(supabase as any, 'board', 'b1', 10);
    expect(supabase._chain.limit).toHaveBeenCalledWith(10);
  });
});

// ============================================================================
// setReviewConfidence (mock)
// ============================================================================

describe('setReviewConfidence', () => {
  it('calls update with confidence_score', async () => {
    const supabase = createMockSupabase();

    await setReviewConfidence(supabase as any, 'review-1', 0.85);

    expect(supabase.from).toHaveBeenCalledWith('ai_review_results');
    expect(supabase._chain.update).toHaveBeenCalledWith({ confidence_score: 0.85 });
    expect(supabase._chain.eq).toHaveBeenCalledWith('id', 'review-1');
  });
});

// ============================================================================
// verifyReviewAccuracy (mock)
// ============================================================================

describe('verifyReviewAccuracy', () => {
  it('sets accuracy_verified, verified_by, and verified_at fields', async () => {
    const supabase = createMockSupabase();

    await verifyReviewAccuracy(supabase as any, 'review-1', 'user-1', true);

    expect(supabase.from).toHaveBeenCalledWith('ai_review_results');
    const updateCall = (supabase._chain.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateCall.accuracy_verified).toBe(true);
    expect(updateCall.accuracy_verified_by).toBe('user-1');
    expect(updateCall.accuracy_verified_at).toBeDefined();
  });

  it('handles false accuracy verification', async () => {
    const supabase = createMockSupabase();

    await verifyReviewAccuracy(supabase as any, 'review-2', 'user-2', false);

    const updateCall = (supabase._chain.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(updateCall.accuracy_verified).toBe(false);
    expect(updateCall.accuracy_verified_by).toBe('user-2');
  });
});

// ============================================================================
// getReviewAccuracyStats (mock)
// ============================================================================

describe('getReviewAccuracyStats', () => {
  it('calculates accuracy rate from results', async () => {
    const mockData = [
      { accuracy_verified: true, card_id: 'c1' },
      { accuracy_verified: true, card_id: 'c2' },
      { accuracy_verified: false, card_id: 'c3' },
    ];
    const supabase = createMockSupabase();
    // The function chains .not() which returns chainable, then we need the final await
    // Since not returns this, and data comes from the last call
    (supabase._chain as any).not = vi.fn().mockResolvedValue({ data: mockData });

    const result = await getReviewAccuracyStats(supabase as any);
    expect(result.total).toBe(3);
    expect(result.verified).toBe(3);
    expect(result.accurate).toBe(2);
    expect(result.accuracyRate).toBe(66.67);
  });

  it('returns zero rate when no data', async () => {
    const supabase = createMockSupabase();
    (supabase._chain as any).not = vi.fn().mockResolvedValue({ data: [] });

    const result = await getReviewAccuracyStats(supabase as any);
    expect(result.total).toBe(0);
    expect(result.verified).toBe(0);
    expect(result.accurate).toBe(0);
    expect(result.accuracyRate).toBe(0);
  });

  it('returns zero rate when data is null', async () => {
    const supabase = createMockSupabase();
    (supabase._chain as any).not = vi.fn().mockResolvedValue({ data: null });

    const result = await getReviewAccuracyStats(supabase as any);
    expect(result.accuracyRate).toBe(0);
  });

  it('passes boardId filter when provided', async () => {
    const supabase = createMockSupabase();
    (supabase._chain as any).not = vi.fn().mockReturnThis();
    (supabase._chain as any).eq = vi.fn().mockResolvedValue({ data: [] });

    await getReviewAccuracyStats(supabase as any, 'board-1');
    expect(supabase._chain.eq).toHaveBeenCalledWith('board_id', 'board-1');
  });
});

// ============================================================================
// Type shape tests
// ============================================================================

describe('Type shape tests', () => {
  it('SSOConfig has required fields', () => {
    const config: SSOConfig = {
      id: 'sso-1',
      provider_type: 'saml',
      name: 'Test SSO',
      issuer_url: null,
      metadata_url: null,
      client_id: null,
      client_secret_encrypted: null,
      certificate: null,
      attribute_mapping: {},
      is_active: true,
      auto_provision_users: false,
      default_role: 'member',
      allowed_domains: [],
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    };
    expect(config.id).toBe('sso-1');
    expect(config.provider_type).toBe('saml');
    expect(config.is_active).toBe(true);
    expect(config.auto_provision_users).toBe(false);
    expect(config.allowed_domains).toEqual([]);
  });

  it('IPWhitelistEntry has required fields', () => {
    const entry: IPWhitelistEntry = {
      id: 'ip-1',
      cidr: '10.0.0.0/24',
      description: 'Test',
      is_active: true,
      created_by: 'user-1',
      created_at: '2025-01-01T00:00:00Z',
    };
    expect(entry.cidr).toBe('10.0.0.0/24');
    expect(entry.is_active).toBe(true);
    expect(entry.description).toBe('Test');
  });

  it('AuditLogEntry has required fields', () => {
    const entry: AuditLogEntry = {
      id: 'al-1',
      user_id: 'user-1',
      action: 'create',
      resource_type: 'card',
      resource_id: 'card-1',
      old_values: null,
      new_values: { title: 'New' },
      ip_address: '10.0.0.1',
      user_agent: 'test',
      metadata: {},
      created_at: '2025-01-01T00:00:00Z',
    };
    expect(entry.action).toBe('create');
    expect(entry.resource_type).toBe('card');
    expect(entry.new_values).toEqual({ title: 'New' });
    expect(entry.metadata).toEqual({});
  });
});

// ============================================================================
// removeIPWhitelistEntry (mock)
// ============================================================================

describe('removeIPWhitelistEntry', () => {
  it('calls delete with correct entry id', async () => {
    const supabase = createMockSupabase();

    await removeIPWhitelistEntry(supabase as any, 'ip-del');
    expect(supabase.from).toHaveBeenCalledWith('ip_whitelist');
    expect(supabase._chain.delete).toHaveBeenCalled();
    expect(supabase._chain.eq).toHaveBeenCalledWith('id', 'ip-del');
  });
});

// ============================================================================
// toggleIPWhitelistEntry (mock)
// ============================================================================

describe('toggleIPWhitelistEntry', () => {
  it('calls update with is_active true', async () => {
    const supabase = createMockSupabase();

    await toggleIPWhitelistEntry(supabase as any, 'ip-1', true);
    expect(supabase.from).toHaveBeenCalledWith('ip_whitelist');
    expect(supabase._chain.update).toHaveBeenCalledWith({ is_active: true });
    expect(supabase._chain.eq).toHaveBeenCalledWith('id', 'ip-1');
  });

  it('calls update with is_active false', async () => {
    const supabase = createMockSupabase();

    await toggleIPWhitelistEntry(supabase as any, 'ip-1', false);
    expect(supabase._chain.update).toHaveBeenCalledWith({ is_active: false });
  });
});

// ============================================================================
// getSSOConfig (single) (mock)
// ============================================================================

describe('getSSOConfig', () => {
  it('returns single config by id', async () => {
    const mockConfig: Partial<SSOConfig> = { id: 'sso-1', name: 'Test' };
    const supabase = createMockSupabase({
      single: vi.fn().mockResolvedValue({ data: mockConfig }),
    });

    const result = await getSSOConfig(supabase as any, 'sso-1');
    expect(result).toEqual(mockConfig);
    expect(supabase._chain.eq).toHaveBeenCalledWith('id', 'sso-1');
  });

  it('returns null when config not found', async () => {
    const supabase = createMockSupabase({
      single: vi.fn().mockResolvedValue({ data: null }),
    });

    const result = await getSSOConfig(supabase as any, 'missing');
    expect(result).toBeNull();
  });
});
