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
  boutique_decor: {
    label: 'Boutique Decor Pipeline',
    icon: '🎈',
    defaultLists: [
      'Website Inquiry',
      'DM/Text Inquiry',
      'Responded - Need More Info',
      'Proposal/Pricing Sent',
      'Needs Follow-Up',
      'Needs Invoice',
      'Invoice Sent',
      'Paid in Full',
      'Supplies/Prep Needed',
      'Event This Week',
      'Needs Thank You',
      'Thank You Sent / Complete',
      "Didn't Book",
      'Future/On Hold',
      'Template Cards',
    ],
    color: '#ec4899', // pink
    defaultCustomFields: [
      { name: 'Event Date', field_type: 'date', is_required: true },
      { name: 'Event Type', field_type: 'dropdown', options: ['Birthday', 'Baby Shower', 'Wedding', 'Corporate', 'Grand Opening', 'Graduation', 'Anniversary', 'Holiday', 'School Event', 'Church Event', 'Gender Reveal', 'Prom', 'Other'] },
      { name: 'Venue', field_type: 'text' },
      { name: 'Venue City', field_type: 'text' },
      { name: 'Estimated Value', field_type: 'number' },
      { name: 'Lead Source', field_type: 'dropdown', options: ['Google Ads', 'Organic Search', 'Instagram', 'Facebook', 'Referral', 'Repeat Client', 'Venue Referral', 'Word of Mouth', 'Website Form', 'Phone', 'Email'] },
      { name: 'Client Email', field_type: 'text' },
      { name: 'Client Phone', field_type: 'text' },
      { name: 'Follow-Up Date', field_type: 'date' },
    ],
  },
  marquee_letters: {
    label: 'Marquee Letters Pipeline',
    icon: '💡',
    defaultLists: [
      'Website Inquiry',
      'DM/Text Inquiry',
      'Responded - Need More Info',
      'Proposal/Pricing Sent',
      'Needs Follow-Up',
      'Needs Invoice',
      'Invoice Sent',
      'Paid in Full',
      'Supplies/Prep Needed',
      'Event This Week',
      'Needs Thank You',
      'Thank You Sent / Complete',
      "Didn't Book",
      'Future/On Hold',
      'Template Cards',
    ],
    color: '#f59e0b', // amber
    defaultCustomFields: [
      { name: 'Event Date', field_type: 'date', is_required: true },
      { name: 'Event Type', field_type: 'dropdown', options: ['Birthday', 'Baby Shower', 'Wedding', 'Corporate', 'Grand Opening', 'Graduation', 'Anniversary', 'Holiday', 'School Event', 'Church Event', 'Gender Reveal', 'Prom', 'Other'] },
      { name: 'Venue', field_type: 'text' },
      { name: 'Venue City', field_type: 'text' },
      { name: 'Estimated Value', field_type: 'number' },
      { name: 'Lead Source', field_type: 'dropdown', options: ['Google Ads', 'Organic Search', 'Instagram', 'Facebook', 'Referral', 'Repeat Client', 'Venue Referral', 'Word of Mouth', 'Website Form', 'Phone', 'Email'] },
      { name: 'Client Email', field_type: 'text' },
      { name: 'Client Phone', field_type: 'text' },
      { name: 'Follow-Up Date', field_type: 'date' },
      { name: 'Letter Configuration', field_type: 'text' },
      { name: 'Delivery/Pickup', field_type: 'dropdown', options: ['Delivery', 'Pickup', 'Setup Included'] },
    ],
  },
  private_clients: {
    label: 'Private Clients Pipeline',
    icon: '🎉',
    defaultLists: [
      'Incoming Request',
      'Need More Info',
      'Proposal/Pricing Sent',
      'Needs Follow-Up',
      'Approved - Needs Invoice',
      'Invoice Sent',
      'Needs to Pay Before Event',
      'Paid in Full',
      'Supplies/Prep Needed',
      'Event This Week',
      'Delivered / Installed',
      'Needs Thank You',
      'Thank You Sent / Complete',
      "Didn't Book",
      'On Hold',
      'Recurring/Retainer',
      'Template Cards',
    ],
    color: '#8b5cf6', // purple
    defaultCustomFields: [
      { name: 'Event Date', field_type: 'date', is_required: true },
      { name: 'Client Email', field_type: 'text' },
      { name: 'Client Phone', field_type: 'text' },
      { name: 'Estimated Value', field_type: 'number' },
      { name: 'Payment Status', field_type: 'dropdown', options: ['Unpaid', 'Deposit Paid', 'Paid in Full', 'Overdue'] },
    ],
  },
  owner_dashboard: {
    label: 'Owner Dashboard',
    icon: '👑',
    defaultLists: [
      'Halley Needs to Review',
      'Approved',
      "Tiffany Follow-Up Call List",
      "Tiffany's Questions",
      'Needs Invoice',
      'New Venue Email',
      'Marketing Ideas',
      'Business Admin',
      'Financial Review',
      'Google Ads Review',
      'Social Media Queue',
      'Supplier Reorders',
      'Website Updates',
      'Completed / Archive',
      'Reference / Notes',
    ],
    color: '#ef4444', // red
    defaultCustomFields: [
      { name: 'Priority Level', field_type: 'dropdown', options: ['Urgent', 'This Week', 'This Month', 'Someday'] },
      { name: 'Assigned To', field_type: 'dropdown', options: ['Halley', 'Tiffany', 'Both'] },
      { name: 'Due Date', field_type: 'date' },
    ],
  },
  va_workspace: {
    label: 'VA Workspace',
    icon: '📋',
    defaultLists: [
      'New Inquiries to Process',
      'Responded - Waiting',
      'Ready to Send Proposal',
      'Halley Needs to Review',
      'Halley Wants You to Call',
      'Needs Follow-Up Today',
      'Needs Follow-Up This Week',
      'Send to Halley for Invoice',
      'Invoice Follow-Up',
      "Tiffany's Questions",
      'Social Media Tasks',
      'Email Drafts to Review',
      'Data Entry / Admin',
      'Venue Research',
      'Supplier Tasks',
      'Thank You Cards/Emails',
      'Filing / Organization',
      'Completed Today',
      'Completed This Week',
      'Training / SOPs',
      'Reference / Notes',
    ],
    color: '#10b981', // green
    defaultCustomFields: [
      { name: 'Task Type', field_type: 'dropdown', options: ['Inquiry Response', 'Follow-Up', 'Proposal', 'Data Entry', 'Social Media', 'Research', 'Admin', 'Other'] },
      { name: 'Priority Level', field_type: 'dropdown', options: ['Urgent', 'Today', 'This Week', 'Low Priority'] },
      { name: 'Related Board', field_type: 'dropdown', options: ['Boutique Decor', 'Marquee Letters', 'Private Clients', 'General'] },
    ],
  },
  general_tasks: {
    label: 'General Tasks',
    icon: '✅',
    defaultLists: [
      'To Do',
      'In Progress',
      'Done',
      'Reference',
    ],
    color: '#6366f1', // indigo
    defaultCustomFields: [
      { name: 'Category', field_type: 'dropdown', options: ['Business', 'Personal', 'Idea', 'Other'] },
    ],
  },
};

// Board-specific default labels
export const BALLOON_DEFAULT_LABELS: Partial<Record<BoardType, { name: string; color: string }[]>> = {
  boutique_decor: [
    { name: 'Urgent', color: '#ef4444' },
    { name: 'VIP / Repeat Client', color: '#f59e0b' },
    { name: 'Google Ads', color: '#3b82f6' },
    { name: 'Organic', color: '#10b981' },
    { name: 'Referral', color: '#8b5cf6' },
    { name: 'Busy Weekend', color: '#ec4899' },
    { name: 'Far Location', color: '#6366f1' },
    { name: 'Abandoned Form', color: '#64748b' },
  ],
  marquee_letters: [
    { name: 'Urgent', color: '#ef4444' },
    { name: 'VIP / Repeat Client', color: '#f59e0b' },
    { name: 'Google Ads', color: '#3b82f6' },
    { name: 'Organic', color: '#10b981' },
    { name: 'Referral', color: '#8b5cf6' },
    { name: 'Delivery', color: '#14b8a6' },
    { name: 'Pickup', color: '#6366f1' },
    { name: 'Busy Weekend', color: '#ec4899' },
  ],
  private_clients: [
    { name: 'Urgent', color: '#ef4444' },
    { name: 'VIP / Repeat Client', color: '#f59e0b' },
    { name: 'Payment Overdue', color: '#ef4444' },
    { name: 'Recurring', color: '#10b981' },
    { name: 'Corporate', color: '#3b82f6' },
    { name: 'Referral', color: '#8b5cf6' },
  ],
  owner_dashboard: [
    { name: 'Urgent', color: '#ef4444' },
    { name: 'Revenue', color: '#10b981' },
    { name: 'Marketing', color: '#3b82f6' },
    { name: 'Admin', color: '#6366f1' },
    { name: 'Question for Tiffany', color: '#f59e0b' },
  ],
  va_workspace: [
    { name: 'Urgent', color: '#ef4444' },
    { name: 'Waiting on Client', color: '#f59e0b' },
    { name: 'Waiting on Halley', color: '#8b5cf6' },
    { name: 'Quick Task', color: '#10b981' },
    { name: 'Needs Training', color: '#3b82f6' },
  ],
  general_tasks: [
    { name: 'Urgent', color: '#ef4444' },
    { name: 'Important', color: '#f59e0b' },
    { name: 'Idea', color: '#8b5cf6' },
    { name: 'Quick Win', color: '#10b981' },
  ],
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
  { name: 'Gold', value: '#d97706' },
  { name: 'Slate', value: '#64748b' },
];
