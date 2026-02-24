/**
 * Gmail API helpers using raw fetch (no npm dependency).
 *
 * All functions take a pre-validated access token obtained via token-manager.ts.
 */

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

export interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  payload: {
    headers: { name: string; value: string }[];
    mimeType: string;
    body?: { data?: string; size: number; attachmentId?: string };
    parts?: GmailMessagePart[];
  };
  labelIds: string[];
  internalDate: string;
}

export interface GmailMessagePart {
  partId: string;
  mimeType: string;
  filename: string;
  body: { data?: string; size: number; attachmentId?: string };
  parts?: GmailMessagePart[];
}

export interface GmailSearchResult {
  messages: { id: string; threadId: string }[];
  resultSizeEstimate: number;
  nextPageToken?: string;
}

async function gmailFetch<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GMAIL_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail API ${path} failed: ${res.status} ${text}`);
  }

  return res.json();
}

/**
 * Search sent emails matching a query string.
 * Uses Gmail search syntax: https://support.google.com/mail/answer/7190
 */
export async function searchSentEmails(
  accessToken: string,
  query: string,
  maxResults = 20,
  pageToken?: string,
): Promise<GmailSearchResult> {
  const params = new URLSearchParams({
    q: `in:sent ${query}`,
    maxResults: maxResults.toString(),
    ...(pageToken ? { pageToken } : {}),
  });
  return gmailFetch(accessToken, `/messages?${params}`);
}

/**
 * Fetch a full message by ID.
 */
export async function getMessage(
  accessToken: string,
  messageId: string,
  format: 'full' | 'metadata' | 'minimal' = 'full',
): Promise<GmailMessage> {
  return gmailFetch(accessToken, `/messages/${messageId}?format=${format}`);
}

/**
 * Download an attachment by message + attachment ID.
 * Returns raw base64url-encoded data.
 */
export async function getAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string,
): Promise<{ data: string; size: number }> {
  return gmailFetch(accessToken, `/messages/${messageId}/attachments/${attachmentId}`);
}

/**
 * Extract a header value from a Gmail message.
 */
export function getHeader(message: GmailMessage, name: string): string | undefined {
  return message.payload.headers.find(
    (h) => h.name.toLowerCase() === name.toLowerCase(),
  )?.value;
}

/**
 * Decode base64url-encoded body content to UTF-8 string.
 */
export function decodeBody(data: string): string {
  // Gmail uses URL-safe base64; convert back to standard base64 for atob/Buffer
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

/**
 * Extract the plain-text body from a message (walks MIME parts).
 */
export function extractTextBody(message: GmailMessage): string {
  function findPart(parts: GmailMessagePart[] | undefined, mime: string): string | null {
    if (!parts) return null;
    for (const part of parts) {
      if (part.mimeType === mime && part.body.data) {
        return decodeBody(part.body.data);
      }
      if (part.parts) {
        const nested = findPart(part.parts, mime);
        if (nested) return nested;
      }
    }
    return null;
  }

  // Try text/plain first, then text/html
  if (message.payload.body?.data) {
    return decodeBody(message.payload.body.data);
  }
  return findPart(message.payload.parts, 'text/plain')
    || findPart(message.payload.parts, 'text/html')
    || '';
}

/**
 * Build RFC 2822 email message for Gmail API.
 */
function buildRawEmail(to: string, subject: string, body: string, from?: string): string {
  const lines = [
    `To: ${to}`,
    ...(from ? [`From: ${from}`] : []),
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    body,
  ];
  const raw = lines.join('\r\n');
  return Buffer.from(raw).toString('base64url');
}

/**
 * Create a draft email in the user's Gmail.
 * Returns the draft ID.
 */
export async function createDraft(
  accessToken: string,
  to: string,
  subject: string,
  body: string,
): Promise<{ id: string; message: { id: string; threadId: string } }> {
  return gmailFetch(accessToken, '/drafts', {
    method: 'POST',
    body: JSON.stringify({
      message: { raw: buildRawEmail(to, subject, body) },
    }),
  });
}

/**
 * Send a draft by its draft ID.
 */
export async function sendDraft(
  accessToken: string,
  draftId: string,
): Promise<{ id: string; threadId: string }> {
  return gmailFetch(accessToken, '/drafts/send', {
    method: 'POST',
    body: JSON.stringify({ id: draftId }),
  });
}

/**
 * Send an email directly (skip draft).
 */
export async function sendEmail(
  accessToken: string,
  to: string,
  subject: string,
  body: string,
): Promise<{ id: string; threadId: string }> {
  return gmailFetch(accessToken, '/messages/send', {
    method: 'POST',
    body: JSON.stringify({
      raw: buildRawEmail(to, subject, body),
    }),
  });
}
