/**
 * LinkedIn Browser Automation Client
 *
 * TypeScript client that calls the VPS LinkedIn service (port 8098).
 * Mirrors the pattern from src/lib/integrations/scrapling.ts.
 */

const LINKEDIN_SERVICE_URL = process.env.LINKEDIN_SERVICE_URL || 'http://157.180.37.69:8098';
const REQUEST_TIMEOUT = 120_000; // 2 min for browser actions

// ============================================================================
// TYPES
// ============================================================================

export interface ActionResult {
  success: boolean;
  action_type: string;
  duration_ms: number;
  error?: string;
  data: Record<string, unknown>;
}

export interface SessionHealthResult {
  logged_in: boolean;
  health: 'healthy' | 'degraded' | 'logged_out' | 'blocked' | 'inactive' | 'unknown';
  url?: string;
}

export interface InboxConversation {
  name: string;
  snippet: string;
  unread: boolean;
}

export interface InboxCheckResult {
  conversations: InboxConversation[];
  total_checked: number;
}

export interface PendingConnection {
  name: string;
  linkedin_url: string;
  status: string;
}

export interface PendingConnectionsResult {
  pending: PendingConnection[];
  total_pending: number;
}

export interface BatchMessage {
  lead_id: string;
  message_id: string;
  linkedin_url: string;
  message_text: string;
  action_type: 'connect_with_note' | 'send_message';
  pipeline_stage: string;
}

export interface BatchActionResult {
  lead_id: string;
  message_id: string;
  success: boolean;
  error?: string;
  duration_ms: number;
  data?: Record<string, unknown>;
}

export interface BatchSendResult {
  batch_id: string;
  total: number;
  sent: number;
  failed: number;
  results: BatchActionResult[];
}

export interface ServiceStatus {
  browser_active: boolean;
  daily_counts: { connect: number; message: number; date: string };
  action_counter: number;
  last_action_at: string | null;
  emergency_stopped: boolean;
  idle_timeout_s: number;
}

// ============================================================================
// INTERNAL FETCH HELPER
// ============================================================================

async function callService<T>(
  path: string,
  method: 'GET' | 'POST' = 'POST',
  body?: Record<string, unknown>,
  timeoutMs: number = REQUEST_TIMEOUT,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${LINKEDIN_SERVICE_URL}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`LinkedIn service ${path} returned ${res.status}: ${text}`);
    }

    return await res.json() as T;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`LinkedIn service ${path} timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Check if the LinkedIn automation service is reachable.
 */
export async function isLinkedInServiceAvailable(): Promise<boolean> {
  try {
    const result = await callService<{ status: string }>('/health', 'GET', undefined, 5000);
    return result.status === 'ok';
  } catch {
    return false;
  }
}

/**
 * Get the current status of the LinkedIn service.
 */
export async function getServiceStatus(): Promise<ServiceStatus> {
  return callService<ServiceStatus>('/status', 'GET', undefined, 5000);
}

/**
 * Initialize a browser session (or reuse existing).
 */
export async function initSession(sessionId: string = 'default', headless: boolean = true): Promise<void> {
  await callService('/session/init', 'POST', { session_id: sessionId, headless });
}

/**
 * Check session health - is the browser logged into LinkedIn?
 */
export async function getSessionHealth(): Promise<SessionHealthResult> {
  const result = await callService<ActionResult>('/session/health', 'POST', undefined, 30_000);
  return {
    logged_in: result.data?.logged_in === true,
    health: (result.data?.health as SessionHealthResult['health']) || 'unknown',
    url: result.data?.url as string,
  };
}

/**
 * Send a connection request with a note.
 */
export async function sendConnectionRequest(params: {
  linkedinUrl: string;
  noteText: string;
  sessionId?: string;
}): Promise<ActionResult> {
  return callService<ActionResult>('/action/connect', 'POST', {
    linkedin_url: params.linkedinUrl,
    note_text: params.noteText,
    session_id: params.sessionId || 'default',
  });
}

/**
 * Send a message to an existing connection.
 */
export async function sendMessage(params: {
  linkedinUrl: string;
  messageText: string;
  sessionId?: string;
}): Promise<ActionResult> {
  return callService<ActionResult>('/action/message', 'POST', {
    linkedin_url: params.linkedinUrl,
    message_text: params.messageText,
    session_id: params.sessionId || 'default',
  });
}

/**
 * Check LinkedIn inbox for new messages/replies.
 */
export async function checkInbox(): Promise<InboxCheckResult> {
  const result = await callService<ActionResult>('/action/check-inbox', 'POST', undefined, 60_000);
  return {
    conversations: (result.data?.conversations as InboxConversation[]) || [],
    total_checked: (result.data?.total_checked as number) || 0,
  };
}

/**
 * Check pending connection request statuses.
 */
export async function checkPendingConnections(): Promise<PendingConnectionsResult> {
  const result = await callService<ActionResult>('/action/check-pending', 'POST', undefined, 60_000);
  return {
    pending: (result.data?.pending as PendingConnection[]) || [],
    total_pending: (result.data?.total_pending as number) || 0,
  };
}

/**
 * Process an approved batch - send all messages sequentially via browser.
 * This is a long-running call (minutes to complete).
 */
export async function executeBatchSend(
  batchId: string,
  messages: BatchMessage[],
  options?: {
    sessionId?: string;
    minDelayMs?: number;
    maxDelayMs?: number;
  }
): Promise<BatchSendResult> {
  // Long timeout: worst case 25 messages * 2 min each + breaks
  const timeout = Math.max(messages.length * 150_000, 600_000);
  return callService<BatchSendResult>('/batch/send', 'POST', {
    batch_id: batchId,
    messages,
    session_id: options?.sessionId || 'default',
    min_delay_ms: options?.minDelayMs || 45000,
    max_delay_ms: options?.maxDelayMs || 120000,
  }, timeout);
}

/**
 * Emergency stop - kill browser and halt all actions.
 */
export async function emergencyStop(): Promise<void> {
  await callService('/emergency-stop', 'POST', undefined, 10_000);
}
