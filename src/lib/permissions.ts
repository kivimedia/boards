import { UserRole, BoardMember, ColumnMoveRule, BusinessRole, BoardType } from './types';

// Role hierarchy: higher index = more permissions
const ROLE_HIERARCHY: UserRole[] = ['observer', 'client', 'guest', 'member', 'department_lead', 'admin'];

/**
 * Check if a role has at least the given minimum role level.
 */
export function hasMinRole(userRole: UserRole, minRole: UserRole): boolean {
  return ROLE_HIERARCHY.indexOf(userRole) >= ROLE_HIERARCHY.indexOf(minRole);
}

/**
 * Get the effective role for a user on a board.
 * Considers global role (from profiles) and board-specific role (from board_members).
 * Returns the higher of the two.
 */
export function getEffectiveRole(
  globalRole: UserRole,
  boardMembership: BoardMember | null
): UserRole {
  if (!boardMembership) {
    // If not a board member, use global role but cap at 'guest' for non-admins
    return globalRole === 'admin' ? 'admin' : 'observer';
  }

  const globalIdx = ROLE_HIERARCHY.indexOf(globalRole);
  const boardIdx = ROLE_HIERARCHY.indexOf(boardMembership.role);

  return globalIdx >= boardIdx ? globalRole : boardMembership.role;
}

/**
 * Get the user's role for a specific board.
 */
export function getUserBoardRole(
  globalRole: UserRole,
  boardMembers: BoardMember[],
  userId: string
): UserRole {
  const membership = boardMembers.find((m) => m.user_id === userId) || null;
  return getEffectiveRole(globalRole, membership);
}

/**
 * Check if a user can view a board.
 */
export function canViewBoard(role: UserRole): boolean {
  return hasMinRole(role, 'observer');
}

/**
 * Check if a user can edit board settings (name, labels, custom fields, etc.)
 */
export function canEditBoard(role: UserRole): boolean {
  return hasMinRole(role, 'department_lead');
}

/**
 * Check if a user can create cards on a board.
 */
export function canCreateCard(role: UserRole): boolean {
  return hasMinRole(role, 'member');
}

/**
 * Check if a user can edit a card (title, description, fields, etc.)
 */
export function canEditCard(role: UserRole): boolean {
  return hasMinRole(role, 'member');
}

/**
 * Check if a user can move cards on a board.
 */
export function canMoveCard(role: UserRole): boolean {
  return hasMinRole(role, 'guest');
}

/**
 * Check if a user can delete cards.
 */
export function canDeleteCard(role: UserRole): boolean {
  return hasMinRole(role, 'department_lead');
}

/**
 * Check if a user can manage board members (add/remove/change roles).
 */
export function canManageMembers(role: UserRole): boolean {
  return hasMinRole(role, 'department_lead');
}

/**
 * Check if a user is an admin.
 */
export function isAdmin(role: UserRole): boolean {
  return role === 'admin';
}

/**
 * Check if a card move between columns is allowed for the user's role.
 */
export function canMoveCardBetweenColumns(
  role: UserRole,
  fromListId: string,
  toListId: string,
  moveRules: ColumnMoveRule[]
): boolean {
  if (!canMoveCard(role)) return false;
  if (isAdmin(role)) return true;

  const rule = moveRules.find(
    (r) => r.from_list_id === fromListId && r.to_list_id === toListId
  );

  if (!rule) return true;
  return rule.allowed_roles.includes(role);
}

/**
 * Check if user can comment on cards.
 */
export function canComment(role: UserRole): boolean {
  return hasMinRole(role, 'guest');
}

/**
 * Check if user can upload attachments.
 */
export function canUploadAttachments(role: UserRole): boolean {
  return hasMinRole(role, 'member');
}

/**
 * Get human-readable label for a role.
 */
export function getRoleLabel(role: UserRole): string {
  const labels: Record<UserRole, string> = {
    admin: 'Admin',
    department_lead: 'Department Lead',
    member: 'Member',
    guest: 'Guest',
    client: 'Client',
    observer: 'Observer',
  };
  return labels[role];
}

/**
 * Get role description.
 */
export function getRoleDescription(role: UserRole): string {
  const descriptions: Record<UserRole, string> = {
    admin: 'Full access to everything. Can manage users, boards, and settings.',
    department_lead: 'Can manage board settings, members, and delete cards.',
    member: 'Can create/edit cards, upload attachments, and manage checklists.',
    guest: 'Can view boards, move cards, and leave comments.',
    client: 'Client access. Can view assigned boards and leave comments.',
    observer: 'Read-only access. Can view boards but cannot make changes.',
  };
  return descriptions[role];
}

/**
 * All available roles for selection.
 */
export const ALL_ROLES: UserRole[] = ['admin', 'department_lead', 'member', 'guest', 'client', 'observer'];

// ============================================================================
// Business Role Helpers (Carolina Balloons HQ)
// ============================================================================

export const BUSINESS_ROLES: BusinessRole[] = ['owner', 'va'];

export function getBusinessRoleLabel(role: BusinessRole): string {
  const labels: Record<BusinessRole, string> = {
    owner: 'Owner',
    va: 'Virtual Assistant',
  };
  return labels[role];
}

/** Board access by business role. Owner can access all boards. */
const BOARD_ROLE_ACCESS: Record<BoardType, BusinessRole[]> = {
  boutique_decor: ['owner', 'va'],
  marquee_letters: ['owner', 'va'],
  private_clients: ['owner', 'va'],
  owner_dashboard: ['owner'],
  va_workspace: ['owner', 'va'],
  general_tasks: ['owner', 'va'],
};

/**
 * Check if a user with the given business role can access a board of the given type.
 * Owner can access everything. VA cannot access owner_dashboard.
 */
export function canAccessBoardByRole(
  businessRole: BusinessRole | null,
  boardType: BoardType | string
): boolean {
  if (!businessRole) return false;
  if (businessRole === 'owner') return true;
  const allowed = BOARD_ROLE_ACCESS[boardType as BoardType];
  if (!allowed) return true;
  return allowed.includes(businessRole);
}

/**
 * Check if a user is the business owner.
 */
export function isBusinessOwner(businessRole: BusinessRole | null): boolean {
  return businessRole === 'owner';
}

/**
 * Owner-only permission checks for business features.
 */
export function canEditPricing(businessRole: BusinessRole | null): boolean {
  return businessRole === 'owner';
}

export function canEditProducts(businessRole: BusinessRole | null): boolean {
  return businessRole === 'owner';
}

export function canApproveProposals(businessRole: BusinessRole | null): boolean {
  return businessRole === 'owner';
}

export function canManageMirrorRules(businessRole: BusinessRole | null): boolean {
  return businessRole === 'owner';
}

export function canManageGoogleIntegration(businessRole: BusinessRole | null): boolean {
  return businessRole === 'owner';
}

// Backward compatibility aliases
/** @deprecated Use BusinessRole instead */
export type AgencyRole = BusinessRole;
/** @deprecated Use BUSINESS_ROLES instead */
export const AGENCY_ROLES = BUSINESS_ROLES;
/** @deprecated Use getBusinessRoleLabel instead */
export const getAgencyRoleLabel = getBusinessRoleLabel;
/** @deprecated Use isBusinessOwner instead */
export const isAgencyOwner = isBusinessOwner;
