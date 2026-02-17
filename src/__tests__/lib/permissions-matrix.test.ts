import { describe, it, expect } from 'vitest';
import {
  canViewBoard,
  canEditBoard,
  canCreateCard,
  canEditCard,
  canMoveCard,
  canDeleteCard,
  canManageMembers,
  isAdmin,
  canComment,
  canUploadAttachments,
} from '@/lib/permissions';
import { UserRole } from '@/lib/types';

// ---------------------------------------------------------------------------
// Full RBAC Permission Matrix
//
// This test documents and verifies the entire permission matrix in a single
// table.  Each row is a role, each column is a permission function.
//
// Role hierarchy (low → high): observer, client, guest, member, department_lead, admin
// ---------------------------------------------------------------------------

type PermissionFn = (role: UserRole) => boolean;

interface PermissionSpec {
  /** Human-readable permission name */
  name: string;
  /** The permission function under test */
  fn: PermissionFn;
  /** Expected result for each role, in hierarchy order */
  expected: Record<UserRole, boolean>;
}

/**
 * The single source of truth for the full permission matrix.
 *
 * If a permission changes, update the expected values here and the test will
 * catch any mismatch with the implementation.
 */
const PERMISSION_MATRIX: PermissionSpec[] = [
  {
    name: 'canViewBoard',
    fn: canViewBoard,
    expected: {
      observer: true,
      client: true,
      guest: true,
      member: true,
      department_lead: true,
      admin: true,
    },
  },
  {
    name: 'canComment',
    fn: canComment,
    expected: {
      observer: false,
      client: false,
      guest: true,
      member: true,
      department_lead: true,
      admin: true,
    },
  },
  {
    name: 'canMoveCard',
    fn: canMoveCard,
    expected: {
      observer: false,
      client: false,
      guest: true,
      member: true,
      department_lead: true,
      admin: true,
    },
  },
  {
    name: 'canCreateCard',
    fn: canCreateCard,
    expected: {
      observer: false,
      client: false,
      guest: false,
      member: true,
      department_lead: true,
      admin: true,
    },
  },
  {
    name: 'canEditCard',
    fn: canEditCard,
    expected: {
      observer: false,
      client: false,
      guest: false,
      member: true,
      department_lead: true,
      admin: true,
    },
  },
  {
    name: 'canUploadAttachments',
    fn: canUploadAttachments,
    expected: {
      observer: false,
      client: false,
      guest: false,
      member: true,
      department_lead: true,
      admin: true,
    },
  },
  {
    name: 'canEditBoard',
    fn: canEditBoard,
    expected: {
      observer: false,
      client: false,
      guest: false,
      member: false,
      department_lead: true,
      admin: true,
    },
  },
  {
    name: 'canDeleteCard',
    fn: canDeleteCard,
    expected: {
      observer: false,
      client: false,
      guest: false,
      member: false,
      department_lead: true,
      admin: true,
    },
  },
  {
    name: 'canManageMembers',
    fn: canManageMembers,
    expected: {
      observer: false,
      client: false,
      guest: false,
      member: false,
      department_lead: true,
      admin: true,
    },
  },
  {
    name: 'isAdmin',
    fn: isAdmin,
    expected: {
      observer: false,
      client: false,
      guest: false,
      member: false,
      department_lead: false,
      admin: true,
    },
  },
];

const ALL_ROLES: UserRole[] = [
  'observer',
  'client',
  'guest',
  'member',
  'department_lead',
  'admin',
];

// ---------------------------------------------------------------------------
// Matrix test: iterate every permission x every role
// ---------------------------------------------------------------------------

describe('RBAC Permission Matrix', () => {
  for (const spec of PERMISSION_MATRIX) {
    describe(spec.name, () => {
      for (const role of ALL_ROLES) {
        it(`${role} → ${spec.expected[role]}`, () => {
          expect(spec.fn(role)).toBe(spec.expected[role]);
        });
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Role-centric view: verify each role has the exact set of permissions expected
// ---------------------------------------------------------------------------

describe('Role-centric permission summary', () => {
  /**
   * For every role, list which permissions should be granted.
   * This is the "transpose" of the matrix above — useful for verifying that
   * a given role has exactly the right set of capabilities.
   */
  const rolePermissions: Record<UserRole, string[]> = {
    observer: ['canViewBoard'],
    client: ['canViewBoard'],
    guest: ['canViewBoard', 'canComment', 'canMoveCard'],
    member: [
      'canViewBoard',
      'canComment',
      'canMoveCard',
      'canCreateCard',
      'canEditCard',
      'canUploadAttachments',
    ],
    department_lead: [
      'canViewBoard',
      'canComment',
      'canMoveCard',
      'canCreateCard',
      'canEditCard',
      'canUploadAttachments',
      'canEditBoard',
      'canDeleteCard',
      'canManageMembers',
    ],
    admin: [
      'canViewBoard',
      'canComment',
      'canMoveCard',
      'canCreateCard',
      'canEditCard',
      'canUploadAttachments',
      'canEditBoard',
      'canDeleteCard',
      'canManageMembers',
      'isAdmin',
    ],
  };

  for (const role of ALL_ROLES) {
    describe(`${role}`, () => {
      const expectedGrants = new Set(rolePermissions[role]);

      for (const spec of PERMISSION_MATRIX) {
        const shouldBeGranted = expectedGrants.has(spec.name);
        it(`${shouldBeGranted ? 'CAN' : 'CANNOT'} ${spec.name}`, () => {
          expect(spec.fn(role)).toBe(shouldBeGranted);
        });
      }

      it(`has exactly ${expectedGrants.size} permissions granted`, () => {
        const grantedCount = PERMISSION_MATRIX.filter((spec) => spec.fn(role)).length;
        expect(grantedCount).toBe(expectedGrants.size);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// Structural invariants across the matrix
// ---------------------------------------------------------------------------

describe('Permission matrix structural invariants', () => {
  it('every higher role has a superset of permissions of every lower role', () => {
    // For each consecutive pair in the hierarchy, verify that the higher role
    // has at least every permission the lower role has.
    for (let i = 0; i < ALL_ROLES.length - 1; i++) {
      const lowerRole = ALL_ROLES[i];
      const higherRole = ALL_ROLES[i + 1];

      for (const spec of PERMISSION_MATRIX) {
        if (spec.fn(lowerRole)) {
          expect(
            spec.fn(higherRole),
            `${higherRole} should have ${spec.name} because ${lowerRole} does`
          ).toBe(true);
        }
      }
    }
  });

  it('admin has all permissions', () => {
    for (const spec of PERMISSION_MATRIX) {
      expect(spec.fn('admin'), `admin should have ${spec.name}`).toBe(true);
    }
  });

  it('observer has only canViewBoard', () => {
    for (const spec of PERMISSION_MATRIX) {
      if (spec.name === 'canViewBoard') {
        expect(spec.fn('observer')).toBe(true);
      } else {
        expect(spec.fn('observer'), `observer should NOT have ${spec.name}`).toBe(false);
      }
    }
  });

  it('the matrix covers all 10 permission functions', () => {
    expect(PERMISSION_MATRIX).toHaveLength(10);
  });

  it('the matrix covers all 6 roles per permission', () => {
    for (const spec of PERMISSION_MATRIX) {
      const testedRoles = Object.keys(spec.expected) as UserRole[];
      expect(testedRoles).toHaveLength(6);
      for (const role of ALL_ROLES) {
        expect(testedRoles).toContain(role);
      }
    }
  });

  it('total permission grants match expectations (60 cells, counted)', () => {
    // Total cells in the matrix: 10 permissions x 6 roles = 60
    let totalGrants = 0;
    for (const spec of PERMISSION_MATRIX) {
      for (const role of ALL_ROLES) {
        if (spec.expected[role]) {
          totalGrants++;
        }
      }
    }
    // Manually counted:
    //   canViewBoard:        6 grants
    //   canComment:          4 grants
    //   canMoveCard:         4 grants
    //   canCreateCard:       3 grants
    //   canEditCard:         3 grants
    //   canUploadAttachments:3 grants
    //   canEditBoard:        2 grants
    //   canDeleteCard:       2 grants
    //   canManageMembers:    2 grants
    //   isAdmin:             1 grant
    //   Total:              30 grants
    expect(totalGrants).toBe(30);
  });
});
