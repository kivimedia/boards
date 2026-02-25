import { UserRole, BoardMember, ColumnMoveRule, AgencyRole, BoardType } from './types';

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
 * Everyone except 'observer' without board membership can view boards they're members of.
 * Admins can view all boards.
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
 * Observers cannot move cards.
 * Clients can only move cards on their own client board.
 */
export function canMoveCard(role: UserRole, isClientBoard?: boolean): boolean {
  if (role === 'client' && isClientBoard) return true;
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
 * If no rules are defined for this transition, it's allowed for anyone who can move cards.
 */
export function canMoveCardBetweenColumns(
  role: UserRole,
  fromListId: string,
  toListId: string,
  moveRules: ColumnMoveRule[]
): boolean {
  // Must at least have basic move permission
  if (!canMoveCard(role)) return false;

  // Admins bypass all rules
  if (isAdmin(role)) return true;

  // Find a rule for this specific transition
  const rule = moveRules.find(
    (r) => r.from_list_id === fromListId && r.to_list_id === toListId
  );

  // No rule defined = allowed for anyone who can move
  if (!rule) return true;

  // Check if user's role is in the allowed list
  return rule.allowed_roles.includes(role);
}

/**
 * Check if user can comment on cards.
 * Clients can comment (their comments are auto-set to external).
 */
export function canComment(role: UserRole): boolean {
  if (role === 'client') return true;
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
// Agency Role Helpers
// ============================================================================

export const AGENCY_ROLES: AgencyRole[] = [
  'agency_owner',
  'dev',
  'designer',
  'account_manager',
  'executive_assistant',
  'video_editor',
];

export function getAgencyRoleLabel(role: AgencyRole): string {
  const labels: Record<AgencyRole, string> = {
    agency_owner: 'Agency Owner',
    dev: 'Developer',
    designer: 'Designer',
    account_manager: 'Account Manager',
    executive_assistant: 'Executive Assistant',
    video_editor: 'Video Editor',
  };
  return labels[role];
}

/** Default board-role access map (used client-side when we can't query the DB table) */
const DEFAULT_BOARD_ROLE_ACCESS: Record<string, AgencyRole[]> = {
  dev: ['agency_owner', 'dev'],
  training: ['agency_owner', 'dev', 'designer', 'account_manager', 'executive_assistant', 'video_editor'],
  account_manager: ['agency_owner', 'account_manager', 'executive_assistant'],
  graphic_designer: ['agency_owner', 'designer'],
  executive_assistant: ['agency_owner', 'executive_assistant'],
  video_editor: ['agency_owner', 'video_editor'],
  client_strategy_map: ['agency_owner', 'account_manager', 'executive_assistant'],
  copy: ['agency_owner', 'designer', 'account_manager'],
  client_board: ['agency_owner', 'account_manager', 'executive_assistant'],
};

/**
 * Check if a user with the given agency role can access a board of the given type.
 * Agency owners can access everything.
 */
export function canAccessBoardByRole(
  agencyRole: AgencyRole | null,
  boardType: BoardType | string
): boolean {
  if (!agencyRole) return false;
  if (agencyRole === 'agency_owner') return true;
  const allowed = DEFAULT_BOARD_ROLE_ACCESS[boardType];
  if (!allowed) return true; // Unknown board type — allow by default
  return allowed.includes(agencyRole);
}

/**
 * Check if a user is an agency owner.
 */
export function isAgencyOwner(agencyRole: AgencyRole | null): boolean {
  return agencyRole === 'agency_owner';
}
