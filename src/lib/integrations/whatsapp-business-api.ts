import { SupabaseClient } from '@supabase/supabase-js';
import type { WhatsAppConfig, WhatsAppMediaType } from '../types';

// ============================================================================
// META WHATSAPP BUSINESS API CLIENT
// ============================================================================

const META_API_BASE = 'https://graph.facebook.com/v21.0';
const MAX_MESSAGE_RATE = 80; // Meta tier 1 limit per second

export interface SendMessageResult {
  success: boolean;
  messageId: string | null;
  error: string | null;
}

export interface MediaUploadResult {
  success: boolean;
  mediaId: string | null;
  error: string | null;
}

/**
 * Get the active WhatsApp Business API config.
 */
export async function getWhatsAppConfig(
  supabase: SupabaseClient
): Promise<WhatsAppConfig | null> {
  const { data } = await supabase
    .from('whatsapp_config')
    .select('*')
    .eq('is_active', true)
    .limit(1)
    .single();

  return data as WhatsAppConfig | null;
}

/**
 * Build the Meta API URL for a phone number.
 */
export function buildApiUrl(phoneNumberId: string, path: string): string {
  return `${META_API_BASE}/${phoneNumberId}/${path}`;
}

/**
 * Build authorization headers for Meta API.
 */
export function buildHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Send a text message via WhatsApp Business API.
 */
export async function sendTextMessage(
  config: WhatsAppConfig,
  phone: string,
  text: string
): Promise<SendMessageResult> {
  try {
    const url = buildApiUrl(config.phone_number_id, 'messages');
    const response = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(config.access_token),
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'text',
        text: { body: text },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData?.error?.message || `HTTP ${response.status}`;
      return { success: false, messageId: null, error: errorMsg };
    }

    const data = await response.json();
    const messageId = data.messages?.[0]?.id ?? null;

    return { success: true, messageId, error: null };
  } catch (err) {
    return {
      success: false,
      messageId: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Send a template message (HSM) via WhatsApp Business API.
 * Templates must be pre-approved by Meta.
 */
export async function sendTemplateMessage(
  config: WhatsAppConfig,
  phone: string,
  templateName: string,
  languageCode: string = 'en',
  parameters: Array<{ type: 'text'; text: string }> = []
): Promise<SendMessageResult> {
  try {
    const url = buildApiUrl(config.phone_number_id, 'messages');

    const components = parameters.length > 0
      ? [{
          type: 'body',
          parameters: parameters.map((p) => ({ type: p.type, text: p.text })),
        }]
      : undefined;

    const response = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(config.access_token),
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          components,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { success: false, messageId: null, error: errorData?.error?.message || `HTTP ${response.status}` };
    }

    const data = await response.json();
    return { success: true, messageId: data.messages?.[0]?.id ?? null, error: null };
  } catch (err) {
    return { success: false, messageId: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Send a media message (image, video, document) via WhatsApp Business API.
 */
export async function sendMediaMessage(
  config: WhatsAppConfig,
  phone: string,
  mediaType: WhatsAppMediaType,
  mediaUrl: string,
  caption?: string
): Promise<SendMessageResult> {
  try {
    const url = buildApiUrl(config.phone_number_id, 'messages');

    const mediaPayload: Record<string, string> = { link: mediaUrl };
    if (caption) mediaPayload.caption = caption;

    const response = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(config.access_token),
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: mediaType,
        [mediaType]: mediaPayload,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { success: false, messageId: null, error: errorData?.error?.message || `HTTP ${response.status}` };
    }

    const data = await response.json();
    return { success: true, messageId: data.messages?.[0]?.id ?? null, error: null };
  } catch (err) {
    return { success: false, messageId: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Upload media to Meta for sending.
 */
export async function uploadMedia(
  config: WhatsAppConfig,
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<MediaUploadResult> {
  try {
    const url = buildApiUrl(config.phone_number_id, 'media');

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
    formData.append('file', blob, filename);
    formData.append('messaging_product', 'whatsapp');
    formData.append('type', mimeType);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.access_token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { success: false, mediaId: null, error: errorData?.error?.message || `HTTP ${response.status}` };
    }

    const data = await response.json();
    return { success: true, mediaId: data.id ?? null, error: null };
  } catch (err) {
    return { success: false, mediaId: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Get message delivery status from Meta API.
 */
export async function getMessageStatus(
  config: WhatsAppConfig,
  messageId: string
): Promise<{ status: string | null; error: string | null }> {
  try {
    const url = `${META_API_BASE}/${messageId}`;
    const response = await fetch(url, {
      headers: buildHeaders(config.access_token),
    });

    if (!response.ok) {
      return { status: null, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    return { status: data.status ?? null, error: null };
  } catch (err) {
    return { status: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Verify a Meta webhook challenge (used in GET handler).
 */
export function verifyWebhookChallenge(
  mode: string | null,
  token: string | null,
  challenge: string | null,
  expectedToken: string
): { valid: boolean; challenge: string | null } {
  if (mode === 'subscribe' && token === expectedToken) {
    return { valid: true, challenge };
  }
  return { valid: false, challenge: null };
}

/**
 * Verify webhook signature from Meta.
 */
export async function verifyWebhookSignature(
  payload: string,
  signature: string | null,
  appSecret: string
): Promise<boolean> {
  if (!signature) return false;

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(appSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signed = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(payload)
    );

    const expected = `sha256=${Array.from(new Uint8Array(signed)).map((b) => b.toString(16).padStart(2, '0')).join('')}`;
    return expected === signature;
  } catch {
    return false;
  }
}

/**
 * Process a webhook status update - updates the message record in DB.
 */
export async function processStatusUpdate(
  supabase: SupabaseClient,
  status: string,
  externalId: string,
  timestamp: string,
  errors?: Array<{ code: number; title: string }>
): Promise<void> {
  const updates: Record<string, unknown> = {};

  switch (status) {
    case 'delivered':
      updates.status = 'delivered';
      updates.delivered_at = new Date(parseInt(timestamp) * 1000).toISOString();
      break;
    case 'read':
      updates.status = 'read';
      updates.read_at = new Date(parseInt(timestamp) * 1000).toISOString();
      break;
    case 'failed':
      updates.status = 'failed';
      updates.failed_at = new Date(parseInt(timestamp) * 1000).toISOString();
      updates.failure_reason = errors?.[0]?.title ?? 'Unknown error';
      break;
    case 'sent':
      updates.status = 'sent';
      break;
    default:
      return;
  }

  await supabase
    .from('whatsapp_messages')
    .update(updates)
    .eq('external_id', externalId);
}

/**
 * Log a sent message to the database.
 */
export async function logOutboundMessage(
  supabase: SupabaseClient,
  params: {
    userId: string;
    phone: string;
    content: string;
    messageType: string;
    externalId: string | null;
    mediaUrl?: string;
    mediaType?: WhatsAppMediaType;
  }
): Promise<void> {
  // Find the whatsapp_user by phone
  const { data: waUser } = await supabase
    .from('whatsapp_users')
    .select('id')
    .eq('phone_number', params.phone)
    .limit(1)
    .single();

  await supabase.from('whatsapp_messages').insert({
    whatsapp_user_id: waUser?.id ?? null,
    profile_id: params.userId,
    direction: 'outbound',
    message_type: params.messageType,
    content: params.content,
    external_id: params.externalId,
    status: params.externalId ? 'sent' : 'pending',
    media_url: params.mediaUrl ?? null,
    media_type: params.mediaType ?? null,
  });
}

/**
 * Sync a WhatsApp group's members when board membership changes.
 */
export async function syncGroupMembers(
  supabase: SupabaseClient,
  boardId: string
): Promise<{ added: number; removed: number }> {
  // Get board members with WhatsApp numbers
  const { data: members } = await supabase
    .from('board_members')
    .select('profile_id, profiles(id, whatsapp_users(phone_number))')
    .eq('board_id', boardId);

  if (!members) return { added: 0, removed: 0 };

  // Get WhatsApp group for this board
  const { data: group } = await supabase
    .from('whatsapp_groups')
    .select('*')
    .eq('board_id', boardId)
    .limit(1)
    .single();

  if (!group || !group.whatsapp_group_id) return { added: 0, removed: 0 };

  // Get current group members
  const { data: currentMembers } = await supabase
    .from('whatsapp_group_members')
    .select('whatsapp_user_id')
    .eq('group_id', group.id);

  const currentMemberIds = new Set((currentMembers ?? []).map((m: { whatsapp_user_id: string }) => m.whatsapp_user_id));

  let added = 0;
  let removed = 0;

  // Add new members
  for (const member of members) {
    const profile = member.profiles as unknown as { id: string; whatsapp_users: Array<{ phone_number: string }> };
    if (!profile?.whatsapp_users?.[0]) continue;

    const { data: waUser } = await supabase
      .from('whatsapp_users')
      .select('id')
      .eq('phone_number', profile.whatsapp_users[0].phone_number)
      .limit(1)
      .single();

    if (waUser && !currentMemberIds.has(waUser.id)) {
      await supabase.from('whatsapp_group_members').insert({
        group_id: group.id,
        whatsapp_user_id: waUser.id,
      });
      added++;
    }
  }

  return { added, removed };
}

/**
 * Media size limits per type (Meta Business API limits).
 */
export const MEDIA_SIZE_LIMITS: Record<WhatsAppMediaType, number> = {
  image: 5 * 1024 * 1024,        // 5MB
  video: 16 * 1024 * 1024,       // 16MB
  document: 100 * 1024 * 1024,   // 100MB
  audio: 16 * 1024 * 1024,       // 16MB
};

/**
 * Validate media file before sending.
 */
export function validateMedia(
  size: number,
  mimeType: string,
  mediaType: WhatsAppMediaType
): { valid: boolean; error: string | null } {
  const limit = MEDIA_SIZE_LIMITS[mediaType];
  if (size > limit) {
    return {
      valid: false,
      error: `File size ${Math.round(size / 1024 / 1024)}MB exceeds ${Math.round(limit / 1024 / 1024)}MB limit for ${mediaType}`,
    };
  }

  // Basic MIME type validation
  const allowedMimes: Record<WhatsAppMediaType, string[]> = {
    image: ['image/jpeg', 'image/png', 'image/webp'],
    video: ['video/mp4', 'video/3gpp'],
    document: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    audio: ['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg'],
  };

  if (!allowedMimes[mediaType].includes(mimeType)) {
    return { valid: false, error: `MIME type ${mimeType} is not supported for ${mediaType}` };
  }

  return { valid: true, error: null };
}
