import { BoardType, CustomFieldType } from './types';

export interface BoardTypeConfig {
  label: string;
  icon: string;
  defaultLists: string[];
  color: string;
  defaultCustomFields: {
    name: string;
    field_type: CustomFieldType;
    options?: string[];
    is_required?: boolean;
  }[];
}

export const BOARD_TYPE_CONFIG: Record<BoardType, BoardTypeConfig> = {
  graphic_designer: {
    label: 'Design Board',
    icon: '🎨',
    defaultLists: [
      'Briefed',
      'In Progress',
      'Internal Review',
      'Revisions',
      'Client Review',
      'Client Revisions',
      'Approved',
      'Delivered',
    ],
    color: '#f59e0b',
    defaultCustomFields: [
      { name: 'Design Type', field_type: 'dropdown', options: ['Logo', 'Banner', 'Social Media', 'Website', 'Print', 'Branding', 'Illustration', 'Other'], is_required: true },
      { name: 'Dimensions', field_type: 'text' },
      { name: 'Revision Count', field_type: 'number' },
      { name: 'AI Review', field_type: 'checkbox' },
      { name: 'Export Format', field_type: 'dropdown', options: ['PNG', 'JPG', 'SVG', 'PDF', 'PSD', 'AI', 'FIGMA'] },
      { name: 'Source File Link', field_type: 'url' },
    ],
  },
  dev: {
    label: 'Dev Board',
    icon: '💻',
    defaultLists: [
      'Backlog',
      'Briefed',
      'In Progress',
      'Code Review',
      'QA Testing',
      'Revisions',
      'Staging',
      'Ready for Deploy',
      'Deployed',
    ],
    color: '#3b82f6',
    defaultCustomFields: [
      { name: 'Ticket Type', field_type: 'dropdown', options: ['Feature', 'Bug', 'Enhancement', 'Hotfix', 'Tech Debt', 'Chore'], is_required: true },
      { name: 'Repository', field_type: 'text' },
      { name: 'Branch', field_type: 'text' },
      { name: 'PR Link', field_type: 'url' },
      { name: 'Staging URL', field_type: 'url' },
      { name: 'Story Points', field_type: 'number' },
      { name: 'AI QA', field_type: 'checkbox' },
    ],
  },
  copy: {
    label: 'Copy Board',
    icon: '✍️',
    defaultLists: [
      'Briefed',
      'Research',
      'Writing',
      'Internal Review',
      'Revisions',
      'Client Review',
      'Approved',
      'Published',
    ],
    color: '#6366f1',
    defaultCustomFields: [
      { name: 'Content Type', field_type: 'dropdown', options: ['Blog Post', 'Email Campaign', 'Social Post', 'Website Copy', 'Ad Copy', 'Press Release', 'Newsletter', 'Case Study'], is_required: true },
      { name: 'Word Count', field_type: 'number' },
      { name: 'Tone', field_type: 'dropdown', options: ['Professional', 'Casual', 'Playful', 'Authoritative', 'Empathetic', 'Urgent'] },
      { name: 'SEO Keywords', field_type: 'text' },
      { name: 'Target Audience', field_type: 'text' },
      { name: 'Publish URL', field_type: 'url' },
    ],
  },
  account_manager: {
    label: 'Account Managers',
    icon: '🤝',
    defaultLists: [
      'New Clients',
      'Onboarding',
      'Active',
      'Monthly Review',
      'Follow Up',
      'At Risk',
      'Upsell',
      'Closed',
    ],
    color: '#10b981',
    defaultCustomFields: [
      { name: 'Client Account', field_type: 'text', is_required: true },
      { name: 'Contract Type', field_type: 'dropdown', options: ['Monthly Retainer', 'Project-Based', 'Hourly', 'Annual'] },
      { name: 'Monthly Budget', field_type: 'number' },
      { name: 'Next Review Date', field_type: 'date' },
      { name: 'Satisfaction Score', field_type: 'number' },
      { name: 'CRM Link', field_type: 'url' },
    ],
  },
  video_editor: {
    label: 'Video Board',
    icon: '🎬',
    defaultLists: [
      'Briefed',
      'Raw Footage',
      'Editing',
      'Internal Review',
      'Revisions',
      'Client Review',
      'Approved',
      'Delivered',
    ],
    color: '#ef4444',
    defaultCustomFields: [
      { name: 'Video Type', field_type: 'dropdown', options: ['Social Media', 'YouTube', 'Ad/Commercial', 'Corporate', 'Event', 'Tutorial', 'Animation', 'Reel'], is_required: true },
      { name: 'Duration (seconds)', field_type: 'number' },
      { name: 'Aspect Ratio', field_type: 'dropdown', options: ['16:9', '9:16', '1:1', '4:5', '4:3'] },
      { name: 'Raw Footage Link', field_type: 'url' },
      { name: 'Export Format', field_type: 'dropdown', options: ['MP4', 'MOV', 'AVI', 'GIF', 'WebM'] },
      { name: 'Revision Count', field_type: 'number' },
    ],
  },
  executive_assistant: {
    label: 'Executive Assistant',
    icon: '📋',
    defaultLists: [
      'Inbox',
      'To Do',
      'In Progress',
      'Waiting On',
      'Follow Up',
      'Done',
    ],
    color: '#ec4899',
    defaultCustomFields: [
      { name: 'Task Category', field_type: 'dropdown', options: ['Scheduling', 'Travel', 'Communication', 'Research', 'Filing', 'Personal', 'Meeting Prep', 'Other'], is_required: true },
      { name: 'Requesting Executive', field_type: 'text' },
      { name: 'Urgency', field_type: 'dropdown', options: ['Immediate', 'Today', 'This Week', 'Low Priority'] },
      { name: 'Follow-Up Date', field_type: 'date' },
    ],
  },
  training: {
    label: 'Training',
    icon: '📚',
    defaultLists: [
      'New Materials',
      'In Development',
      'Review',
      'Published',
      'Assigned',
      'Completed',
    ],
    color: '#8b5cf6',
    defaultCustomFields: [
      { name: 'Training Type', field_type: 'dropdown', options: ['Onboarding', 'Skill Development', 'Tool Training', 'Process', 'Compliance'] },
      { name: 'Target Role', field_type: 'text' },
      { name: 'Duration (minutes)', field_type: 'number' },
      { name: 'Video Link', field_type: 'url' },
    ],
  },
  client_strategy_map: {
    label: 'Client Strategy Map',
    icon: '🗺️',
    defaultLists: [
      'Discovery',
      'Strategy',
      'Execution',
      'Review',
      'Optimization',
    ],
    color: '#0891b2',
    defaultCustomFields: [
      { name: 'Client Name', field_type: 'text', is_required: true },
      { name: 'Strategy Phase', field_type: 'dropdown', options: ['Research', 'Planning', 'Launch', 'Growth', 'Maintenance'] },
      { name: 'KPI Target', field_type: 'text' },
      { name: 'Review Date', field_type: 'date' },
    ],
  },
};

export const LABEL_COLORS = [
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Green', value: '#10b981' },
  { name: 'Yellow', value: '#f59e0b' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Teal', value: '#14b8a6' },
];
