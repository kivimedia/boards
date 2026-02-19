import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/auth/forgot-password
 * Generate a password recovery link and email it to the user.
 * Body: { email: string, redirectTo: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { email, redirectTo } = await request.json();

    if (!email?.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return NextResponse.json(
        { error: 'Server not configured for password resets' },
        { status: 500 }
      );
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey
    );

    // Use admin generateLink to bypass Supabase email rate limits
    const { data, error } = await adminClient.auth.admin.generateLink({
      type: 'recovery',
      email: email.trim(),
      options: {
        redirectTo: redirectTo || `${process.env.NEXT_PUBLIC_SITE_URL || 'https://kmboards.co'}/reset-password`,
      },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const actionLink = data?.properties?.action_link || null;

    // Send the recovery email via Resend
    let emailSent = false;
    const resendKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@dailycookie.co';

    if (resendKey && actionLink) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [email.trim()],
            subject: 'Reset Your Password - Kivi Media Boards',
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 0;">
                <div style="background: #1a1f36; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
                  <h1 style="color: #fff; font-size: 20px; margin: 0;">Kivi Media Boards</h1>
                </div>
                <p style="color: #333; font-size: 15px; line-height: 1.6;">
                  Hi there,
                </p>
                <p style="color: #333; font-size: 15px; line-height: 1.6;">
                  We received a request to reset your password. Click the button below to choose a new one:
                </p>
                <div style="text-align: center; margin: 28px 0;">
                  <a href="${actionLink}" style="display: inline-block; background: #4F6BFF; color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 600; font-size: 15px;">
                    Reset Password
                  </a>
                </div>
                <p style="color: #999; font-size: 12px; line-height: 1.5;">
                  This link will expire in 24 hours. If you didn't request a password reset, you can safely ignore this email.
                </p>
              </div>
            `,
          }),
        });
        emailSent = res.ok;
      } catch {
        // Email send failed, but we still have the action link as fallback
      }
    }

    return NextResponse.json({
      ok: true,
      email_sent: emailSent,
      // Include action_link as fallback in case email doesn't arrive
      action_link: actionLink,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate reset link';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
