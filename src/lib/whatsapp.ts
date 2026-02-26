import { SupabaseClient } from '@supabase/supabase-js';
import type {
  WhatsAppUser,
  WhatsAppGroup,
  WhatsAppMessage,
  WhatsAppQuickAction,
  WhatsAppDigestConfig,
  WhatsAppNotificationLog,
} from './types';

// ============================================================================
// PHONE LINKING & VERIFICATION
// ============================================================================

export async function linkPhone(
  supabase: SupabaseClient,
  userId: string,
  phoneNumber: string,
  displayName?: string
): Promise<WhatsAppUser | null> {
  const code = generateVerificationCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

  const { data, error } = await supabase
    .from('whatsapp_users')
    .upsert({
      user_id: userId,
      phone_number: phoneNumber,
      display_name: displayName ?? null,
      verification_code: code,
      verification_expires_at: expiresAt,
      phone_verified: false,
    })
    .select()
    .single();

  if (error) return null;

  // Send verification code via WhatsApp (placeholder)
  await sendWhatsAppMessage(supabase, {
    phoneNumber,
    content: `Your Kivi Media verification code is: ${code}`,
    messageType: 'verification',
  });

  return data as WhatsAppUser;
}

export async function verifyPhone(
  supabase: SupabaseClient,
  userId: string,
  code: string
): Promise<boolean> {
  const { data: user } = await supabase
    .from('whatsapp_users')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!user) return false;
  if (user.verification_code !== code) return false;
  if (new Date(user.verification_expires_at) < new Date()) return false;

  await supabase
    .from('whatsapp_users')
    .update({
      phone_verified: true,
      verification_code: null,
      verification_expires_at: null,
    })
    .eq('user_id', userId);

  return true;
}

export function generateVerificationCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function getWhatsAppUser(
  supabase: SupabaseClient,
  userId: string
): Promise<WhatsAppUser | null> {
  const { data } = await supabase
    .from('whatsapp_users')
    .select('*')
    .eq('user_id', userId)
    .single();

  return data as WhatsAppUser | null;
}

export async function updateWhatsAppUser(
  supabase: SupabaseClient,
  userId: string,
  updates: Partial<Pick<WhatsAppUser, 'display_name' | 'dnd_start' | 'dnd_end' | 'opt_out' | 'frequency_cap_per_hour' | 'is_active'>>
): Promise<WhatsAppUser | null> {
  const { data, error } = await supabase
    .from('whatsapp_users')
    .update(updates)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) return null;
  return data as WhatsAppUser;
}

export async function unlinkPhone(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  await supabase.from('whatsapp_users').delete().eq('user_id', userId);
}

// ============================================================================
// DND / THROTTLING
// ============================================================================

export function isInDNDWindow(user: WhatsAppUser): boolean {
  if (!user.dnd_start || !user.dnd_end) return false;

  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  if (user.dnd_start <= user.dnd_end) {
    return currentTime >= user.dnd_start && currentTime <= user.dnd_end;
  }
  // Wraps midnight (e.g., 22:00 - 07:00)
  return currentTime >= user.dnd_start || currentTime <= user.dnd_end;
}

export async function isThrottled(
  supabase: SupabaseClient,
  whatsappUserId: string,
  capPerHour: number
): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count } = await supabase
    .from('whatsapp_messages')
    .select('id', { count: 'exact', head: true })
    .eq('whatsapp_user_id', whatsappUserId)
    .eq('direction', 'outbound')
    .gte('created_at', oneHourAgo);

  return (count ?? 0) >= capPerHour;
}

// ============================================================================
// GROUPS
// ============================================================================

export async function getWhatsAppGroups(
  supabase: SupabaseClient,
  boardId?: string
): Promise<WhatsAppGroup[]> {
  let query = supabase.from('whatsapp_groups').select('*').order('created_at', { ascending: false });
  if (boardId) query = query.eq('board_id', boardId);

  const { data } = await query;
  return (data as WhatsAppGroup[]) ?? [];
}

export async function createWhatsAppGroup(
  supabase: SupabaseClient,
  group: { boardId?: string; department?: string; groupName: string; whatsappGroupId?: string }
): Promise<WhatsAppGroup | null> {
  const { data, error } = await supabase
    .from('whatsapp_groups')
    .insert({
      board_id: group.boardId ?? null,
      department: group.department ?? null,
      group_name: group.groupName,
      whatsapp_group_id: group.whatsappGroupId ?? null,
    })
    .select()
    .single();

  if (error) return null;
  return data as WhatsAppGroup;
}

export async function deleteWhatsAppGroup(
  supabase: SupabaseClient,
  groupId: string
): Promise<void> {
  await supabase.from('whatsapp_groups').delete().eq('id', groupId);
}

// ============================================================================
// MESSAGES
// ============================================================================

export async function sendWhatsAppMessage(
  supabase: SupabaseClient,
  message: {
    phoneNumber?: string;
    whatsappUserId?: string;
    groupId?: string;
    content: string;
    messageType: string;
    cardId?: string;
    boardId?: string;
  }
): Promise<WhatsAppMessage | null> {
  // Placeholder: would call Meta WhatsApp Business API
  const { data, error } = await supabase
    .from('whatsapp_messages')
    .insert({
      whatsapp_user_id: message.whatsappUserId ?? null,
      group_id: message.groupId ?? null,
      direction: 'outbound',
      message_type: message.messageType,
      content: message.content,
      card_id: message.cardId ?? null,
      board_id: message.boardId ?? null,
      status: 'pending',
    })
    .select()
    .single();

  if (error) return null;
  return data as WhatsAppMessage;
}

export async function getMessages(
  supabase: SupabaseClient,
  filters?: { whatsappUserId?: string; groupId?: string; messageType?: string; limit?: number }
): Promise<WhatsAppMessage[]> {
  let query = supabase
    .from('whatsapp_messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(filters?.limit ?? 50);

  if (filters?.whatsappUserId) query = query.eq('whatsapp_user_id', filters.whatsappUserId);
  if (filters?.groupId) query = query.eq('group_id', filters.groupId);
  if (filters?.messageType) query = query.eq('message_type', filters.messageType);

  const { data } = await query;
  return (data as WhatsAppMessage[]) ?? [];
}

// ============================================================================
// QUICK ACTIONS
// ============================================================================

export async function getQuickActions(
  supabase: SupabaseClient
): Promise<WhatsAppQuickAction[]> {
  const { data } = await supabase
    .from('whatsapp_quick_actions')
    .select('*')
    .eq('is_active', true)
    .order('keyword', { ascending: true });

  return (data as WhatsAppQuickAction[]) ?? [];
}

export async function processQuickAction(
  supabase: SupabaseClient,
  keyword: string,
  cardId: string,
  userId: string
): Promise<{ success: boolean; action?: string; error?: string }> {
  const { data: action } = await supabase
    .from('whatsapp_quick_actions')
    .select('*')
    .eq('keyword', keyword.toLowerCase().trim())
    .eq('is_active', true)
    .single();

  if (!action) return { success: false, error: `Unknown command: ${keyword}` };

  switch (action.action_type) {
    case 'mark_done': {
      // Move card to last column on its board
      const { data: placement } = await supabase
        .from('card_placements')
        .select('board_id')
        .eq('card_id', cardId)
        .limit(1)
        .single();

      if (placement) {
        const { data: lastList } = await supabase
          .from('lists')
          .select('id')
          .eq('board_id', placement.board_id)
          .order('position', { ascending: false })
          .limit(1)
          .single();

        if (lastList) {
          await supabase
            .from('card_placements')
            .update({ list_id: lastList.id })
            .eq('card_id', cardId);
        }
      }
      return { success: true, action: 'mark_done' };
    }
    case 'approve':
      await supabase.from('cards').update({ approval_status: 'approved' }).eq('id', cardId);
      return { success: true, action: 'approve' };
    case 'reject':
      await supabase.from('cards').update({ approval_status: 'rejected' }).eq('id', cardId);
      return { success: true, action: 'reject' };
    case 'snooze':
      void userId;
      return { success: true, action: 'snooze' };
    default:
      return { success: false, error: `Unsupported action: ${action.action_type}` };
  }
}

export async function createQuickAction(
  supabase: SupabaseClient,
  action: { keyword: string; actionType: string; description?: string; actionConfig?: Record<string, unknown> }
): Promise<WhatsAppQuickAction | null> {
  const { data, error } = await supabase
    .from('whatsapp_quick_actions')
    .insert({
      keyword: action.keyword.toLowerCase().trim(),
      action_type: action.actionType,
      description: action.description ?? null,
      action_config: action.actionConfig ?? {},
    })
    .select()
    .single();

  if (error) return null;
  return data as WhatsAppQuickAction;
}

export async function deleteQuickAction(
  supabase: SupabaseClient,
  actionId: string
): Promise<void> {
  await supabase.from('whatsapp_quick_actions').delete().eq('id', actionId);
}

// ============================================================================
// DIGEST CONFIG
// ============================================================================

export async function getDigestConfig(
  supabase: SupabaseClient,
  userId: string
): Promise<WhatsAppDigestConfig | null> {
  const { data } = await supabase
    .from('whatsapp_digest_config')
    .select('*')
    .eq('user_id', userId)
    .single();

  return data as WhatsAppDigestConfig | null;
}

export async function upsertDigestConfig(
  supabase: SupabaseClient,
  userId: string,
  config: Partial<Omit<WhatsAppDigestConfig, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
): Promise<WhatsAppDigestConfig | null> {
  const { data, error } = await supabase
    .from('whatsapp_digest_config')
    .upsert({
      user_id: userId,
      ...config,
    })
    .select()
    .single();

  if (error) return null;
  return data as WhatsAppDigestConfig;
}

// ============================================================================
// NOTIFICATION DISPATCH
// ============================================================================

export async function dispatchNotification(
  supabase: SupabaseClient,
  params: {
    userId: string;
    notificationId?: string;
    eventType: string;
    content: string;
    cardId?: string;
    boardId?: string;
  }
): Promise<WhatsAppNotificationLog | null> {
  const waUser = await getWhatsAppUser(supabase, params.userId);
  if (!waUser || !waUser.phone_verified || waUser.opt_out || !waUser.is_active) {
    return null;
  }

  // Check DND
  if (isInDNDWindow(waUser)) {
    const { data: log } = await supabase
      .from('whatsapp_notification_log')
      .insert({
        notification_id: params.notificationId ?? null,
        whatsapp_user_id: waUser.id,
        event_type: params.eventType,
        throttled: true,
        throttle_reason: 'DND window active',
      })
      .select()
      .single();
    return log as WhatsAppNotificationLog;
  }

  // Check throttle
  const throttled = await isThrottled(supabase, waUser.id, waUser.frequency_cap_per_hour);
  if (throttled) {
    const { data: log } = await supabase
      .from('whatsapp_notification_log')
      .insert({
        notification_id: params.notificationId ?? null,
        whatsapp_user_id: waUser.id,
        event_type: params.eventType,
        throttled: true,
        throttle_reason: 'Frequency cap exceeded',
      })
      .select()
      .single();
    return log as WhatsAppNotificationLog;
  }

  // Send message
  const message = await sendWhatsAppMessage(supabase, {
    whatsappUserId: waUser.id,
    content: params.content,
    messageType: 'notification',
    cardId: params.cardId,
    boardId: params.boardId,
  });

  const { data: log } = await supabase
    .from('whatsapp_notification_log')
    .insert({
      notification_id: params.notificationId ?? null,
      whatsapp_user_id: waUser.id,
      message_id: message?.id ?? null,
      event_type: params.eventType,
      throttled: false,
    })
    .select()
    .single();

  return log as WhatsAppNotificationLog;
}

export async function getNotificationLog(
  supabase: SupabaseClient,
  whatsappUserId: string,
  limit?: number
): Promise<WhatsAppNotificationLog[]> {
  const { data } = await supabase
    .from('whatsapp_notification_log')
    .select('*')
    .eq('whatsapp_user_id', whatsappUserId)
    .order('created_at', { ascending: false })
    .limit(limit ?? 50);

  return (data as WhatsAppNotificationLog[]) ?? [];
}
