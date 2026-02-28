import crypto from 'crypto';

// ============================================================================
// FATHOM VIDEO API CLIENT
// Base URL: https://api.fathom.ai/external/v1
// Auth: X-Api-Key header
// Rate limit: 60 calls/minute
// ============================================================================

const FATHOM_BASE = 'https://api.fathom.ai/external/v1';

// --- Types ---

export interface FathomSpeaker {
  display_name: string;
  matched_calendar_invitee_email: string | null;
}

export interface FathomTranscriptEntry {
  speaker: FathomSpeaker;
  text: string;
  timestamp: string; // HH:MM:SS
}

export interface FathomSummary {
  template_name: string | null;
  markdown_formatted: string | null;
}

export interface FathomActionItem {
  text: string;
  assignee?: string;
  completed?: boolean;
}

export interface FathomCalendarInvitee {
  name: string;
  email: string;
  is_external: boolean;
}

export interface FathomRecordedBy {
  name?: string;
  email?: string;
}

export interface FathomMeeting {
  title: string;
  meeting_title: string | null;
  recording_id: number;
  url: string;
  share_url: string;
  created_at: string;
  scheduled_start_time?: string;
  scheduled_end_time?: string;
  recording_start_time?: string;
  recording_end_time?: string;
  transcript_language?: string;
  transcript?: FathomTranscriptEntry[];
  default_summary?: FathomSummary;
  action_items?: FathomActionItem[];
  calendar_invitees?: FathomCalendarInvitee[];
  recorded_by?: FathomRecordedBy;
}

export interface FathomMeetingsResponse {
  limit: number;
  next_cursor: string | null;
  items: FathomMeeting[];
}

export interface FathomWebhookPayload {
  recording_id: number;
  url: string;
  share_url: string;
  type: string; // 'meeting_content_ready'
}

// --- API Client ---

async function fathomFetch<T>(path: string, params?: Record<string, string | boolean>): Promise<T> {
  const apiKey = process.env.FATHOM_API_KEY;
  if (!apiKey) throw new Error('FATHOM_API_KEY not configured');

  const url = new URL(`${FATHOM_BASE}${path}`);
  if (params) {
    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined && val !== null) {
        url.searchParams.set(key, String(val));
      }
    }
  }

  const res = await fetch(url.toString(), {
    headers: {
      'X-Api-Key': apiKey,
      'Accept': 'application/json',
    },
  });

  if (res.status === 429) {
    // Rate limited - wait and retry once
    await new Promise(r => setTimeout(r, 2000));
    const retry = await fetch(url.toString(), {
      headers: { 'X-Api-Key': apiKey, 'Accept': 'application/json' },
    });
    if (!retry.ok) throw new Error(`Fathom API error ${retry.status}: ${await retry.text()}`);
    return retry.json();
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Fathom API error ${res.status}: ${body}`);
  }

  return res.json();
}

/**
 * List meetings with optional filters and included data.
 */
export async function listMeetings(options: {
  cursor?: string;
  createdAfter?: string;
  createdBefore?: string;
  includeTranscript?: boolean;
  includeSummary?: boolean;
  includeActionItems?: boolean;
} = {}): Promise<FathomMeetingsResponse> {
  const params: Record<string, string | boolean> = {};
  if (options.cursor) params.cursor = options.cursor;
  if (options.createdAfter) params.created_after = options.createdAfter;
  if (options.createdBefore) params.created_before = options.createdBefore;
  if (options.includeTranscript) params.include_transcript = 'true';
  if (options.includeSummary) params.include_summary = 'true';
  if (options.includeActionItems) params.include_action_items = 'true';

  return fathomFetch<FathomMeetingsResponse>('/meetings', params);
}

/**
 * Fetch all meetings with auto-pagination.
 */
export async function listAllMeetings(options: {
  createdAfter?: string;
  createdBefore?: string;
  includeTranscript?: boolean;
  includeSummary?: boolean;
  includeActionItems?: boolean;
  maxPages?: number;
} = {}): Promise<FathomMeeting[]> {
  const all: FathomMeeting[] = [];
  let cursor: string | undefined;
  let pages = 0;
  const maxPages = options.maxPages || 50;

  do {
    const res = await listMeetings({ ...options, cursor });
    all.push(...res.items);
    cursor = res.next_cursor || undefined;
    pages++;
  } while (cursor && pages < maxPages);

  return all;
}

/**
 * Get transcript for a specific recording.
 */
export async function getTranscript(recordingId: number): Promise<FathomTranscriptEntry[]> {
  const res = await fathomFetch<{ transcript: FathomTranscriptEntry[] }>(
    `/recordings/${recordingId}/transcript`
  );
  return res.transcript;
}

/**
 * Get summary for a specific recording.
 */
export async function getSummary(recordingId: number): Promise<FathomSummary> {
  const res = await fathomFetch<{ summary: FathomSummary }>(
    `/recordings/${recordingId}/summary`
  );
  return res.summary;
}

// --- Webhook Signature Verification ---

/**
 * Verify Fathom webhook signature using HMAC-SHA256.
 * Secret format: whsec_[base64_encoded_value]
 * Signed content: ${webhook-id}.${webhook-timestamp}.${raw_body}
 */
export function verifyWebhookSignature(
  rawBody: string,
  headers: { 'webhook-id'?: string; 'webhook-timestamp'?: string; 'webhook-signature'?: string }
): boolean {
  const secret = process.env.FATHOM_WEBHOOK_SECRET;
  if (!secret) throw new Error('FATHOM_WEBHOOK_SECRET not configured');

  const webhookId = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const signature = headers['webhook-signature'];

  if (!webhookId || !timestamp || !signature) return false;

  // Validate timestamp (within 5 minutes)
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(now - ts) > 300) return false;

  // Decode secret (strip whsec_ prefix, base64 decode)
  const secretBytes = Buffer.from(secret.replace('whsec_', ''), 'base64');

  // Compute expected signature
  const signedContent = `${webhookId}.${timestamp}.${rawBody}`;
  const computed = crypto
    .createHmac('sha256', secretBytes)
    .update(signedContent)
    .digest('base64');

  // Compare against all provided signatures (space-delimited, with version prefixes like v1,)
  const providedSigs = signature.split(' ');
  for (const sig of providedSigs) {
    const sigValue = sig.includes(',') ? sig.split(',')[1] : sig;
    try {
      if (crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(sigValue))) {
        return true;
      }
    } catch {
      // Length mismatch, continue
    }
  }

  return false;
}

// --- Helpers ---

/**
 * Calculate meeting duration from start/end times.
 */
export function calcDuration(startTime?: string, endTime?: string): number | null {
  if (!startTime || !endTime) return null;
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  if (isNaN(start) || isNaN(end)) return null;
  return Math.round((end - start) / 1000);
}

/**
 * Convert transcript array to plain text for embedding/search.
 */
export function transcriptToText(transcript: FathomTranscriptEntry[]): string {
  return transcript
    .map(e => `[${e.timestamp}] ${e.speaker.display_name}: ${e.text}`)
    .join('\n');
}
