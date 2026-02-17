import { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// DIRECT EMAIL SENDER — Resend-based alternative to Instantly.io
// Assumes email is already warm. Sends via Resend API with scheduled delays.
// ============================================================================

interface EmailStep {
  step: number;
  day: number;
  subject: string;
  body: string;
}

interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send a single email via Resend API.
 */
async function sendViaResend(params: {
  to: string;
  from: string;
  subject: string;
  html: string;
  scheduledAt?: string; // ISO 8601 datetime for scheduled send
}): Promise<SendResult> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }

  try {
    const body: Record<string, unknown> = {
      from: params.from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
    };

    // Resend supports scheduled_at for future delivery (up to 7 days)
    if (params.scheduledAt) {
      body.scheduled_at = params.scheduledAt;
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `Resend ${res.status}: ${errText}` };
    }

    const data = await res.json();
    return { success: true, messageId: data.id };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Convert plain text email body to simple HTML.
 */
function textToHtml(text: string, candidateId?: string): string {
  // Convert line breaks and add basic formatting
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');

  // Wrap in <p> tags
  html = `<p>${html}</p>`;

  // Convert markdown-style links [text](url) to HTML
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#3b82f6;">$1</a>');

  // Convert plain URLs to links
  html = html.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" style="color:#3b82f6;">$1</a>'
  );

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.6;color:#1a1a2e;max-width:600px;">
      ${html}
    </div>
  `.trim();
}

/**
 * Send a full email sequence to a candidate using Resend.
 *
 * Schedules all emails upfront based on day offsets:
 * - Step 1: Immediately (day 0)
 * - Step 2: Scheduled for day 3
 * - Step 3: Scheduled for day 7
 * etc.
 *
 * Resend supports scheduling up to 7 days out. For emails beyond 7 days,
 * we store them as 'pending' and a cron job sends them later.
 */
export async function sendSequenceDirect(
  supabase: SupabaseClient,
  params: {
    sequenceId: string;
    candidateId: string;
    candidateEmail: string;
    candidateName: string;
    emails: EmailStep[];
    senderEmail?: string;
  }
): Promise<{
  sent: number;
  scheduled: number;
  deferred: number;
  errors: string[];
}> {
  const fromEmail = params.senderEmail
    || process.env.RESEND_FROM_EMAIL
    || 'ziv@vibecodingdeals.co';

  const now = Date.now();
  let sent = 0;
  let scheduled = 0;
  let deferred = 0;
  const errors: string[] = [];

  const updatedEmails = [...params.emails];

  for (let i = 0; i < params.emails.length; i++) {
    const step = params.emails[i];
    const dayOffset = step.day;
    const sendAt = new Date(now + dayOffset * 24 * 60 * 60 * 1000);
    const daysFromNow = dayOffset;

    const html = textToHtml(step.body, params.candidateId);

    if (daysFromNow === 0) {
      // Send immediately
      const result = await sendViaResend({
        to: params.candidateEmail,
        from: fromEmail,
        subject: step.subject,
        html,
      });

      if (result.success) {
        sent++;
        updatedEmails[i] = { ...step, sent_at: new Date().toISOString() } as any;
      } else {
        errors.push(`Step ${step.step}: ${result.error}`);
      }
    } else if (daysFromNow <= 7) {
      // Schedule via Resend (supports up to 7 days)
      const result = await sendViaResend({
        to: params.candidateEmail,
        from: fromEmail,
        subject: step.subject,
        html,
        scheduledAt: sendAt.toISOString(),
      });

      if (result.success) {
        scheduled++;
        updatedEmails[i] = { ...step, scheduled_at: sendAt.toISOString() } as any;
      } else {
        errors.push(`Step ${step.step}: ${result.error}`);
      }
    } else {
      // Beyond 7 days — defer to cron
      deferred++;
      updatedEmails[i] = {
        ...step,
        deferred_until: sendAt.toISOString(),
      } as any;
    }
  }

  // Update the sequence in DB
  await supabase
    .from('pga_email_sequences')
    .update({
      emails: updatedEmails,
      status: errors.length === params.emails.length ? 'draft' : 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.sequenceId);

  return { sent, scheduled, deferred, errors };
}

/**
 * Process deferred emails (called by cron).
 * Finds emails past their deferred_until date and sends them.
 */
export async function processDeferred(
  supabase: SupabaseClient
): Promise<{ sent: number; errors: number }> {
  const { data: sequences } = await supabase
    .from('pga_email_sequences')
    .select('id, candidate_id, emails, candidate:pga_candidates(email, name)')
    .eq('status', 'active');

  if (!sequences) return { sent: 0, errors: 0 };

  const now = new Date();
  let sent = 0;
  let errCount = 0;

  const fromEmail = process.env.RESEND_FROM_EMAIL || 'ziv@vibecodingdeals.co';

  for (const seq of sequences) {
    const candidate = seq.candidate as any;
    if (!candidate?.email) continue;

    const emails = (seq.emails ?? []) as Array<Record<string, unknown>>;
    let updated = false;

    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];
      if (email.deferred_until && !email.sent_at) {
        const deferDate = new Date(email.deferred_until as string);
        if (deferDate <= now) {
          // Time to send
          const html = textToHtml(email.body as string, seq.candidate_id);
          const result = await sendViaResend({
            to: candidate.email,
            from: fromEmail,
            subject: email.subject as string,
            html,
          });

          if (result.success) {
            emails[i] = { ...email, sent_at: new Date().toISOString(), deferred_until: undefined };
            sent++;
            updated = true;
          } else {
            errCount++;
          }
        }
      }
    }

    if (updated) {
      // Check if all emails are sent
      const allSent = emails.every((e: any) => e.sent_at);

      await supabase
        .from('pga_email_sequences')
        .update({
          emails,
          status: allSent ? 'completed' : 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('id', seq.id);
    }
  }

  return { sent, errors: errCount };
}
