import { describe, it, expect } from 'vitest';
import type { AgencyRole, AccountStatus, Profile, UserRole } from '@/lib/types';

/**
 * Tests for agency role types from src/lib/types.ts.
 *
 * AgencyRole = 'agency_owner' | 'dev' | 'designer' | 'account_manager' | 'executive_assistant' | 'video_editor'
 * AccountStatus = 'pending' | 'active' | 'suspended'
 */

describe('Agency Roles (Migration 035)', () => {
  describe('AgencyRole type', () => {
    it('agency_owner is a valid AgencyRole', () => {
      const role: AgencyRole = 'agency_owner';
      expect(role).toBe('agency_owner');
    });

    it('dev is a valid AgencyRole', () => {
      const role: AgencyRole = 'dev';
      expect(role).toBe('dev');
    });

    it('designer is a valid AgencyRole', () => {
      const role: AgencyRole = 'designer';
      expect(role).toBe('designer');
    });

    it('account_manager is a valid AgencyRole', () => {
      const role: AgencyRole = 'account_manager';
      expect(role).toBe('account_manager');
    });

    it('executive_assistant is a valid AgencyRole', () => {
      const role: AgencyRole = 'executive_assistant';
      expect(role).toBe('executive_assistant');
    });

    it('video_editor is a valid AgencyRole', () => {
      const role: AgencyRole = 'video_editor';
      expect(role).toBe('video_editor');
    });

    it('all 6 agency roles can be collected into an array', () => {
      const allRoles: AgencyRole[] = [
        'agency_owner',
        'dev',
        'designer',
        'account_manager',
        'executive_assistant',
        'video_editor',
      ];
      expect(allRoles).toHaveLength(6);
    });
  });

  describe('AccountStatus type', () => {
    it('pending is a valid AccountStatus', () => {
      const status: AccountStatus = 'pending';
      expect(status).toBe('pending');
    });

    it('active is a valid AccountStatus', () => {
      const status: AccountStatus = 'active';
      expect(status).toBe('active');
    });

    it('suspended is a valid AccountStatus', () => {
      const status: AccountStatus = 'suspended';
      expect(status).toBe('suspended');
    });

    it('all 3 account statuses can be collected', () => {
      const allStatuses: AccountStatus[] = ['pending', 'active', 'suspended'];
      expect(allStatuses).toHaveLength(3);
    });
  });

  describe('Profile type with agency fields', () => {
    it('Profile includes optional agency_role field', () => {
      const profile: Profile = {
        id: 'user-1',
        display_name: 'Test User',
        avatar_url: null,
        role: 'member',
        agency_role: 'dev',
      };

      expect(profile.agency_role).toBe('dev');
    });

    it('Profile includes optional account_status field', () => {
      const profile: Profile = {
        id: 'user-2',
        display_name: 'New User',
        avatar_url: null,
        role: 'member',
        account_status: 'pending',
      };

      expect(profile.account_status).toBe('pending');
    });

    it('Profile agency_role can be null', () => {
      const profile: Profile = {
        id: 'user-3',
        display_name: 'Guest User',
        avatar_url: null,
        role: 'guest',
        agency_role: null,
      };

      expect(profile.agency_role).toBeNull();
    });

    it('Profile has all expected base fields', () => {
      const profile: Profile = {
        id: 'user-4',
        display_name: 'Full Profile',
        avatar_url: 'https://example.com/photo.jpg',
        role: 'admin',
        agency_role: 'agency_owner',
        account_status: 'active',
        user_role: 'admin' as UserRole,
        email: 'test@agency.com',
      };

      expect(profile).toHaveProperty('id');
      expect(profile).toHaveProperty('display_name');
      expect(profile).toHaveProperty('avatar_url');
      expect(profile).toHaveProperty('role');
      expect(profile).toHaveProperty('agency_role');
      expect(profile).toHaveProperty('account_status');
      expect(profile).toHaveProperty('user_role');
      expect(profile).toHaveProperty('email');
    });
  });
});
