import { SupabaseClient } from '@supabase/supabase-js';
import type {
  WhatsAppCustomAction,
  WhatsAppDigestTemplate,
  DigestSection,
  ProductivityReportConfig,
  ProductivityReportFile,
  ProductivityReportType,
  ProductivityReportFormat,
} from './types';

// ============================================================================
// CUSTOM QUICK ACTIONS
// ============================================================================

export async function getCustomActions(
  supabase: SupabaseClient,
  userId: string
): Promise<WhatsAppCustomAction[]> {
  const { data } = await supabase
    .from('whatsapp_custom_actions')
    .select('*')
    .eq('user_id', userId)
    .order('keyword', { ascending: true });

  return (data as WhatsAppCustomAction[]) ?? [];
}

export async function createCustomAction(
  supabase: SupabaseClient,
  params: {
    userId: string;
    keyword: string;
    label: string;
    actionType: string;
    actionConfig?: Record<string, unknown>;
    responseTemplate?: string;
  }
): Promise<WhatsAppCustomAction | null> {
  const { data, error } = await supabase
    .from('whatsapp_custom_actions')
    .insert({
      user_id: params.userId,
      keyword: params.keyword.toLowerCase().trim(),
      label: params.label,
      action_type: params.actionType,
      action_config: params.actionConfig ?? {},
      response_template: params.responseTemplate ?? null,
    })
    .select()
    .single();

  if (error) return null;
  return data as WhatsAppCustomAction;
}

export async function updateCustomAction(
  supabase: SupabaseClient,
  actionId: string,
  updates: Partial<Pick<WhatsAppCustomAction, 'keyword' | 'label' | 'action_type' | 'action_config' | 'response_template' | 'is_active'>>
): Promise<WhatsAppCustomAction | null> {
  const { data, error } = await supabase
    .from('whatsapp_custom_actions')
    .update(updates)
    .eq('id', actionId)
    .select()
    .single();

  if (error) return null;
  return data as WhatsAppCustomAction;
}

export async function deleteCustomAction(
  supabase: SupabaseClient,
  actionId: string
): Promise<void> {
  await supabase.from('whatsapp_custom_actions').delete().eq('id', actionId);
}

// ============================================================================
// DIGEST TEMPLATES
// ============================================================================

export async function getDigestTemplates(
  supabase: SupabaseClient,
  userId: string
): Promise<WhatsAppDigestTemplate[]> {
  const { data } = await supabase
    .from('whatsapp_digest_templates')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  return (data as WhatsAppDigestTemplate[]) ?? [];
}

export async function createDigestTemplate(
  supabase: SupabaseClient,
  params: {
    userId: string;
    name: string;
    sections: DigestSection[];
    isDefault?: boolean;
  }
): Promise<WhatsAppDigestTemplate | null> {
  const { data, error } = await supabase
    .from('whatsapp_digest_templates')
    .insert({
      user_id: params.userId,
      name: params.name,
      sections: params.sections,
      is_default: params.isDefault ?? false,
    })
    .select()
    .single();

  if (error) return null;
  return data as WhatsAppDigestTemplate;
}

export async function updateDigestTemplate(
  supabase: SupabaseClient,
  templateId: string,
  updates: Partial<Pick<WhatsAppDigestTemplate, 'name' | 'sections' | 'is_default'>>
): Promise<WhatsAppDigestTemplate | null> {
  const { data, error } = await supabase
    .from('whatsapp_digest_templates')
    .update(updates)
    .eq('id', templateId)
    .select()
    .single();

  if (error) return null;
  return data as WhatsAppDigestTemplate;
}

export async function deleteDigestTemplate(
  supabase: SupabaseClient,
  templateId: string
): Promise<void> {
  await supabase.from('whatsapp_digest_templates').delete().eq('id', templateId);
}

/**
 * Build digest content from a template and board data.
 */
export function buildDigestContent(
  sections: DigestSection[],
  data: {
    overdueCards?: { title: string; dueDate: string }[];
    assignedCards?: { title: string; board: string }[];
    mentions?: { text: string; card: string }[];
    boardSummaries?: { board: string; total: number; completed: number }[];
  }
): string {
  const parts: string[] = [];

  for (const section of sections) {
    if (!section.enabled) continue;

    switch (section.type) {
      case 'overdue':
        if (data.overdueCards && data.overdueCards.length > 0) {
          parts.push(`*${section.title}*`);
          for (const card of data.overdueCards) {
            parts.push(`  - ${card.title} (due: ${card.dueDate})`);
          }
        }
        break;
      case 'assigned':
        if (data.assignedCards && data.assignedCards.length > 0) {
          parts.push(`*${section.title}*`);
          for (const card of data.assignedCards) {
            parts.push(`  - ${card.title} [${card.board}]`);
          }
        }
        break;
      case 'mentions':
        if (data.mentions && data.mentions.length > 0) {
          parts.push(`*${section.title}*`);
          for (const mention of data.mentions) {
            parts.push(`  - "${mention.text}" on ${mention.card}`);
          }
        }
        break;
      case 'board_summary':
        if (data.boardSummaries && data.boardSummaries.length > 0) {
          parts.push(`*${section.title}*`);
          for (const summary of data.boardSummaries) {
            parts.push(`  - ${summary.board}: ${summary.completed}/${summary.total} completed`);
          }
        }
        break;
      case 'custom':
        parts.push(`*${section.title}*`);
        break;
    }
  }

  return parts.join('\n');
}

// ============================================================================
// PRODUCTIVITY REPORT CONFIGS
// ============================================================================

export async function getReportConfigs(
  supabase: SupabaseClient,
  createdBy?: string
): Promise<ProductivityReportConfig[]> {
  let query = supabase
    .from('productivity_report_configs')
    .select('*')
    .order('created_at', { ascending: false });

  if (createdBy) query = query.eq('created_by', createdBy);

  const { data } = await query;
  return (data as ProductivityReportConfig[]) ?? [];
}

export async function createReportConfig(
  supabase: SupabaseClient,
  config: {
    name: string;
    reportType: ProductivityReportType;
    schedule?: string;
    recipients: string[];
    includeSections?: string[];
    filters?: Record<string, unknown>;
    format?: ProductivityReportFormat;
    createdBy: string;
  }
): Promise<ProductivityReportConfig | null> {
  const { data, error } = await supabase
    .from('productivity_report_configs')
    .insert({
      name: config.name,
      report_type: config.reportType,
      schedule: config.schedule ?? null,
      recipients: config.recipients,
      include_sections: config.includeSections ?? [],
      filters: config.filters ?? {},
      format: config.format ?? 'pdf',
      created_by: config.createdBy,
    })
    .select()
    .single();

  if (error) return null;
  return data as ProductivityReportConfig;
}

export async function updateReportConfig(
  supabase: SupabaseClient,
  configId: string,
  updates: Partial<
    Pick<
      ProductivityReportConfig,
      'name' | 'schedule' | 'recipients' | 'include_sections' | 'filters' | 'format' | 'is_active'
    >
  >
): Promise<ProductivityReportConfig | null> {
  const { data, error } = await supabase
    .from('productivity_report_configs')
    .update(updates)
    .eq('id', configId)
    .select()
    .single();

  if (error) return null;
  return data as ProductivityReportConfig;
}

export async function deleteReportConfig(
  supabase: SupabaseClient,
  configId: string
): Promise<void> {
  await supabase.from('productivity_report_configs').delete().eq('id', configId);
}

// ============================================================================
// PRODUCTIVITY REPORT FILES
// ============================================================================

export async function getReportFiles(
  supabase: SupabaseClient,
  configId?: string,
  limit: number = 20
): Promise<ProductivityReportFile[]> {
  let query = supabase
    .from('productivity_report_files')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (configId) query = query.eq('config_id', configId);

  const { data } = await query;
  return (data as ProductivityReportFile[]) ?? [];
}

export async function createReportFile(
  supabase: SupabaseClient,
  params: {
    configId?: string;
    reportType: string;
    format: string;
    dateRangeStart: string;
    dateRangeEnd: string;
    generatedBy: string;
  }
): Promise<ProductivityReportFile | null> {
  const { data, error } = await supabase
    .from('productivity_report_files')
    .insert({
      config_id: params.configId ?? null,
      report_type: params.reportType,
      format: params.format,
      date_range_start: params.dateRangeStart,
      date_range_end: params.dateRangeEnd,
      generated_by: params.generatedBy,
      status: 'pending',
    })
    .select()
    .single();

  if (error) return null;
  return data as ProductivityReportFile;
}

export async function updateReportFile(
  supabase: SupabaseClient,
  fileId: string,
  updates: Partial<Pick<ProductivityReportFile, 'status' | 'storage_path' | 'file_size_bytes' | 'error_message'>>
): Promise<void> {
  await supabase
    .from('productivity_report_files')
    .update(updates)
    .eq('id', fileId);
}

/**
 * Generate CSV content from productivity data.
 */
export function generateProductivityCSV(
  data: {
    userId: string;
    userName: string;
    ticketsCompleted: number;
    ticketsCreated: number;
    avgCycleTimeHours: number;
    onTimeRate: number;
    revisionRate: number;
  }[]
): string {
  const header = 'User ID,User Name,Tickets Completed,Tickets Created,Avg Cycle Time (hrs),On-Time Rate (%),Revision Rate (%)';
  const rows = data.map((d) =>
    [d.userId, d.userName, d.ticketsCompleted, d.ticketsCreated, d.avgCycleTimeHours, d.onTimeRate, d.revisionRate].join(',')
  );
  return [header, ...rows].join('\n');
}

// ============================================================================
// REPORT SECTION OPTIONS
// ============================================================================

export const REPORT_SECTIONS = [
  { id: 'summary', label: 'Executive Summary' },
  { id: 'metrics', label: 'Key Metrics' },
  { id: 'trends', label: 'Trend Charts' },
  { id: 'leaderboard', label: 'User Leaderboard' },
  { id: 'cycle_time', label: 'Cycle Time Analysis' },
  { id: 'revisions', label: 'Revision Analysis' },
  { id: 'ai_usage', label: 'AI Usage Stats' },
  { id: 'recommendations', label: 'AI Recommendations' },
] as const;

export const REPORT_TYPE_OPTIONS: { value: ProductivityReportType; label: string }[] = [
  { value: 'individual', label: 'Individual Report' },
  { value: 'team', label: 'Team Report' },
  { value: 'department', label: 'Department Report' },
  { value: 'executive', label: 'Executive Summary' },
];
