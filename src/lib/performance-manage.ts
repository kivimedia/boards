import { PK_TRACKER_LABELS, PKTrackerType } from '@/lib/types';

export type TrackerManageFieldType = 'text' | 'date' | 'boolean' | 'textarea';

export interface TrackerManageField {
  key: string;
  label: string;
  type: TrackerManageFieldType;
  required?: boolean;
}

export interface TrackerManageConfig {
  trackerType: PKTrackerType;
  label: string;
  tableName: string;
  groupBy: {
    field: 'account_manager_name' | 'month_label';
    queryParam: 'am' | 'month';
    label: string;
    itemLabel: string;
  };
  columns: TrackerManageField[];
}

export const TRACKER_MANAGE_CONFIGS: Partial<Record<PKTrackerType, TrackerManageConfig>> = {
  client_updates: {
    trackerType: 'client_updates',
    label: PK_TRACKER_LABELS.client_updates,
    tableName: 'pk_client_updates',
    groupBy: {
      field: 'account_manager_name',
      queryParam: 'am',
      label: 'Account Managers',
      itemLabel: 'account manager',
    },
    columns: [
      { key: 'account_manager_name', label: 'AM', type: 'text', required: true },
      { key: 'client_name', label: 'Client', type: 'text' },
      { key: 'meeting_date', label: 'Date of Meeting', type: 'date' },
      { key: 'date_sent', label: 'Date Sent', type: 'date' },
      { key: 'on_time', label: 'On Time', type: 'boolean' },
      { key: 'method', label: 'Method', type: 'text' },
      { key: 'notes', label: 'Notes', type: 'text' },
    ],
  },
  fathom_videos: {
    trackerType: 'fathom_videos',
    label: PK_TRACKER_LABELS.fathom_videos,
    tableName: 'pk_fathom_videos',
    groupBy: {
      field: 'account_manager_name',
      queryParam: 'am',
      label: 'Account Managers',
      itemLabel: 'account manager',
    },
    columns: [
      { key: 'account_manager_name', label: 'AM', type: 'text', required: true },
      { key: 'client_name', label: 'Client', type: 'text' },
      { key: 'meeting_date', label: 'Meeting Date', type: 'date' },
      { key: 'date_watched', label: 'Date Watched', type: 'date' },
      { key: 'watched', label: 'Watched', type: 'boolean' },
      { key: 'action_items_sent', label: 'Action Items Sent', type: 'boolean' },
      { key: 'fathom_video_link', label: 'Fathom Link', type: 'text' },
      { key: 'attachments', label: 'Attachments', type: 'text' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  sanity_checks: {
    trackerType: 'sanity_checks',
    label: PK_TRACKER_LABELS.sanity_checks,
    tableName: 'pk_sanity_checks',
    groupBy: {
      field: 'account_manager_name',
      queryParam: 'am',
      label: 'Account Managers',
      itemLabel: 'account manager',
    },
    columns: [
      { key: 'account_manager_name', label: 'AM', type: 'text', required: true },
      { key: 'check_date', label: 'Check Date', type: 'date' },
      { key: 'client_name', label: 'Client', type: 'text' },
      { key: 'business_name', label: 'Business', type: 'text' },
      { key: 'sanity_check_done', label: 'Sanity Check Done', type: 'boolean' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  pics_monitoring: {
    trackerType: 'pics_monitoring',
    label: PK_TRACKER_LABELS.pics_monitoring,
    tableName: 'pk_pics_monitoring',
    groupBy: {
      field: 'account_manager_name',
      queryParam: 'am',
      label: 'Account Managers',
      itemLabel: 'account manager',
    },
    columns: [
      { key: 'account_manager_name', label: 'AM', type: 'text', required: true },
      { key: 'week_label', label: 'Week Label', type: 'text' },
      { key: 'check_date', label: 'Check Date', type: 'date' },
      { key: 'client_name', label: 'Client', type: 'text' },
      { key: 'duration', label: 'Duration', type: 'text' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  google_ads_reports: {
    trackerType: 'google_ads_reports',
    label: PK_TRACKER_LABELS.google_ads_reports,
    tableName: 'pk_google_ads_reports',
    groupBy: {
      field: 'month_label',
      queryParam: 'month',
      label: 'Months',
      itemLabel: 'month',
    },
    columns: [
      { key: 'month_label', label: 'Month', type: 'text', required: true },
      { key: 'raw_content', label: 'Report Content', type: 'textarea' },
    ],
  },
  holiday_tracking: {
    trackerType: 'holiday_tracking',
    label: PK_TRACKER_LABELS.holiday_tracking,
    tableName: 'pk_holiday_tracking',
    groupBy: {
      field: 'account_manager_name',
      queryParam: 'am',
      label: 'Account Managers',
      itemLabel: 'account manager',
    },
    columns: [
      { key: 'account_manager_name', label: 'AM', type: 'text', required: true },
      { key: 'website_link', label: 'Website Link', type: 'text' },
      { key: 'raw_content', label: 'Content', type: 'textarea' },
    ],
  },
};

export function getTrackerManageConfig(
  trackerType: string
): TrackerManageConfig | null {
  return TRACKER_MANAGE_CONFIGS[trackerType as PKTrackerType] || null;
}

export function isTrackerManageEnabled(trackerType: string): boolean {
  return Boolean(TRACKER_MANAGE_CONFIGS[trackerType as PKTrackerType]);
}
