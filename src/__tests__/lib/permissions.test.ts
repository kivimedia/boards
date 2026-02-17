import { describe, it, expect } from 'vitest';
import {
  hasMinRole,
  getEffectiveRole,
  getUserBoardRole,
  canViewBoard,
  canEditBoard,
  canCreateCard,
  canEditCard,
  canMoveCard,
  canDeleteCard,
  canManageMembers,
  isAdmin,
  canMoveCardBetweenColumns,
  canComment,
  canUploadAttachments,
  getRoleLabel,
  getRoleDescription,
  ALL_ROLES,
} from '@/lib/permissions';
import { UserRole, BoardMember, ColumnMoveRule } from '@/lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALL_USER_ROLES: UserRole[] = [
  'observer',
  'client',
  'guest',
  'member',
  'department_lead',
  'admin',
];

/** Create a minimal BoardMember stub with only the fields the library uses. */
function makeBoardMember(overrides: Partial<BoardMember> = {}): BoardMember {
  return {
    id: 'bm-1',
    board_id: 'board-1',
    user_id: 'user-1',
    role: 'member',
    added_by: null,
    created_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

/** Create a minimal ColumnMoveRule stub. */
function makeMoveRule(overrides: Partial<ColumnMoveRule> = {}): ColumnMoveRule {
  return {
    id: 'rule-1',
    board_id: 'board-1',
    from_list_id: 'list-a',
    to_list_id: 'list-b',
    allowed_roles: ['member', 'department_lead'],
    created_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

// ===========================================================================
// 1. hasMinRole
// ===========================================================================

describe('hasMinRole', () => {
  // Hierarchy index: observer=0, client=1, guest=2, member=3, department_lead=4, admin=5

  describe('every role meets its own minimum', () => {
    for (const role of ALL_USER_ROLES) {
      it(`${role} >= ${role}`, () => {
        expect(hasMinRole(role, role)).toBe(true);
      });
    }
  });

  describe('observer (lowest) as the minimum — everyone passes', () => {
    for (const role of ALL_USER_ROLES) {
      it(`${role} >= observer`, () => {
        expect(hasMinRole(role, 'observer')).toBe(true);
      });
    }
  });

  describe('admin (highest) as the minimum — only admin passes', () => {
    for (const role of ALL_USER_ROLES) {
      it(`${role} >= admin → ${role === 'admin'}`, () => {
        expect(hasMinRole(role, 'admin')).toBe(role === 'admin');
      });
    }
  });

  describe('exhaustive pair-wise tests', () => {
    // Build the expected truth table from the hierarchy indices
    const hierarchyIndex: Record<UserRole, number> = {
      observer: 0,
      client: 1,
      guest: 2,
      member: 3,
      department_lead: 4,
      admin: 5,
    };

    for (const userRole of ALL_USER_ROLES) {
      for (const minRole of ALL_USER_ROLES) {
        const expected = hierarchyIndex[userRole] >= hierarchyIndex[minRole];
        it(`hasMinRole('${userRole}', '${minRole}') → ${expected}`, () => {
          expect(hasMinRole(userRole, minRole)).toBe(expected);
        });
      }
    }
  });
});

// ===========================================================================
// 2. getEffectiveRole
// ===========================================================================

describe('getEffectiveRole', () => {
  describe('with null membership (no board membership)', () => {
    it('admin global role stays admin', () => {
      expect(getEffectiveRole('admin', null)).toBe('admin');
    });

    it('non-admin global roles are capped to observer', () => {
      const nonAdminRoles: UserRole[] = ['observer', 'client', 'guest', 'member', 'department_lead'];
      for (const role of nonAdminRoles) {
        expect(getEffectiveRole(role, null)).toBe('observer');
      }
    });
  });

  describe('with board membership — returns the higher of the two', () => {
    it('global member + board guest → member (global is higher)', () => {
      const membership = makeBoardMember({ role: 'guest' });
      expect(getEffectiveRole('member', membership)).toBe('member');
    });

    it('global guest + board member → member (board is higher)', () => {
      const membership = makeBoardMember({ role: 'member' });
      expect(getEffectiveRole('guest', membership)).toBe('member');
    });

    it('global admin + board member → admin (global is higher)', () => {
      const membership = makeBoardMember({ role: 'member' });
      expect(getEffectiveRole('admin', membership)).toBe('admin');
    });

    it('global observer + board admin → admin (board is higher)', () => {
      const membership = makeBoardMember({ role: 'admin' });
      expect(getEffectiveRole('observer', membership)).toBe('admin');
    });

    it('same role in both → that role', () => {
      const membership = makeBoardMember({ role: 'department_lead' });
      expect(getEffectiveRole('department_lead', membership)).toBe('department_lead');
    });
  });

  describe('admin override — admin always remains admin', () => {
    for (const boardRole of ALL_USER_ROLES) {
      it(`admin global + board ${boardRole} → admin`, () => {
        const membership = makeBoardMember({ role: boardRole });
        expect(getEffectiveRole('admin', membership)).toBe('admin');
      });
    }

    it('admin global + null membership → admin', () => {
      expect(getEffectiveRole('admin', null)).toBe('admin');
    });
  });

  describe('every global role paired with every board role', () => {
    const hierarchyIndex: Record<UserRole, number> = {
      observer: 0,
      client: 1,
      guest: 2,
      member: 3,
      department_lead: 4,
      admin: 5,
    };

    for (const globalRole of ALL_USER_ROLES) {
      for (const boardRole of ALL_USER_ROLES) {
        it(`global=${globalRole}, board=${boardRole}`, () => {
          const membership = makeBoardMember({ role: boardRole });
          const result = getEffectiveRole(globalRole, membership);
          const expectedRole =
            hierarchyIndex[globalRole] >= hierarchyIndex[boardRole]
              ? globalRole
              : boardRole;
          expect(result).toBe(expectedRole);
        });
      }
    }
  });
});

// ===========================================================================
// 3. getUserBoardRole
// ===========================================================================

describe('getUserBoardRole', () => {
  it('finds the matching membership and returns effective role', () => {
    const members: BoardMember[] = [
      makeBoardMember({ user_id: 'user-a', role: 'guest' }),
      makeBoardMember({ user_id: 'user-b', role: 'department_lead' }),
    ];
    // user-b is a department_lead on the board, global role is member → department_lead wins
    expect(getUserBoardRole('member', members, 'user-b')).toBe('department_lead');
  });

  it('returns observer when user has no membership and is not admin', () => {
    const members: BoardMember[] = [
      makeBoardMember({ user_id: 'user-a', role: 'member' }),
    ];
    expect(getUserBoardRole('member', members, 'user-z')).toBe('observer');
  });

  it('returns admin when user has no membership but global role is admin', () => {
    const members: BoardMember[] = [
      makeBoardMember({ user_id: 'user-a', role: 'member' }),
    ];
    expect(getUserBoardRole('admin', members, 'user-z')).toBe('admin');
  });

  it('handles empty board members array', () => {
    expect(getUserBoardRole('guest', [], 'user-1')).toBe('observer');
  });

  it('picks first matching user_id', () => {
    const members: BoardMember[] = [
      makeBoardMember({ user_id: 'user-a', role: 'guest' }),
      makeBoardMember({ id: 'bm-2', user_id: 'user-a', role: 'admin' }),
    ];
    // Array.find returns the first match
    expect(getUserBoardRole('observer', members, 'user-a')).toBe('guest');
  });

  it('returns the higher of global and board role when user is found', () => {
    const members: BoardMember[] = [
      makeBoardMember({ user_id: 'user-a', role: 'guest' }),
    ];
    // global=department_lead > board=guest → department_lead
    expect(getUserBoardRole('department_lead', members, 'user-a')).toBe('department_lead');
  });
});

// ===========================================================================
// 4. canViewBoard — observer and above (all roles)
// ===========================================================================

describe('canViewBoard', () => {
  const expected: Record<UserRole, boolean> = {
    observer: true,
    client: true,
    guest: true,
    member: true,
    department_lead: true,
    admin: true,
  };

  for (const role of ALL_USER_ROLES) {
    it(`${role} → ${expected[role]}`, () => {
      expect(canViewBoard(role)).toBe(expected[role]);
    });
  }
});

// ===========================================================================
// 5. canEditBoard — department_lead and admin only
// ===========================================================================

describe('canEditBoard', () => {
  const expected: Record<UserRole, boolean> = {
    observer: false,
    client: false,
    guest: false,
    member: false,
    department_lead: true,
    admin: true,
  };

  for (const role of ALL_USER_ROLES) {
    it(`${role} → ${expected[role]}`, () => {
      expect(canEditBoard(role)).toBe(expected[role]);
    });
  }
});

// ===========================================================================
// 6. canCreateCard — member, department_lead, admin
// ===========================================================================

describe('canCreateCard', () => {
  const expected: Record<UserRole, boolean> = {
    observer: false,
    client: false,
    guest: false,
    member: true,
    department_lead: true,
    admin: true,
  };

  for (const role of ALL_USER_ROLES) {
    it(`${role} → ${expected[role]}`, () => {
      expect(canCreateCard(role)).toBe(expected[role]);
    });
  }
});

// ===========================================================================
// 7. canEditCard — member, department_lead, admin
// ===========================================================================

describe('canEditCard', () => {
  const expected: Record<UserRole, boolean> = {
    observer: false,
    client: false,
    guest: false,
    member: true,
    department_lead: true,
    admin: true,
  };

  for (const role of ALL_USER_ROLES) {
    it(`${role} → ${expected[role]}`, () => {
      expect(canEditCard(role)).toBe(expected[role]);
    });
  }
});

// ===========================================================================
// 8. canMoveCard — guest and above
// ===========================================================================

describe('canMoveCard', () => {
  const expected: Record<UserRole, boolean> = {
    observer: false,
    client: false,
    guest: true,
    member: true,
    department_lead: true,
    admin: true,
  };

  for (const role of ALL_USER_ROLES) {
    it(`${role} → ${expected[role]}`, () => {
      expect(canMoveCard(role)).toBe(expected[role]);
    });
  }
});

// ===========================================================================
// 9. canDeleteCard — department_lead and admin only
// ===========================================================================

describe('canDeleteCard', () => {
  const expected: Record<UserRole, boolean> = {
    observer: false,
    client: false,
    guest: false,
    member: false,
    department_lead: true,
    admin: true,
  };

  for (const role of ALL_USER_ROLES) {
    it(`${role} → ${expected[role]}`, () => {
      expect(canDeleteCard(role)).toBe(expected[role]);
    });
  }
});

// ===========================================================================
// 10. canManageMembers — department_lead and admin only
// ===========================================================================

describe('canManageMembers', () => {
  const expected: Record<UserRole, boolean> = {
    observer: false,
    client: false,
    guest: false,
    member: false,
    department_lead: true,
    admin: true,
  };

  for (const role of ALL_USER_ROLES) {
    it(`${role} → ${expected[role]}`, () => {
      expect(canManageMembers(role)).toBe(expected[role]);
    });
  }
});

// ===========================================================================
// 11. isAdmin — only admin
// ===========================================================================

describe('isAdmin', () => {
  const expected: Record<UserRole, boolean> = {
    observer: false,
    client: false,
    guest: false,
    member: false,
    department_lead: false,
    admin: true,
  };

  for (const role of ALL_USER_ROLES) {
    it(`${role} → ${expected[role]}`, () => {
      expect(isAdmin(role)).toBe(expected[role]);
    });
  }
});

// ===========================================================================
// 12. canMoveCardBetweenColumns
// ===========================================================================

describe('canMoveCardBetweenColumns', () => {
  const fromList = 'list-a';
  const toList = 'list-b';

  describe('no rules defined — allowed for anyone who can move cards', () => {
    for (const role of ALL_USER_ROLES) {
      const canMove = ['guest', 'member', 'department_lead', 'admin'].includes(role);
      it(`${role} with no rules → ${canMove}`, () => {
        expect(canMoveCardBetweenColumns(role, fromList, toList, [])).toBe(canMove);
      });
    }
  });

  describe('with a matching rule — respects allowed_roles', () => {
    const rules: ColumnMoveRule[] = [
      makeMoveRule({
        from_list_id: fromList,
        to_list_id: toList,
        allowed_roles: ['member', 'department_lead'],
      }),
    ];

    it('member is in allowed_roles → true', () => {
      expect(canMoveCardBetweenColumns('member', fromList, toList, rules)).toBe(true);
    });

    it('department_lead is in allowed_roles → true', () => {
      expect(canMoveCardBetweenColumns('department_lead', fromList, toList, rules)).toBe(true);
    });

    it('guest can move cards but is not in allowed_roles → false', () => {
      expect(canMoveCardBetweenColumns('guest', fromList, toList, rules)).toBe(false);
    });

    it('observer cannot move cards at all → false', () => {
      expect(canMoveCardBetweenColumns('observer', fromList, toList, rules)).toBe(false);
    });

    it('client cannot move cards at all → false', () => {
      expect(canMoveCardBetweenColumns('client', fromList, toList, rules)).toBe(false);
    });
  });

  describe('admin bypasses all column move rules', () => {
    const restrictiveRules: ColumnMoveRule[] = [
      makeMoveRule({
        from_list_id: fromList,
        to_list_id: toList,
        allowed_roles: [], // no roles allowed
      }),
    ];

    it('admin bypasses even when allowed_roles is empty', () => {
      expect(canMoveCardBetweenColumns('admin', fromList, toList, restrictiveRules)).toBe(true);
    });

    it('admin bypasses when allowed_roles excludes admin', () => {
      const rules: ColumnMoveRule[] = [
        makeMoveRule({
          from_list_id: fromList,
          to_list_id: toList,
          allowed_roles: ['member'],
        }),
      ];
      expect(canMoveCardBetweenColumns('admin', fromList, toList, rules)).toBe(true);
    });
  });

  describe('rule does not match the transition — falls through to default', () => {
    const rules: ColumnMoveRule[] = [
      makeMoveRule({
        from_list_id: 'list-x',
        to_list_id: 'list-y',
        allowed_roles: ['admin'],
      }),
    ];

    it('guest can move when rule is for a different transition', () => {
      expect(canMoveCardBetweenColumns('guest', fromList, toList, rules)).toBe(true);
    });

    it('member can move when rule is for a different transition', () => {
      expect(canMoveCardBetweenColumns('member', fromList, toList, rules)).toBe(true);
    });
  });

  describe('multiple rules — only the matching one applies', () => {
    const rules: ColumnMoveRule[] = [
      makeMoveRule({
        id: 'rule-1',
        from_list_id: fromList,
        to_list_id: toList,
        allowed_roles: ['department_lead'],
      }),
      makeMoveRule({
        id: 'rule-2',
        from_list_id: toList,
        to_list_id: fromList,
        allowed_roles: ['member', 'guest'],
      }),
    ];

    it('member blocked on forward transition (list-a → list-b)', () => {
      expect(canMoveCardBetweenColumns('member', fromList, toList, rules)).toBe(false);
    });

    it('department_lead allowed on forward transition', () => {
      expect(canMoveCardBetweenColumns('department_lead', fromList, toList, rules)).toBe(true);
    });

    it('member allowed on reverse transition (list-b → list-a)', () => {
      expect(canMoveCardBetweenColumns('member', toList, fromList, rules)).toBe(true);
    });

    it('department_lead blocked on reverse transition', () => {
      expect(canMoveCardBetweenColumns('department_lead', toList, fromList, rules)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('same from and to list with no matching rule → allowed', () => {
      expect(canMoveCardBetweenColumns('guest', fromList, fromList, [])).toBe(true);
    });

    it('same from and to list with a matching rule that blocks → blocked', () => {
      const rules: ColumnMoveRule[] = [
        makeMoveRule({
          from_list_id: fromList,
          to_list_id: fromList,
          allowed_roles: ['admin'],
        }),
      ];
      expect(canMoveCardBetweenColumns('guest', fromList, fromList, rules)).toBe(false);
    });
  });
});

// ===========================================================================
// 13. canComment — guest and above
// ===========================================================================

describe('canComment', () => {
  const expected: Record<UserRole, boolean> = {
    observer: false,
    client: false,
    guest: true,
    member: true,
    department_lead: true,
    admin: true,
  };

  for (const role of ALL_USER_ROLES) {
    it(`${role} → ${expected[role]}`, () => {
      expect(canComment(role)).toBe(expected[role]);
    });
  }
});

// ===========================================================================
// 14. canUploadAttachments — member and above
// ===========================================================================

describe('canUploadAttachments', () => {
  const expected: Record<UserRole, boolean> = {
    observer: false,
    client: false,
    guest: false,
    member: true,
    department_lead: true,
    admin: true,
  };

  for (const role of ALL_USER_ROLES) {
    it(`${role} → ${expected[role]}`, () => {
      expect(canUploadAttachments(role)).toBe(expected[role]);
    });
  }
});

// ===========================================================================
// 15. getRoleLabel — all roles return non-empty labels
// ===========================================================================

describe('getRoleLabel', () => {
  const expectedLabels: Record<UserRole, string> = {
    admin: 'Admin',
    department_lead: 'Department Lead',
    member: 'Member',
    guest: 'Guest',
    client: 'Client',
    observer: 'Observer',
  };

  for (const role of ALL_USER_ROLES) {
    it(`${role} → "${expectedLabels[role]}"`, () => {
      expect(getRoleLabel(role)).toBe(expectedLabels[role]);
    });
  }

  it('returns a non-empty string for every role', () => {
    for (const role of ALL_USER_ROLES) {
      expect(getRoleLabel(role)).toBeTruthy();
      expect(typeof getRoleLabel(role)).toBe('string');
    }
  });
});

// ===========================================================================
// 16. getRoleDescription — all roles return non-empty descriptions
// ===========================================================================

describe('getRoleDescription', () => {
  const expectedDescriptions: Record<UserRole, string> = {
    admin: 'Full access to everything. Can manage users, boards, and settings.',
    department_lead: 'Can manage board settings, members, and delete cards.',
    member: 'Can create/edit cards, upload attachments, and manage checklists.',
    guest: 'Can view boards, move cards, and leave comments.',
    client: 'Client access. Can view assigned boards and leave comments.',
    observer: 'Read-only access. Can view boards but cannot make changes.',
  };

  for (const role of ALL_USER_ROLES) {
    it(`${role} has correct description`, () => {
      expect(getRoleDescription(role)).toBe(expectedDescriptions[role]);
    });
  }

  it('returns a non-empty string for every role', () => {
    for (const role of ALL_USER_ROLES) {
      expect(getRoleDescription(role)).toBeTruthy();
      expect(typeof getRoleDescription(role)).toBe('string');
    }
  });

  it('descriptions are distinct for each role', () => {
    const descriptions = ALL_USER_ROLES.map(getRoleDescription);
    const unique = new Set(descriptions);
    expect(unique.size).toBe(ALL_USER_ROLES.length);
  });
});

// ===========================================================================
// 17. ALL_ROLES
// ===========================================================================

describe('ALL_ROLES', () => {
  it('has exactly 6 entries', () => {
    expect(ALL_ROLES).toHaveLength(6);
  });

  it('contains all expected roles', () => {
    expect(ALL_ROLES).toContain('admin');
    expect(ALL_ROLES).toContain('department_lead');
    expect(ALL_ROLES).toContain('member');
    expect(ALL_ROLES).toContain('guest');
    expect(ALL_ROLES).toContain('client');
    expect(ALL_ROLES).toContain('observer');
  });

  it('has no duplicate entries', () => {
    const unique = new Set(ALL_ROLES);
    expect(unique.size).toBe(ALL_ROLES.length);
  });

  it('is an array', () => {
    expect(Array.isArray(ALL_ROLES)).toBe(true);
  });
});
