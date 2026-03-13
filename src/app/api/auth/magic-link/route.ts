import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/auth/magic-link
 * Generate a magic-link (passwordless sign-in) and email it.
 * Body: { email: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email?.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return NextResponse.json(
        { error: 'Server not configured for magic links' },
        { status: 500 }
      );
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey
    );

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://kmboards.co';

    // Generate a magic link via admin API
    const { data, error } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: email.trim(),
      options: {
        redirectTo: siteUrl,
      },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Rewrite localhost URLs to production
    let actionLink = data?.properties?.action_link || null;
    if (actionLink) {
      actionLink = actionLink.replace(/http:\/\/localhost:\d+/g, siteUrl);
    }

    // Send the magic link email via Resend
    let emailSent = false;
    const resendKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'KM Boards <noreply@dailycookie.co>';

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
            subject: 'Sign In to KM Boards',
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 0;">
                <div style="background: #1a1f36; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
                  <h1 style="color: #fff; font-size: 20px; margin: 0;">KM Boards</h1>
                </div>
                <p style="color: #333; font-size: 15px; line-height: 1.6;">
                  Hi there,
                </p>
                <p style="color: #333; font-size: 15px; line-height: 1.6;">
                  Click the button below to sign in to your account. No password needed.
                </p>
                <div style="text-align: center; margin: 28px 0;">
                  <a href="${actionLink}" style="display: inline-block; background: #4F6BFF; color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 600; font-size: 15px;">
                    Sign In
                  </a>
                </div>
                <p style="color: #999; font-size: 12px; line-height: 1.5;">
                  This link will expire in 24 hours. If you didn't request this, you can safely ignore this email.
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
      action_link: actionLink,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate magic link';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
