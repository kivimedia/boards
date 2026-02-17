import { describe, it, expect } from 'vitest';
import type {
  EmailTone,
  EmailStatus,
  ClientEmail,
  ClientEmailConfig,
  GoogleCalendarToken,
} from '../../lib/types';

describe('Client Email Types (P2.9)', () => {
  // ===========================================================================
  // EmailTone — covers 3 values
  // ===========================================================================

  describe('EmailTone', () => {
    it('covers all 3 tone values', () => {
      const values: EmailTone[] = ['formal', 'friendly', 'casual'];

      expect(values).toHaveLength(3);
      expect(values).toContain('formal');
      expect(values).toContain('friendly');
      expect(values).toContain('casual');
    });

    it('each value is a valid non-empty string', () => {
      const values: EmailTone[] = ['formal', 'friendly', 'casual'];
      for (const val of values) {
        expect(typeof val).toBe('string');
        expect(val.length).toBeGreaterThan(0);
      }
    });
  });

  // ===========================================================================
  // EmailStatus — covers 4 values
  // ===========================================================================

  describe('EmailStatus', () => {
    it('covers all 4 status values', () => {
      const values: EmailStatus[] = ['draft', 'approved', 'sent', 'failed'];

      expect(values).toHaveLength(4);
      expect(values).toContain('draft');
      expect(values).toContain('approved');
      expect(values).toContain('sent');
      expect(values).toContain('failed');
    });

    it('each value is a valid non-empty string', () => {
      const values: EmailStatus[] = ['draft', 'approved', 'sent', 'failed'];
      for (const val of values) {
        expect(typeof val).toBe('string');
        expect(val.length).toBeGreaterThan(0);
      }
    });
  });

  // ===========================================================================
  // ClientEmail — required fields
  // ===========================================================================

  describe('ClientEmail', () => {
    it('has all required fields', () => {
      const email: ClientEmail = {
        id: 'email-001',
        client_id: 'client-123',
        subject: 'Weekly Update for Acme Corp',
        body: 'Hi team,\n\nHere is your weekly update...',
        tone: 'friendly',
        recipients: ['contact@acme.com', 'manager@acme.com'],
        cc: ['account-manager@agency.com'],
        status: 'draft',
        scheduled_for: null,
        sent_at: null,
        resend_message_id: null,
        ai_generated: true,
        model_used: 'claude-sonnet-4-20250514',
        drafted_by: 'user-abc',
        approved_by: null,
        metadata: {},
        created_at: '2025-07-01T10:00:00Z',
        updated_at: '2025-07-01T10:00:00Z',
      };

      expect(email.id).toBe('email-001');
      expect(email.client_id).toBe('client-123');
      expect(email.subject).toBe('Weekly Update for Acme Corp');
      expect(email.body).toContain('weekly update');
      expect(email.tone).toBe('friendly');
      expect(email.recipients).toHaveLength(2);
      expect(email.cc).toHaveLength(1);
      expect(email.status).toBe('draft');
      expect(email.scheduled_for).toBeNull();
      expect(email.sent_at).toBeNull();
      expect(email.resend_message_id).toBeNull();
      expect(email.ai_generated).toBe(true);
      expect(email.model_used).toBe('claude-sonnet-4-20250514');
      expect(email.drafted_by).toBe('user-abc');
      expect(email.approved_by).toBeNull();
      expect(email.metadata).toEqual({});
      expect(email.created_at).toBe('2025-07-01T10:00:00Z');
      expect(email.updated_at).toBe('2025-07-01T10:00:00Z');
    });

    it('supports sent email with all fields populated', () => {
      const email: ClientEmail = {
        id: 'email-002',
        client_id: 'client-456',
        subject: 'Monthly Report',
        body: 'Dear client, here is your monthly report.',
        tone: 'formal',
        recipients: ['ceo@client.com'],
        cc: [],
        status: 'sent',
        scheduled_for: '2025-07-15T09:00:00Z',
        sent_at: '2025-07-15T09:01:23Z',
        resend_message_id: 'resend-msg-abc123',
        ai_generated: false,
        model_used: null,
        drafted_by: 'user-xyz',
        approved_by: 'user-admin',
        metadata: { revision_count: 2 },
        created_at: '2025-07-14T16:00:00Z',
        updated_at: '2025-07-15T09:01:23Z',
      };

      expect(email.status).toBe('sent');
      expect(email.sent_at).toBe('2025-07-15T09:01:23Z');
      expect(email.resend_message_id).toBe('resend-msg-abc123');
      expect(email.approved_by).toBe('user-admin');
      expect(email.ai_generated).toBe(false);
      expect(email.model_used).toBeNull();
    });

    it('allows empty cc and metadata', () => {
      const email: ClientEmail = {
        id: 'email-003',
        client_id: 'client-789',
        subject: 'Quick Note',
        body: 'Short message.',
        tone: 'casual',
        recipients: ['person@example.com'],
        cc: [],
        status: 'approved',
        scheduled_for: null,
        sent_at: null,
        resend_message_id: null,
        ai_generated: false,
        model_used: null,
        drafted_by: null,
        approved_by: null,
        metadata: {},
        created_at: '2025-08-01T00:00:00Z',
        updated_at: '2025-08-01T00:00:00Z',
      };

      expect(email.cc).toEqual([]);
      expect(email.metadata).toEqual({});
      expect(email.drafted_by).toBeNull();
    });
  });

  // ===========================================================================
  // ClientEmailConfig — interface structure
  // ===========================================================================

  describe('ClientEmailConfig', () => {
    it('has the expected optional fields', () => {
      const config: ClientEmailConfig = {
        update_cadence: 'weekly',
        send_day: 'Monday',
        send_time: '09:00',
        tone: 'friendly',
        recipients: ['contact@acme.com'],
        cc: ['manager@agency.com'],
      };

      expect(config.update_cadence).toBe('weekly');
      expect(config.send_day).toBe('Monday');
      expect(config.send_time).toBe('09:00');
      expect(config.tone).toBe('friendly');
      expect(config.recipients).toEqual(['contact@acme.com']);
      expect(config.cc).toEqual(['manager@agency.com']);
    });

    it('allows all fields to be undefined (empty config)', () => {
      const config: ClientEmailConfig = {};

      expect(config.update_cadence).toBeUndefined();
      expect(config.send_day).toBeUndefined();
      expect(config.send_time).toBeUndefined();
      expect(config.tone).toBeUndefined();
      expect(config.recipients).toBeUndefined();
      expect(config.cc).toBeUndefined();
    });

    it('supports all cadence values', () => {
      const weekly: ClientEmailConfig = { update_cadence: 'weekly' };
      const biweekly: ClientEmailConfig = { update_cadence: 'biweekly' };
      const monthly: ClientEmailConfig = { update_cadence: 'monthly' };

      expect(weekly.update_cadence).toBe('weekly');
      expect(biweekly.update_cadence).toBe('biweekly');
      expect(monthly.update_cadence).toBe('monthly');
    });
  });

  // ===========================================================================
  // GoogleCalendarToken — required fields
  // ===========================================================================

  describe('GoogleCalendarToken', () => {
    it('has all required fields', () => {
      const token: GoogleCalendarToken = {
        id: 'gcal-001',
        user_id: 'user-abc',
        access_token: 'ya29.access-token-value',
        refresh_token: '1//refresh-token-value',
        token_expiry: '2025-07-01T11:00:00Z',
        calendar_id: 'primary',
        created_at: '2025-07-01T10:00:00Z',
        updated_at: '2025-07-01T10:00:00Z',
      };

      expect(token.id).toBe('gcal-001');
      expect(token.user_id).toBe('user-abc');
      expect(token.access_token).toBe('ya29.access-token-value');
      expect(token.refresh_token).toBe('1//refresh-token-value');
      expect(token.token_expiry).toBe('2025-07-01T11:00:00Z');
      expect(token.calendar_id).toBe('primary');
      expect(token.created_at).toBe('2025-07-01T10:00:00Z');
      expect(token.updated_at).toBe('2025-07-01T10:00:00Z');
    });

    it('allows null calendar_id', () => {
      const token: GoogleCalendarToken = {
        id: 'gcal-002',
        user_id: 'user-xyz',
        access_token: 'ya29.another-token',
        refresh_token: '1//another-refresh',
        token_expiry: '2025-08-01T00:00:00Z',
        calendar_id: null,
        created_at: '2025-08-01T00:00:00Z',
        updated_at: '2025-08-01T00:00:00Z',
      };

      expect(token.calendar_id).toBeNull();
    });

    it('access_token and refresh_token are non-empty strings', () => {
      const token: GoogleCalendarToken = {
        id: 'gcal-003',
        user_id: 'user-test',
        access_token: 'ya29.valid-token',
        refresh_token: '1//valid-refresh',
        token_expiry: '2025-09-01T00:00:00Z',
        calendar_id: 'calendar-id-123',
        created_at: '2025-09-01T00:00:00Z',
        updated_at: '2025-09-01T00:00:00Z',
      };

      expect(typeof token.access_token).toBe('string');
      expect(token.access_token.length).toBeGreaterThan(0);
      expect(typeof token.refresh_token).toBe('string');
      expect(token.refresh_token.length).toBeGreaterThan(0);
    });
  });
});
