import { SupabaseClient } from '@supabase/supabase-js';
import type { DigestConfig } from './types';

export interface DigestData {
  userName: string;
  assignedCards: { title: string; boardName: string; dueDate: string | null; priority: string }[];
  overdueCards: { title: string; boardName: string; dueDate: string }[];
  mentionedComments: { cardTitle: string; commenterName: string; content: string }[];
  completedCards: { title: string; boardName: string }[];
}

export async function getDigestConfig(
  supabase: SupabaseClient,
  userId: string
): Promise<DigestConfig | null> {
  const { data } = await supabase
    .from('digest_configs')
    .select('*')
    .eq('user_id', userId)
    .single();

  return data as DigestConfig | null;
}

export async function upsertDigestConfig(
  supabase: SupabaseClient,
  userId: string,
  config: Partial<Omit<DigestConfig, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
): Promise<DigestConfig | null> {
  const { data } = await supabase
    .from('digest_configs')
    .upsert(
      { user_id: userId, ...config },
      { onConflict: 'user_id' }
    )
    .select()
    .single();

  return data as DigestConfig | null;
}

export function buildDigestEmail(data: DigestData): { subject: string; html: string } {
  const subject = `Your Daily Digest — ${data.assignedCards.length} tasks, ${data.overdueCards.length} overdue`;

  const overdueSection = data.overdueCards.length > 0
    ? `<h3 style="color:#ef4444;">Overdue (${data.overdueCards.length})</h3><ul>${
        data.overdueCards.map((c) => `<li><strong>${c.title}</strong> — ${c.boardName} (due ${c.dueDate})</li>`).join('')
      }</ul>`
    : '';

  const assignedSection = data.assignedCards.length > 0
    ? `<h3>Assigned to You (${data.assignedCards.length})</h3><ul>${
        data.assignedCards.map((c) => `<li><strong>${c.title}</strong> — ${c.boardName}${c.dueDate ? ` (due ${c.dueDate})` : ''}</li>`).join('')
      }</ul>`
    : '';

  const mentionsSection = data.mentionedComments.length > 0
    ? `<h3>Mentions (${data.mentionedComments.length})</h3><ul>${
        data.mentionedComments.map((m) => `<li><strong>${m.commenterName}</strong> mentioned you on "${m.cardTitle}": ${m.content.slice(0, 100)}</li>`).join('')
      }</ul>`
    : '';

  const html = `
    <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Hi ${data.userName},</h2>
      <p>Here's your daily digest:</p>
      ${overdueSection}
      ${assignedSection}
      ${mentionsSection}
      <hr style="border: 1px solid #f0ece4; margin: 20px 0;" />
      <p style="color: #94a3b8; font-size: 12px;">Kivi Media Boards — Manage your notification preferences in Settings.</p>
    </div>
  `;

  return { subject, html };
}

export async function sendDigest(
  _supabase: SupabaseClient,
  _userId: string,
  email: string,
  emailContent: { subject: string; html: string }
): Promise<boolean> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.error('[DigestEmails] RESEND_API_KEY not configured');
    return false;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL ?? 'updates@agency.com',
        to: [email],
        subject: emailContent.subject,
        html: emailContent.html,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('[DigestEmails] Resend error:', err);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[DigestEmails] Send failed:', err);
    return false;
  }
}
