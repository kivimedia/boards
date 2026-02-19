import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pwd = '';
  for (let i = 0; i < 10; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd;
}

/** Send credentials email via Resend */
async function sendCredentialsEmail(params: {
  to: string;
  displayName: string;
  password: string;
  loginUrl: string;
}): Promise<boolean> {
  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@dailycookie.co';
  if (!resendKey) return false;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [params.to],
        subject: 'Your Kivi Media Boards Login Credentials',
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 0;">
            <div style="background: #1a1f36; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
              <h1 style="color: #fff; font-size: 20px; margin: 0;">Kivi Media Boards</h1>
            </div>
            <p style="color: #333; font-size: 15px; line-height: 1.6;">
              Hi ${params.displayName},
            </p>
            <p style="color: #333; font-size: 15px; line-height: 1.6;">
              Here are your login credentials for Kivi Media Boards:
            </p>
            <div style="background: #f5f5f5; border-radius: 8px; padding: 16px; margin: 20px 0; font-family: monospace;">
              <p style="margin: 4px 0; font-size: 14px;"><strong>Email:</strong> ${params.to}</p>
              <p style="margin: 4px 0; font-size: 14px;"><strong>Password:</strong> ${params.password}</p>
            </div>
            <a href="${params.loginUrl}" style="display: inline-block; background: #4F6BFF; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; margin-top: 8px;">
              Log In Now
            </a>
            <p style="color: #999; font-size: 12px; margin-top: 24px;">
              We recommend changing your password after your first login.
            </p>
          </div>
        `,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

interface ResetPasswordBody {
  user_id: string;
}

/**
 * POST /api/settings/users/reset-password
 * Generate a new temporary password for a user and email it to them.
 * Any authenticated user can trigger this.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<ResetPasswordBody>(request);
  if (!body.ok) return body.response;

  const { user_id } = body.body;
  if (!user_id) return errorResponse('user_id is required');

  // Allow resend to any user including self
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return errorResponse('Server is not configured for password management (missing service role key)', 500);
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey
  );

  try {
    // Get user's email
    const { data: { user }, error: getUserError } = await adminClient.auth.admin.getUserById(user_id);
    if (getUserError || !user) {
      return errorResponse('User not found', 404);
    }

    const email = user.email;
    if (!email) {
      return errorResponse('User has no email address', 400);
    }

    // Generate temp password and update (also confirm email to fix unconfirmed accounts)
    const tempPassword = generateTempPassword();
    const { error: updateError } = await adminClient.auth.admin.updateUserById(user_id, {
      password: tempPassword,
      email_confirm: true,
    });

    if (updateError) {
      return errorResponse(updateError.message, 500);
    }

    // Get display name from profile
    const { data: profile } = await adminClient
      .from('profiles')
      .select('display_name')
      .eq('id', user_id)
      .single();

    const displayName = profile?.display_name || 'Team Member';
    const loginUrl = process.env.NEXT_PUBLIC_SITE_URL
      ? `${process.env.NEXT_PUBLIC_SITE_URL}/login`
      : 'https://kmboards.co/login';

    // Send credentials via email
    const emailSent = await sendCredentialsEmail({
      to: email,
      displayName,
      password: tempPassword,
      loginUrl,
    });

    return successResponse({
      display_name: displayName,
      email,
      temp_password: tempPassword,
      email_sent: emailSent,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to reset password';
    return errorResponse(message, 500);
  }
}
