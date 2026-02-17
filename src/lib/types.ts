export type BoardType =
  | 'dev'
  | 'training'
  | 'account_manager'
  | 'graphic_designer'
  | 'executive_assistant'
  | 'video_editor'
  | 'copy'
  | 'client_strategy_map';

export type AutomationTriggerType =
  | 'card_moved'
  | 'card_created'
  | 'card_updated'
  | 'due_date_passed'
  | 'checklist_completed'
  | 'field_changed'
  | 'label_added'
  | 'label_removed';

export type AutomationActionType =
  | 'move_card'
  | 'set_field'
  | 'increment_field'
  | 'add_label'
  | 'remove_label'
  | 'create_card'
  | 'send_notification'
  | 'assign_user'
  | 'set_priority'
  | 'create_activity_log';

export interface AutomationRule {
  id: string;
  board_id: string;
  name: string;
  is_active: boolean;
  trigger_type: AutomationTriggerType;
  trigger_config: Record<string, unknown>;
  action_type: AutomationActionType;
  action_config: Record<string, unknown>;
  execution_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationLog {
  id: string;
  rule_id: string;
  board_id: string;
  card_id: string | null;
  trigger_data: Record<string, unknown>;
  action_result: Record<string, unknown>;
  status: string;
  error_message: string | null;
  executed_at: string;
}

export interface BoardTemplate {
  id: string;
  board_type: BoardType;
  default_lists: string[];
  default_labels: { name: string; color: string }[];
  default_custom_fields: {
    name: string;
    field_type: CustomFieldType;
    options?: string[];
    is_required?: boolean;
  }[];
  automation_rules: {
    name: string;
    trigger_type: AutomationTriggerType;
    trigger_config: Record<string, unknown>;
    action_type: AutomationActionType;
    action_config: Record<string, unknown>;
  }[];
}

export type CardPriority = 'urgent' | 'high' | 'medium' | 'low' | 'none';

export type UserRole = 'admin' | 'department_lead' | 'member' | 'guest' | 'client' | 'observer';

export type AgencyRole = 'agency_owner' | 'dev' | 'designer' | 'account_manager' | 'executive_assistant' | 'video_editor';

export type AccountStatus = 'pending' | 'active' | 'suspended';

export interface BoardMember {
  id: string;
  board_id: string;
  user_id: string;
  role: UserRole;
  added_by: string | null;
  created_at: string;
  profile?: Profile;
}

export interface ColumnMoveRule {
  id: string;
  board_id: string;
  from_list_id: string;
  to_list_id: string;
  allowed_roles: UserRole[];
  created_at: string;
}

export type DependencyType = 'blocked_by' | 'blocking' | 'related' | 'spawned_from';

export type CustomFieldType = 'text' | 'number' | 'dropdown' | 'date' | 'checkbox' | 'url';

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  role: string;
  agency_role?: AgencyRole | null;
  account_status?: AccountStatus;
  user_role?: UserRole;
  email?: string;
  created_at?: string;
}

export interface Board {
  id: string;
  name: string;
  type: BoardType;
  created_by: string;
  created_at: string;
  background_color?: string | null;
  background_image_url?: string | null;
  is_archived: boolean;
  is_starred: boolean;
}

export interface BoardFilter {
  labels: string[];
  members: string[];
  priority: string[];
  dueDate: 'overdue' | 'due_soon' | 'no_date' | null;
}

export interface List {
  id: string;
  board_id: string;
  name: string;
  position: number;
  created_at: string;
}

export type CardSize = 'small' | 'medium' | 'large';

export interface Card {
  id: string;
  title: string;
  description: string;
  due_date: string | null;
  start_date: string | null;
  priority: CardPriority;
  cover_image_url: string | null;
  size: CardSize;
  client_id: string | null;
  is_client_visible: boolean;
  client_status: ClientCardStatus | null;
  client_ticket_type: ClientTicketType | null;
  approval_status: ApprovalStatus | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CardPlacement {
  id: string;
  card_id: string;
  list_id: string;
  position: number;
  is_mirror: boolean;
  created_at: string;
}

export interface Label {
  id: string;
  name: string;
  color: string;
  board_id: string;
}

export interface Comment {
  id: string;
  card_id: string;
  user_id: string;
  content: string;
  parent_comment_id: string | null;
  created_at: string;
  profile?: Profile;
  replies?: Comment[];
}

// P1.1: Enhanced Card Model

export interface Checklist {
  id: string;
  card_id: string;
  title: string;
  position: number;
  created_at: string;
  items?: ChecklistItem[];
}

export interface ChecklistItem {
  id: string;
  checklist_id: string;
  content: string;
  is_completed: boolean;
  position: number;
  completed_by: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface Attachment {
  id: string;
  card_id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
  uploaded_by: string;
  version: number;
  parent_attachment_id: string | null;
  created_at: string;
}

export interface ActivityLogEntry {
  id: string;
  card_id: string | null;
  board_id: string | null;
  user_id: string;
  event_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
  profile?: Profile;
}

export interface CardDependency {
  id: string;
  source_card_id: string;
  target_card_id: string;
  dependency_type: DependencyType;
  created_by: string;
  created_at: string;
  target_card?: Card;
  source_card?: Card;
}

export interface CustomFieldDefinition {
  id: string;
  board_id: string;
  name: string;
  field_type: CustomFieldType;
  options: string[];
  is_required: boolean;
  position: number;
  created_at: string;
}

export interface CustomFieldValue {
  id: string;
  card_id: string;
  field_definition_id: string;
  value: unknown;
  created_at: string;
  updated_at: string;
  definition?: CustomFieldDefinition;
}

export interface Mention {
  id: string;
  comment_id: string;
  user_id: string;
  created_at: string;
}

// P1.4: Briefing System

export interface BriefingTemplateField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'date' | 'dropdown' | 'url' | 'url_list' | 'checkbox';
  required: boolean;
  options?: string[];
}

export interface BriefingTemplate {
  id: string;
  board_type: BoardType;
  deliverable_type: string;
  name: string;
  fields: BriefingTemplateField[];
  created_at: string;
  updated_at: string;
}

export interface CardBrief {
  id: string;
  card_id: string;
  template_id: string | null;
  data: Record<string, unknown>;
  completeness_score: number;
  is_complete: boolean;
  created_at: string;
  updated_at: string;
  template?: BriefingTemplate;
}

// P1.5: Client Strategy Map

export interface ClientContact {
  name: string;
  email: string;
  phone?: string;
  role?: string;
}

export interface Client {
  id: string;
  name: string;
  company: string | null;
  contacts: ClientContact[];
  client_tag: string | null;
  contract_type: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CredentialEntry {
  id: string;
  client_id: string;
  platform: string;
  username_encrypted: string | null;
  password_encrypted: string | null;
  notes_encrypted: string | null;
  category: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CredentialDecrypted {
  id: string;
  client_id: string;
  platform: string;
  username: string | null;
  password: string | null;
  notes: string | null;
  category: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CredentialAuditLogEntry {
  id: string;
  credential_id: string;
  user_id: string;
  action: 'viewed' | 'created' | 'updated' | 'deleted';
  ip_address: string | null;
  created_at: string;
}

export type TrainingStatus = 'pending' | 'in_progress' | 'submitted' | 'reviewed' | 'completed';

export interface TrainingAssignment {
  id: string;
  client_id: string;
  title: string;
  description: string | null;
  video_url: string | null;
  prompt: string | null;
  status: TrainingStatus;
  submission: string | null;
  feedback: string | null;
  assigned_to: string | null;
  assigned_by: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type DoorStatus = 'locked' | 'in_progress' | 'completed';

export interface Door {
  id: string;
  client_id: string;
  door_number: number;
  title: string;
  description: string | null;
  status: DoorStatus;
  created_at: string;
  updated_at: string;
  keys?: DoorKey[];
}

export interface DoorKey {
  id: string;
  door_id: string;
  key_number: number;
  title: string;
  description: string | null;
  is_completed: boolean;
  completed_by: string | null;
  completed_at: string | null;
  created_at: string;
}

export type MapSectionType = 'visual_brief' | 'outreach_planner' | 'resources' | 'whiteboard' | 'notes';

export interface MapSection {
  id: string;
  client_id: string;
  section_type: MapSectionType;
  title: string;
  content: Record<string, unknown>;
  position: number;
  is_client_visible: boolean;
  created_at: string;
  updated_at: string;
}

// P1.6: Notifications & Cross-Board Workflows

export type NotificationType =
  | 'card_assigned'
  | 'card_mentioned'
  | 'card_moved'
  | 'card_due_soon'
  | 'card_overdue'
  | 'comment_added'
  | 'handoff_created'
  | 'brief_incomplete'
  | 'approval_needed'
  | 'onboarding_started'
  | 'automation_triggered'
  | 'card_watched';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  is_read: boolean;
  card_id: string | null;
  board_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface NotificationPreferences {
  id: string;
  user_id: string;
  email_enabled: boolean;
  push_enabled: boolean;
  event_settings: Record<string, boolean>;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface HandoffRule {
  id: string;
  name: string;
  source_board_id: string;
  source_column: string;
  target_board_id: string;
  target_column: string;
  inherit_fields: string[];
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface OnboardingTemplateItem {
  board_type: BoardType;
  title: string;
  description: string;
  list_name: string;
  priority: string;
  inherit_client: boolean;
  depends_on: number[];
}

export interface OnboardingTemplate {
  id: string;
  name: string;
  description: string | null;
  template_data: OnboardingTemplateItem[];
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// P1.7: Trello Migration

export type MigrationStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type MigrationEntityType =
  | 'board'
  | 'list'
  | 'card'
  | 'label'
  | 'comment'
  | 'attachment'
  | 'member'
  | 'checklist'
  | 'checklist_item';

export interface MigrationProgress {
  current: number;
  total: number;
  phase: string;
  detail?: string;
}

export interface MigrationReport {
  boards_created: number;
  lists_created: number;
  cards_created: number;
  comments_created: number;
  attachments_created: number;
  labels_created: number;
  checklists_created: number;
  errors: string[];
}

export interface MigrationJobConfig {
  trello_api_key: string;
  trello_token: string;
  board_ids: string[];
  board_type_mapping: Record<string, BoardType>;
  user_mapping: Record<string, string>;
  /** Per-board list filter: boardId -> listIds to import. If absent/empty, all lists imported. */
  list_filter?: Record<string, string[]>;
  /** Per-board merge target: trelloBoardId -> existing Agency Board board ID. */
  board_merge_targets?: Record<string, string>;
}

export interface MigrationJob {
  id: string;
  type: string;
  status: MigrationStatus;
  config: MigrationJobConfig;
  progress: MigrationProgress;
  report: MigrationReport;
  error_message: string | null;
  started_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MigrationEntityMap {
  id: string;
  job_id: string;
  source_type: MigrationEntityType;
  source_id: string;
  target_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ============================================================================
// Podcast Guest Acquisition (PGA)
// ============================================================================

export type PGACandidateStatus = 'scouted' | 'approved' | 'outreach_active' | 'replied' | 'scheduled' | 'interviewed' | 'rejected';
export type PGAConfidence = 'high' | 'medium' | 'low';
export type PGAAgentType = 'scout' | 'outreach';
export type PGARunStatus = 'running' | 'completed' | 'failed' | 'awaiting_input';
export type PGASequenceStatus = 'draft' | 'active' | 'paused' | 'completed' | 'stopped';
export type PGAService = 'instantly' | 'hunter' | 'snov' | 'calendly' | 'scout_config' | 'trello';

export interface PGACandidate {
  id: string;
  name: string;
  one_liner: string | null;
  email: string | null;
  email_verified: boolean;
  platform_presence: Record<string, string>;
  evidence_of_paid_work: Array<{ project: string; description: string; url?: string }>;
  estimated_reach: Record<string, number>;
  tools_used: string[];
  contact_method: string;
  scout_confidence: PGAConfidence | null;
  source: Record<string, string>;
  status: PGACandidateStatus;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PGAEmailSequence {
  id: string;
  candidate_id: string;
  instantly_campaign_id: string | null;
  status: PGASequenceStatus;
  emails: Array<{
    step: number;
    day: number;
    subject: string;
    body: string;
    sent_at: string | null;
    opened_at: string | null;
    clicked_at: string | null;
  }>;
  created_at: string;
  updated_at: string;
}

export interface PGAAgentRun {
  id: string;
  agent_type: PGAAgentType;
  status: PGARunStatus;
  current_step: number;
  started_at: string;
  ended_at: string | null;
  started_by: string | null;
  candidates_found: number;
  emails_created: number;
  tokens_used: number;
  output_json: Record<string, unknown>;
  error_message: string | null;
}

// ============================================================================
// Scout Pipeline Types (LinkedIn-first 4-step wizard)
// ============================================================================

/** Step 1 output: LinkedIn profile found via web search */
export interface LinkedInSuggestion {
  index: number;
  name: string;
  title: string;
  location: string;
  linkedin_url: string;
  summary: string;
  source_query: string;
}

/** Step 2 output: Snov.io enrichment + email discovery result */
export interface EnrichedProfile {
  index: number;
  name: string;
  title: string;
  location: string;
  company: string;
  domain: string;
  industry: string;
  linkedin_url: string;
  email: string | null;
  email_source: 'hunter' | 'snov' | 'none';
  email_confidence: number;
  email_verified: boolean;
}

/** Step 3 output: Full candidate profile after AI deep research */
export interface FullCandidateProfile {
  index: number;
  name: string;
  one_liner: string;
  email: string | null;
  email_verified: boolean;
  location: string;
  platform_presence: Record<string, string>;
  evidence_of_paid_work: Array<{ project: string; description: string; url?: string }>;
  estimated_reach: Record<string, number>;
  tools_used: string[];
  contact_method: string;
  scout_confidence: PGAConfidence;
  source: Record<string, string>;
}

/** Saved scout agent configuration */
export interface ScoutConfig {
  default_query: string;
  default_location: string;
  custom_location: string;
  tool_focus: string;
  max_results: number;
}

export interface PGAIntegrationConfig {
  id: string;
  service: PGAService;
  api_key_encrypted: string | null;
  config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Trello API types (for migration)
export interface TrelloBoard {
  id: string;
  name: string;
  desc: string;
  closed: boolean;
}

export interface TrelloMember {
  id: string;
  fullName: string;
  username: string;
}

export interface TrelloList {
  id: string;
  name: string;
  pos: number;
  closed: boolean;
  idBoard: string;
}

export interface TrelloCard {
  id: string;
  name: string;
  desc: string;
  pos: number;
  due: string | null;
  closed: boolean;
  idList: string;
  idBoard: string;
  idLabels: string[];
  idMembers: string[];
  idChecklists: string[];
  idAttachmentCover: string | null;
}

export interface TrelloLabel {
  id: string;
  name: string;
  color: string;
  idBoard: string;
}

export interface TrelloComment {
  id: string;
  data: {
    text: string;
    card?: { id: string };
  };
  idMemberCreator: string;
  date: string;
}

export interface TrelloChecklist {
  id: string;
  name: string;
  pos: number;
  idCard: string;
  checkItems: TrelloCheckItem[];
}

export interface TrelloCheckItem {
  id: string;
  name: string;
  pos: number;
  state: 'complete' | 'incomplete';
}

export interface TrelloAttachment {
  id: string;
  name: string;
  fileName: string;
  url: string;
  bytes: number;
  mimeType: string;
  date: string;
  idMember: string;
}

// P1.8: Backup & Disaster Recovery

export type BackupType = 'full' | 'incremental';
export type BackupStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface BackupManifest {
  tables: Record<string, number>;
  storage_files: number;
  checksum: string;
  backup_version: string;
  created_at: string;
}

export interface Backup {
  id: string;
  type: BackupType;
  status: BackupStatus;
  storage_path: string | null;
  size_bytes: number;
  manifest: BackupManifest;
  error_message: string | null;
  started_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

// P2.0: AI Infrastructure

export type AIProvider = 'anthropic' | 'openai' | 'google' | 'browserless';

export type AIActivity =
  | 'design_review'
  | 'dev_qa'
  | 'chatbot_ticket'
  | 'chatbot_board'
  | 'chatbot_global'
  | 'client_brain'
  | 'nano_banana_edit'
  | 'nano_banana_generate'
  | 'email_draft'
  | 'video_generation'
  | 'brief_assist'
  | 'agent_execution'
  | 'agent_standalone_execution';

export type AIUsageStatus = 'success' | 'error' | 'budget_blocked' | 'rate_limited';

export type AIBudgetScope = 'global' | 'provider' | 'activity' | 'user' | 'board' | 'client';

export interface AIApiKey {
  id: string;
  provider: AIProvider;
  label: string;
  key_encrypted: string;
  is_active: boolean;
  last_used_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AIModelConfig {
  id: string;
  activity: AIActivity;
  provider: AIProvider;
  model_id: string;
  temperature: number;
  max_tokens: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AIUsageLogEntry {
  id: string;
  user_id: string | null;
  board_id: string | null;
  card_id: string | null;
  client_id: string | null;
  activity: AIActivity;
  provider: AIProvider;
  model_id: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_usd: number;
  latency_ms: number;
  status: AIUsageStatus;
  error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AIBudgetConfig {
  id: string;
  scope: AIBudgetScope;
  scope_id: string | null;
  monthly_cap_usd: number;
  alert_threshold_pct: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AIModelPricing {
  provider: AIProvider;
  model_id: string;
  input_cost_per_1k: number;
  output_cost_per_1k: number;
}

export interface AIBudgetStatus {
  scope: AIBudgetScope;
  scope_id: string | null;
  monthly_cap_usd: number;
  spent_usd: number;
  remaining_usd: number;
  usage_pct: number;
  alert_threshold_pct: number;
  is_over_budget: boolean;
  is_alert_triggered: boolean;
}

// P2.2: AI Dev QA

export type QAStatus = 'pending' | 'running' | 'passed' | 'failed' | 'error';
export type QAFindingSeverity = 'critical' | 'major' | 'minor' | 'info';

export interface QAChecklistItem {
  category: string;
  text: string;
}

export interface QAChecklistTemplate {
  id: string;
  name: string;
  description: string | null;
  items: QAChecklistItem[];
  is_default: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface QAScreenshot {
  viewport: string;
  width: number;
  height: number;
  storage_path: string;
}

export interface QAFinding {
  severity: QAFindingSeverity;
  category: string;
  description: string;
  location: string;
}

export interface QAChecklistResult {
  index: number;
  passed: boolean;
  notes: string;
}

export interface QAConsoleError {
  type: string;
  text: string;
  url: string;
  line: number;
}

export interface QAPerformanceMetrics {
  load_time_ms: number;
  first_paint_ms: number;
  dom_content_loaded_ms: number;
}

export interface QAFindingsCount {
  critical: number;
  major: number;
  minor: number;
  info: number;
}

export interface AIQAResult {
  id: string;
  card_id: string;
  url: string;
  screenshots: QAScreenshot[];
  results: {
    findings: QAFinding[];
    checklist_results: QAChecklistResult[];
    overall_score: number;
    summary: string;
  };
  console_errors: QAConsoleError[];
  performance_metrics: QAPerformanceMetrics;
  checklist_template_id: string | null;
  checklist_results: QAChecklistResult[];
  overall_score: number;
  overall_status: QAStatus;
  findings_count: QAFindingsCount;
  model_used: string | null;
  usage_log_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// P2.1: AI Design Review

export type AIReviewVerdict = 'pending' | 'approved' | 'revisions_needed' | 'overridden_approved' | 'overridden_rejected';
export type AIChangeVerdict = 'PASS' | 'FAIL' | 'PARTIAL';

export interface AIChangeRequest {
  index: number;
  text: string;
}

export interface AIChangeVerdictResult {
  index: number;
  verdict: AIChangeVerdict;
  reasoning: string;
  suggestions: string;
}

export interface AIReviewResult {
  id: string;
  card_id: string;
  attachment_id: string | null;
  previous_attachment_id: string | null;
  change_requests: AIChangeRequest[];
  verdicts: AIChangeVerdictResult[];
  overall_verdict: AIReviewVerdict;
  summary: string | null;
  confidence_score: number | null;
  model_used: string | null;
  usage_log_id: string | null;
  override_verdict: string | null;
  override_reason: string | null;
  overridden_by: string | null;
  overridden_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// AI CHATBOT TYPES
// ============================================================================

export type ChatScope = 'ticket' | 'board' | 'all_boards';
export type ChatMessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  role: ChatMessageRole;
  content: string;
  timestamp: string;
  tokens?: number;
  tool_executions?: ChatToolExecution[];
}

export interface ChatSession {
  id: string;
  user_id: string;
  scope: ChatScope;
  card_id: string | null;
  board_id: string | null;
  title: string | null;
  messages: ChatMessage[];
  message_count: number;
  total_tokens: number;
  model_used: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChatContextCard {
  id: string;
  title: string;
  description: string | null;
  priority: string | null;
  list_name: string;
  labels: string[];
  assignees: string[];
  checklist_summary?: string;
  custom_fields?: Record<string, unknown>;
  brief_data?: Record<string, unknown>;
  recent_comments?: string[];
}

export interface ChatBoardSummary {
  id: string;
  name: string;
  board_type: string;
  list_summary: { name: string; card_count: number }[];
}

export interface ChatClientSummary {
  name: string;
  card_count: number;
}

export interface ChatToolExecution {
  tool_name: string;
  tool_input: Record<string, unknown>;
  result: string;
  timestamp: string;
}

export interface ChatContext {
  scope: ChatScope;
  card?: ChatContextCard;
  board?: {
    id: string;
    name: string;
    board_type: BoardType;
    cards: ChatContextCard[];
  };
  user: {
    name: string;
    role: string;
  };
  // Extended context (WS2)
  boards_summary?: ChatBoardSummary[];
  clients_summary?: ChatClientSummary[];
  recent_activity?: { event: string; detail: string; when: string }[];
  map_board_context?: string;
  wiki_context?: string;
}

// ============================================================================
// CLIENT BOARDS & PORTAL TYPES
// ============================================================================

export type ClientTicketType = 'design' | 'bug' | 'dev' | 'content' | 'video' | 'general';
export type ClientTicketStatus = 'new' | 'routed' | 'in_progress' | 'completed' | 'closed';
export type ClientCardStatus = 'in_progress' | 'ready_for_review' | 'approved' | 'delivered' | 'revision_requested';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'revision_requested';

export interface ClientBoard {
  id: string;
  client_id: string;
  board_id: string;
  is_active: boolean;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ClientPortalUser {
  id: string;
  client_id: string;
  user_id: string | null;
  email: string;
  name: string;
  is_primary_contact: boolean;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientTicket {
  id: string;
  client_id: string;
  submitted_by: string | null;
  ticket_type: ClientTicketType;
  title: string;
  description: string | null;
  priority: string;
  status: ClientTicketStatus;
  routed_to_card_id: string | null;
  routed_to_board_id: string | null;
  attachments: unknown[];
  created_at: string;
  updated_at: string;
}

export interface SatisfactionResponse {
  id: string;
  client_id: string;
  card_id: string | null;
  submitted_by: string | null;
  rating: number;
  feedback: string | null;
  created_at: string;
}

// ============================================================================
// CLIENT AI BRAIN TYPES
// ============================================================================

export type BrainDocSourceType = 'card' | 'comment' | 'brief' | 'attachment' | 'manual' | 'map_board' | 'wiki' | 'asset' | 'email';

export interface ClientBrainDocument {
  id: string;
  client_id: string;
  source_type: BrainDocSourceType;
  source_id: string | null;
  title: string;
  content: string;
  chunk_index: number;
  metadata: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClientBrainQuery {
  id: string;
  client_id: string;
  user_id: string;
  query: string;
  response: string;
  confidence: number;
  sources: { document_id: string; title: string; similarity: number }[];
  model_used: string | null;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
  created_at: string;
}

export interface BrainSearchResult {
  document_id: string;
  title: string;
  content: string;
  similarity: number;
  source_type: BrainDocSourceType;
  metadata: Record<string, unknown>;
}

// ============================================================================
// DIGITAL ASSET LIBRARY TYPES
// ============================================================================

export type AssetType = 'image' | 'video' | 'document' | 'audio' | 'font' | 'archive' | 'other';

export interface Asset {
  id: string;
  client_id: string | null;
  name: string;
  storage_path: string;
  asset_type: AssetType;
  mime_type: string | null;
  file_size: number;
  tags: string[];
  version: number;
  parent_asset_id: string | null;
  source_card_id: string | null;
  source_attachment_id: string | null;
  metadata: Record<string, unknown>;
  is_archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssetCollection {
  id: string;
  name: string;
  description: string | null;
  client_id: string | null;
  parent_collection_id: string | null;
  cover_asset_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssetCollectionItem {
  id: string;
  collection_id: string;
  asset_id: string;
  position: number;
  added_at: string;
}

// ============================================================================
// WIKI / KNOWLEDGE BASE TYPES
// ============================================================================

export interface WikiPage {
  id: string;
  title: string;
  slug: string;
  content: string;
  department: BoardType | 'general' | null;
  is_published: boolean;
  owner_id: string | null;
  review_cadence_days: number | null;
  last_reviewed_at: string | null;
  next_review_at: string | null;
  tags: string[];
  parent_page_id: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface WikiPageVersion {
  id: string;
  page_id: string;
  version_number: number;
  title: string;
  content: string;
  change_summary: string | null;
  edited_by: string | null;
  created_at: string;
}

export interface BoardWikiPin {
  id: string;
  board_id: string;
  page_id: string;
  position: number;
  pinned_by: string | null;
  created_at: string;
}

// ============================================================================
// AM CLIENT EMAIL TYPES
// ============================================================================

export type EmailTone = 'formal' | 'friendly' | 'casual';
export type EmailStatus = 'draft' | 'approved' | 'sent' | 'failed';

export interface ClientEmailConfig {
  update_cadence?: 'weekly' | 'biweekly' | 'monthly';
  send_day?: string;
  send_time?: string;
  tone?: EmailTone;
  recipients?: string[];
  cc?: string[];
}

export interface ClientEmail {
  id: string;
  client_id: string;
  subject: string;
  body: string;
  tone: EmailTone;
  recipients: string[];
  cc: string[];
  status: EmailStatus;
  scheduled_for: string | null;
  sent_at: string | null;
  resend_message_id: string | null;
  ai_generated: boolean;
  model_used: string | null;
  drafted_by: string | null;
  approved_by: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface GoogleCalendarToken {
  id: string;
  user_id: string;
  access_token: string;
  refresh_token: string;
  token_expiry: string;
  calendar_id: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// CALENDAR/LIST VIEW TYPES
// ============================================================================

export type BoardViewMode = 'kanban' | 'list' | 'calendar' | 'inbox' | 'planner';

// ============================================================================
// AI BOARD ASSISTANT TYPES (P8.3 Enhanced)
// ============================================================================

export type AiUserMood = 'positive' | 'neutral' | 'negative' | 'curious' | 'frustrated' | 'confused';

export type AiBoardCategory = 'workload' | 'deadlines' | 'assignments' | 'progress' | 'blocked' | 'general';

export type BoardChartType = 'bar' | 'pie' | 'line';

export interface BoardChartDataPoint {
  label: string;
  value: number;
  color?: string;
}

export interface BoardChartData {
  chartType: BoardChartType;
  title: string;
  data: BoardChartDataPoint[];
  valueLabel?: string;
  trend?: string;
}

export interface AiAssistantResponse {
  response: string;
  thinking: string;
  user_mood: AiUserMood;
  suggested_questions: string[];
  matched_categories: AiBoardCategory[];
  redirect_to_owner: {
    should_redirect: boolean;
    reason?: string;
  };
  chart_data?: BoardChartData;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  card_id: string;
  board_id: string;
  list_name: string;
  priority: string | null;
  labels: string[];
}

// ============================================================================
// TIME TRACKING TYPES (P3.1)
// ============================================================================

export interface TimeEntry {
  id: string;
  card_id: string;
  user_id: string;
  board_id: string | null;
  client_id: string | null;
  description: string | null;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  is_billable: boolean;
  is_running: boolean;
  created_at: string;
  updated_at: string;
}

export interface TimeReportSnapshot {
  id: string;
  report_type: 'daily' | 'weekly' | 'monthly';
  report_date: string;
  user_id: string | null;
  board_id: string | null;
  client_id: string | null;
  total_minutes: number;
  billable_minutes: number;
  non_billable_minutes: number;
  entry_count: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface TimeReport {
  totalMinutes: number;
  billableMinutes: number;
  nonBillableMinutes: number;
  entries: TimeEntry[];
  byUser?: Record<string, number>;
  byBoard?: Record<string, number>;
  byClient?: Record<string, number>;
}

// ============================================================================
// AUTOMATION RULES BUILDER TYPES (P3.2)
// ============================================================================

export interface AutomationExecutionLog {
  id: string;
  rule_id: string;
  board_id: string | null;
  card_id: string | null;
  trigger_data: Record<string, unknown>;
  action_data: Record<string, unknown>;
  status: 'success' | 'failed' | 'skipped';
  error_message: string | null;
  execution_time_ms: number | null;
  created_at: string;
}

export type RecurrencePattern = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly';

export interface RecurringCard {
  id: string;
  board_id: string;
  list_id: string;
  title: string;
  description: string | null;
  recurrence_pattern: RecurrencePattern;
  recurrence_day: number | null;
  recurrence_time: string;
  labels: string[];
  assignee_ids: string[];
  priority: string | null;
  custom_fields: Record<string, unknown>;
  is_active: boolean;
  last_created_at: string | null;
  next_create_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// AI VIDEO GENERATION TYPES (P3.3)
// ============================================================================

export type VideoProvider = 'sora' | 'veo';
export type VideoMode = 'text_to_video' | 'image_to_video' | 'start_end_frame';
export type VideoGenerationStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface VideoGenerationSettings {
  duration?: number;
  aspect_ratio?: string;
  resolution?: string;
  fps?: number;
  style?: string;
}

export interface AIVideoGeneration {
  id: string;
  card_id: string;
  user_id: string;
  provider: VideoProvider;
  mode: VideoMode;
  prompt: string;
  negative_prompt: string | null;
  settings: VideoGenerationSettings;
  source_image_url: string | null;
  end_image_url: string | null;
  status: VideoGenerationStatus;
  output_urls: string[];
  thumbnail_url: string | null;
  storage_path: string | null;
  error_message: string | null;
  generation_time_ms: number | null;
  estimated_cost: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// AI COST PROFILING TYPES (P3.4)
// ============================================================================

export interface AIModelPricingRow {
  id: string;
  provider: string;
  model_id: string;
  input_cost_per_1k: number;
  output_cost_per_1k: number;
  image_cost_per_unit: number;
  video_cost_per_second: number;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
}

export interface AIActivityConfig {
  id: string;
  activity: string;
  provider: string;
  model_id: string;
  weight: number;
  is_active: boolean;
  max_tokens: number;
  temperature: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type BudgetAlertScope = 'global' | 'user' | 'board' | 'activity';

export interface AIBudgetAlert {
  id: string;
  scope: BudgetAlertScope;
  scope_id: string | null;
  threshold_percent: number;
  monthly_cap: number;
  current_spend: number;
  alerted_at: string | null;
  alert_sent: boolean;
  period_start: string;
  created_at: string;
  updated_at: string;
}

export interface AICostSummary {
  totalCost: number;
  byProvider: Record<string, number>;
  byModel: Record<string, number>;
  byActivity: Record<string, number>;
  byUser: Record<string, number>;
  byBoard: Record<string, number>;
  trend: { date: string; cost: number }[];
}

// ============================================================================
// INTEGRATION TYPES (P3.5)
// ============================================================================

export type IntegrationProvider = 'slack' | 'github' | 'figma';

export interface Integration {
  id: string;
  provider: IntegrationProvider;
  name: string;
  workspace_id: string | null;
  metadata: Record<string, unknown>;
  is_active: boolean;
  connected_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SlackBoardMapping {
  id: string;
  integration_id: string;
  board_id: string;
  channel_id: string;
  channel_name: string;
  notify_card_created: boolean;
  notify_card_moved: boolean;
  notify_card_completed: boolean;
  notify_comments: boolean;
  created_at: string;
}

export interface GitHubCardLink {
  id: string;
  integration_id: string;
  card_id: string;
  repo_owner: string;
  repo_name: string;
  link_type: 'issue' | 'pull_request' | 'branch';
  github_id: number | null;
  github_url: string;
  state: string | null;
  title: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FigmaCardEmbed {
  id: string;
  integration_id: string;
  card_id: string;
  figma_file_key: string;
  figma_node_id: string | null;
  figma_url: string;
  embed_type: 'file' | 'frame' | 'component' | 'prototype';
  title: string | null;
  thumbnail_url: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface IntegrationWebhookEvent {
  id: string;
  provider: string;
  event_type: string;
  payload: Record<string, unknown>;
  processed: boolean;
  error_message: string | null;
  created_at: string;
}

// ============================================================================
// ANALYTICS / WHITE-LABEL / GANTT TYPES (P3.6)
// ============================================================================

export interface PortalBranding {
  id: string;
  client_id: string | null;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  favicon_url: string | null;
  custom_domain: string | null;
  company_name: string | null;
  footer_text: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type SurveyType = 'delivery' | 'milestone' | 'periodic';

export interface SatisfactionSurvey {
  id: string;
  client_id: string;
  card_id: string | null;
  rating: number;
  feedback: string | null;
  survey_type: SurveyType;
  submitted_by: string | null;
  created_at: string;
}

export type ReportType = 'burndown' | 'velocity' | 'cycle_time' | 'workload' | 'ai_effectiveness' | 'custom';

export interface CustomReport {
  id: string;
  name: string;
  description: string | null;
  report_type: ReportType;
  config: Record<string, unknown>;
  created_by: string | null;
  is_shared: boolean;
  schedule: string | null;
  last_generated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GanttTask {
  id: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  progress_percent: number;
  card_id: string;
  board_id: string;
  list_name: string;
  dependencies: string[];
  assignees: string[];
  priority: string | null;
}

// ============================================================================
// WHATSAPP INTEGRATION TYPES (P4.0-4.1)
// ============================================================================

export interface WhatsAppUser {
  id: string;
  user_id: string;
  phone_number: string;
  phone_verified: boolean;
  verification_code: string | null;
  verification_expires_at: string | null;
  display_name: string | null;
  is_active: boolean;
  dnd_start: string | null;
  dnd_end: string | null;
  opt_out: boolean;
  frequency_cap_per_hour: number;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppGroup {
  id: string;
  board_id: string | null;
  department: string | null;
  group_name: string;
  whatsapp_group_id: string | null;
  is_active: boolean;
  member_count: number;
  created_at: string;
  updated_at: string;
}

export type WhatsAppMessageDirection = 'outbound' | 'inbound';
export type WhatsAppMessageType = 'notification' | 'quick_action' | 'digest' | 'verification' | 'reply';
export type WhatsAppMessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface WhatsAppMessage {
  id: string;
  whatsapp_user_id: string | null;
  group_id: string | null;
  direction: WhatsAppMessageDirection;
  message_type: WhatsAppMessageType;
  content: string;
  whatsapp_message_id: string | null;
  card_id: string | null;
  board_id: string | null;
  status: WhatsAppMessageStatus;
  error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export type QuickActionType = 'mark_done' | 'approve' | 'reject' | 'assign' | 'comment' | 'snooze';

export interface WhatsAppQuickAction {
  id: string;
  keyword: string;
  action_type: QuickActionType;
  action_config: Record<string, unknown>;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export interface WhatsAppDigestConfig {
  id: string;
  user_id: string;
  is_enabled: boolean;
  send_time: string;
  include_overdue: boolean;
  include_assigned: boolean;
  include_mentions: boolean;
  include_board_summary: boolean;
  board_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface WhatsAppNotificationLog {
  id: string;
  notification_id: string | null;
  whatsapp_user_id: string;
  message_id: string | null;
  event_type: string;
  throttled: boolean;
  throttle_reason: string | null;
  created_at: string;
}

// ============================================================================
// PRODUCTIVITY ANALYTICS TYPES (P4.2)
// ============================================================================

export interface CardColumnHistory {
  id: string;
  card_id: string;
  board_id: string;
  from_list_id: string | null;
  to_list_id: string;
  from_list_name: string | null;
  to_list_name: string | null;
  moved_by: string | null;
  moved_at: string;
}

export interface ProductivitySnapshot {
  id: string;
  snapshot_date: string;
  user_id: string | null;
  board_id: string | null;
  department: string | null;
  tickets_completed: number;
  tickets_created: number;
  avg_cycle_time_hours: number | null;
  on_time_rate: number | null;
  revision_rate: number | null;
  ai_pass_rate: number | null;
  total_time_logged_minutes: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ScheduledReport {
  id: string;
  name: string;
  report_type: 'productivity' | 'revision' | 'burndown' | 'custom';
  schedule: string;
  recipients: string[];
  config: Record<string, unknown>;
  is_active: boolean;
  last_sent_at: string | null;
  next_send_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductivityMetrics {
  ticketsCompleted: number;
  ticketsCreated: number;
  avgCycleTimeHours: number;
  onTimeRate: number;
  revisionRate: number;
  aiPassRate: number;
}

export interface UserScorecard {
  userId: string;
  userName: string;
  metrics: ProductivityMetrics;
  trend: { date: string; completed: number }[];
  rank: number;
}

// ============================================================================
// REVISION ANALYSIS TYPES (P4.3)
// ============================================================================

export interface RevisionMetrics {
  id: string;
  card_id: string;
  board_id: string;
  ping_pong_count: number;
  total_revision_time_minutes: number;
  first_revision_at: string | null;
  last_revision_at: string | null;
  is_outlier: boolean;
  outlier_reason: string | null;
  avg_board_ping_pong: number | null;
  computed_at: string;
}

export type RevisionExportFormat = 'pdf' | 'csv' | 'json';
export type RevisionExportStatus = 'pending' | 'generating' | 'completed' | 'failed';

export interface RevisionReportExport {
  id: string;
  board_id: string | null;
  department: string | null;
  date_range_start: string;
  date_range_end: string;
  format: RevisionExportFormat;
  storage_path: string | null;
  file_size_bytes: number | null;
  generated_by: string | null;
  status: RevisionExportStatus;
  error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface RevisionAnalysis {
  boardId: string;
  avgPingPongCount: number;
  outlierThreshold: number;
  totalCards: number;
  outlierCount: number;
  cards: RevisionMetrics[];
}

// ============================================================================
// CARD WATCHERS & REACTIONS (P6 v5.2.0)
// ============================================================================

export interface CardWatcher {
  id: string;
  card_id: string;
  user_id: string;
  created_at: string;
  profile?: Profile;
}

export interface CommentReaction {
  id: string;
  comment_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
  profile?: Profile;
}

// ============================================================================
// SAVED FILTERS (P6 v5.3.0)
// ============================================================================

export interface SavedFilter {
  id: string;
  board_id: string;
  user_id: string;
  name: string;
  filter_config: Record<string, unknown>;
  is_default: boolean;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// PUSH SUBSCRIPTIONS & DIGEST (P6 v5.6.0)
// ============================================================================

export interface PushSubscription {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
  created_at: string;
}

export interface DigestConfig {
  id: string;
  user_id: string;
  frequency: 'daily' | 'weekly';
  send_time: string;
  include_assigned: boolean;
  include_overdue: boolean;
  include_mentions: boolean;
  include_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface CardWithDetails extends Card {
  placements: CardPlacement[];
  labels: Label[];
  assignees: Profile[];
  comments: Comment[];
  checklists?: Checklist[];
  attachments?: Attachment[];
  activity_log?: ActivityLogEntry[];
  dependencies?: CardDependency[];
  custom_field_values?: CustomFieldValue[];
  brief?: CardBrief;
}

export interface CardPlacementWithMeta extends CardPlacement {
  card: Card;
  labels: Label[];
  assignees: Profile[];
  comment_count?: number;
  attachment_count?: number;
  checklist_total?: number;
  checklist_done?: number;
  cover_image_url?: string | null;
}

export interface ListWithCards extends List {
  cards: CardPlacementWithMeta[];
}

export interface BoardWithLists extends Board {
  lists: ListWithCards[];
  labels: Label[];
  custom_field_definitions?: CustomFieldDefinition[];
}

// ============================================================================
// P5.0: Public API & Webhooks
// ============================================================================

export type ApiKeyPermission =
  | 'boards:read'
  | 'boards:write'
  | 'cards:read'
  | 'cards:write'
  | 'comments:read'
  | 'comments:write'
  | 'labels:read'
  | 'labels:write'
  | 'webhooks:manage'
  | 'users:read';

export interface ApiKey {
  id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  user_id: string;
  permissions: ApiKeyPermission[];
  rate_limit_per_minute: number;
  rate_limit_per_day: number;
  is_active: boolean;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiUsageLogEntry {
  id: string;
  api_key_id: string;
  endpoint: string;
  method: string;
  status_code: number;
  response_time_ms: number | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export type WebhookEvent =
  | 'card.created'
  | 'card.updated'
  | 'card.moved'
  | 'card.deleted'
  | 'comment.added'
  | 'comment.deleted'
  | 'label.added'
  | 'label.removed'
  | 'board.created'
  | 'board.updated'
  | 'member.added'
  | 'member.removed';

export interface Webhook {
  id: string;
  user_id: string;
  url: string;
  secret: string;
  events: WebhookEvent[];
  is_active: boolean;
  description: string | null;
  failure_count: number;
  last_triggered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  response_status: number | null;
  response_body: string | null;
  response_time_ms: number | null;
  attempt_number: number;
  success: boolean;
  error_message: string | null;
  delivered_at: string;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset_at: string;
}

// ============================================================================
// P5.1-5.2: Enterprise SSO, IP Whitelist, Advanced Audit
// ============================================================================

export type SSOProviderType = 'saml' | 'oidc';

export interface SSOConfig {
  id: string;
  provider_type: SSOProviderType;
  name: string;
  issuer_url: string | null;
  metadata_url: string | null;
  client_id: string | null;
  client_secret_encrypted: string | null;
  certificate: string | null;
  attribute_mapping: Record<string, string>;
  is_active: boolean;
  auto_provision_users: boolean;
  default_role: string;
  allowed_domains: string[];
  created_at: string;
  updated_at: string;
}

export interface IPWhitelistEntry {
  id: string;
  cidr: string;
  description: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AIReviewConfidence {
  confidence_score: number | null;
  accuracy_verified: boolean | null;
  accuracy_verified_by: string | null;
  accuracy_verified_at: string | null;
}

// ============================================================================
// P5.3: Performance Optimization
// ============================================================================

export interface CursorPaginationParams {
  cursor?: string; // ISO date or UUID
  limit: number;
  direction: 'forward' | 'backward';
}

export interface CursorPaginationResult<T> {
  items: T[];
  next_cursor: string | null;
  has_more: boolean;
  total_estimate?: number;
}

export interface PerformanceBaseline {
  metric: string;
  value: number;
  unit: string;
  measured_at: string;
}

// ============================================================================
// P5.4: WhatsApp Advanced + Productivity Polish
// ============================================================================

export interface WhatsAppCustomAction {
  id: string;
  user_id: string;
  keyword: string;
  label: string;
  action_type: string;
  action_config: Record<string, unknown>;
  response_template: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppDigestTemplate {
  id: string;
  user_id: string;
  name: string;
  sections: DigestSection[];
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface DigestSection {
  type: 'overdue' | 'assigned' | 'mentions' | 'board_summary' | 'custom';
  title: string;
  enabled: boolean;
  config?: Record<string, unknown>;
}

export type ProductivityReportType = 'individual' | 'team' | 'department' | 'executive';
export type ProductivityReportFormat = 'pdf' | 'csv' | 'xlsx';
export type ProductivityReportFileStatus = 'pending' | 'generating' | 'completed' | 'failed';

export interface ProductivityReportConfig {
  id: string;
  name: string;
  report_type: ProductivityReportType;
  schedule: string | null;
  recipients: string[];
  include_sections: string[];
  filters: Record<string, unknown>;
  format: ProductivityReportFormat;
  is_active: boolean;
  last_generated_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ProductivityReportFile {
  id: string;
  config_id: string | null;
  report_type: string;
  format: string;
  storage_path: string | null;
  file_size_bytes: number | null;
  date_range_start: string;
  date_range_end: string;
  generated_by: string;
  status: ProductivityReportFileStatus;
  error_message: string | null;
  created_at: string;
}

// ============================================================================
// AGENT SKILLS SYSTEM (Migration 039)
// ============================================================================

export type AgentSkillCategory = 'content' | 'creative' | 'strategy' | 'seo' | 'meta';
export type AgentSkillPack = 'skills' | 'creative' | 'custom';
export type AgentQualityTier = 'genuinely_smart' | 'solid' | 'has_potential' | 'placeholder' | 'tool_dependent';
export type AgentTriggerType = 'manual' | 'automation_rule' | 'card_event' | 'schedule' | 'chained';
export type AgentExecutionStatus = 'running' | 'success' | 'failed' | 'cancelled' | 'pending_confirmation';
export type AgentToolCallStatus = 'pending' | 'success' | 'failed' | 'pending_confirmation' | 'confirmed' | 'rejected';
export type CardAgentTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type SkillImprovementType = 'prompt_update' | 'quality_review' | 'reference_added' | 'bug_fix' | 'feature_add' | 'rewrite';

export interface AgentSkill {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: AgentSkillCategory;
  pack: AgentSkillPack;
  system_prompt: string;

  // Quality dashboard
  quality_tier: AgentQualityTier;
  quality_score: number;
  quality_notes: string | null;
  strengths: string[];
  weaknesses: string[];
  improvement_suggestions: string[];
  last_quality_review_at: string | null;

  // Capabilities
  supported_tools: string[];
  required_context: string[];
  output_format: string;
  estimated_tokens: number;

  // Dependency graph
  depends_on: string[];
  feeds_into: string[];

  // External tool dependencies
  requires_mcp_tools: string[];
  fallback_behavior: string | null;

  // Reference material
  reference_docs: { name: string; content_summary: string; quality: string }[];

  // Metadata
  version: string;
  is_active: boolean;
  icon: string | null;
  color: string | null;
  sort_order: number;

  created_at: string;
  updated_at: string;
}

export interface BoardAgent {
  id: string;
  board_id: string;
  skill_id: string;
  custom_prompt_additions: string | null;
  custom_tools: string[] | null;
  model_preference: string | null;
  is_active: boolean;
  auto_trigger_on: string[];
  max_iterations: number;
  requires_confirmation: boolean;

  // Stats
  total_executions: number;
  successful_executions: number;
  total_tokens_used: number;
  total_cost_usd: number;
  avg_quality_rating: number | null;
  last_executed_at: string | null;

  created_by: string | null;
  created_at: string;
  updated_at: string;

  // Joined
  skill?: AgentSkill;
}

export interface AgentExecution {
  id: string;
  board_agent_id: string;
  skill_id: string;
  board_id: string | null;
  card_id: string | null;
  user_id: string;

  trigger_type: AgentTriggerType;
  trigger_data: Record<string, unknown>;
  input_message: string;
  input_context: Record<string, unknown>;
  output_response: string | null;
  output_artifacts: { type: string; content: string; filename?: string }[];

  model_used: string | null;
  iterations_used: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  duration_ms: number | null;

  status: AgentExecutionStatus;
  error_message: string | null;

  quality_rating: number | null;
  quality_feedback: string | null;
  was_useful: boolean | null;

  created_at: string;
  completed_at: string | null;

  // Joined
  skill?: AgentSkill;
  tool_calls?: AgentToolCall[];
}

export interface AgentToolCall {
  id: string;
  execution_id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_result: Record<string, unknown> | null;
  status: AgentToolCallStatus;
  error_message: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  call_order: number;
  duration_ms: number | null;
  created_at: string;
}

export interface CardAgentTask {
  id: string;
  card_id: string;
  skill_id: string;
  execution_id: string | null;
  title: string;
  input_prompt: string | null;
  status: CardAgentTaskStatus;
  output_preview: string | null;
  output_full: string | null;
  output_artifacts: { type: string; content: string; filename?: string }[];
  quality_rating: number | null;
  was_applied: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;

  // Joined
  skill?: AgentSkill;
  execution?: AgentExecution;
}

export interface SkillImprovementLog {
  id: string;
  skill_id: string;
  change_type: SkillImprovementType;
  change_description: string;
  quality_score_before: number | null;
  quality_score_after: number | null;
  quality_tier_before: string | null;
  quality_tier_after: string | null;
  changed_by: string | null;
  created_at: string;
}

// Dashboard aggregation types
export interface SkillQualityDashboard {
  total_skills: number;
  by_tier: Record<AgentQualityTier, number>;
  by_category: Record<AgentSkillCategory, number>;
  by_pack: Record<AgentSkillPack, number>;
  avg_quality_score: number;
  skills_needing_improvement: AgentSkill[];
  recent_improvements: SkillImprovementLog[];
  top_performers: (AgentSkill & { exec_count: number; avg_rating: number })[];
}

export interface AgentExecutionStats {
  total_executions: number;
  success_rate: number;
  total_cost_usd: number;
  total_tokens: number;
  avg_duration_ms: number;
  avg_quality_rating: number | null;
  by_skill: { skill_id: string; skill_name: string; count: number; avg_rating: number | null }[];
  by_day: { date: string; count: number; cost: number }[];
}

// ============================================================================
// BOARD COMMAND MODE TYPES (P8.7)
// ============================================================================

export type CommandActionType = 'move' | 'assign' | 'add_label' | 'set_priority' | 'archive' | 'unarchive';

export interface CommandAction {
  type: CommandActionType;
  card_ids: string[];
  description: string;
  config: {
    target_list_id?: string;
    assignee_id?: string;
    label_id?: string;
    priority?: string;
  };
}

export interface CommandActionPlan {
  actions: CommandAction[];
  summary: string;
  warning?: string;
}

export interface CommandExecutionResult {
  action_index: number;
  success: boolean;
  affected_count: number;
  error?: string;
}

export interface SavedCommand {
  id: string;
  board_id: string;
  name: string;
  command: string;
  icon: string;
  usage_count: number;
}
