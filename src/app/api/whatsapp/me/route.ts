import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getWhatsAppUser, updateWhatsAppUser, unlinkPhone } from '@/lib/whatsapp';

/**
 * GET /api/whatsapp/me
 * Get the current user's WhatsApp profile.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  const waUser = await getWhatsAppUser(supabase, userId);

  if (!waUser) {
    return successResponse(null);
  }

  return successResponse(waUser);
}

interface UpdateSettingsBody {
  dnd_start?: string | null;
  dnd_end?: string | null;
  opt_out?: boolean;
  frequency_cap_per_hour?: number;
  display_name?: string | null;
}

/**
 * PATCH /api/whatsapp/me
 * Update WhatsApp settings: DND window, frequency cap, opt-out, display name.
 */
export async function PATCH(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<UpdateSettingsBody>(request);
  if (!parsed.ok) return parsed.response;

  const { dnd_start, dnd_end, opt_out, frequency_cap_per_hour, display_name } = parsed.body;

  // Validate DND times if provided
  const timeRegex = /^\d{2}:\d{2}$/;
  if (dnd_start !== undefined && dnd_start !== null && !timeRegex.test(dnd_start)) {
    return errorResponse('dnd_start must be in HH:MM format');
  }
  if (dnd_end !== undefined && dnd_end !== null && !timeRegex.test(dnd_end)) {
    return errorResponse('dnd_end must be in HH:MM format');
  }

  // Validate frequency cap
  if (frequency_cap_per_hour !== undefined) {
    if (typeof frequency_cap_per_hour !== 'number' || frequency_cap_per_hour < 1 || frequency_cap_per_hour > 100) {
      return errorResponse('frequency_cap_per_hour must be a number between 1 and 100');
    }
  }

  const { supabase, userId } = auth.ctx;

  const updates: Record<string, unknown> = {};
  if (dnd_start !== undefined) updates.dnd_start = dnd_start;
  if (dnd_end !== undefined) updates.dnd_end = dnd_end;
  if (opt_out !== undefined) updates.opt_out = opt_out;
  if (frequency_cap_per_hour !== undefined) updates.frequency_cap_per_hour = frequency_cap_per_hour;
  if (display_name !== undefined) updates.display_name = display_name;

  if (Object.keys(updates).length === 0) {
    return errorResponse('No fields to update');
  }

  const updated = await updateWhatsAppUser(supabase, userId, updates);

  if (!updated) {
    return errorResponse('WhatsApp profile not found or update failed', 404);
  }

  return successResponse(updated);
}

/**
 * DELETE /api/whatsapp/me
 * Unlink the current user's WhatsApp phone number.
 */
export async function DELETE() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  await unlinkPhone(supabase, userId);

  return successResponse({ unlinked: true });
}
