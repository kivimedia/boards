import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthContext, successResponse, errorResponse, requireFeatureAccess } from '@/lib/api-helpers';

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pwd = '';
  for (let i = 0; i < 10; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd;
}

async function sendCredentialsEmail(params: {
  to: string;
  displayName: string;
  password: string;
  loginUrl: string;
}): Promise<boolean> {
  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'KM Boards <noreply@dailycookie.co>';
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
        subject: 'Your Login Credentials - Kivi Media',
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 0;">
            <div style="background: #1a1f36; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
              <h1 style="color: #fff; font-size: 20px; margin: 0;">Kivi Media</h1>
            </div>
            <p style="color: #333; font-size: 15px; line-height: 1.6;">
              Hi ${params.displayName},
            </p>
            <p style="color: #333; font-size: 15px; line-height: 1.6;">
              Here are your updated login credentials:
            </p>
            <div style="background: #f5f5f5; border-radius: 8px; padding: 16px; margin: 20px 0; font-family: monospace;">
              <p style="margin: 4px 0; font-size: 14px;"><strong>Email:</strong> ${params.to}</p>
              <p style="margin: 4px 0; font-size: 14px;"><strong>Password:</strong> ${params.password}</p>
            </div>
            <a href="${params.loginUrl}" style="display: inline-block; background: #4F6BFF; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; margin-top: 8px;">
              Log In Now
            </a>
            <p style="color: #999; font-size: 12px; margin-top: 24px;">
              We recommend changing your password after your first login via Settings.
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

interface Params {
  params: Promise<{ userId: string }>;
}

/**
 * POST /api/admin/client-users/[userId]/resend-credentials
 * Reset password to a temp one and email the credentials to the client.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const denied = await requireFeatureAccess(auth.ctx.supabase, auth.ctx.userId, 'user_management');
  if (denied) return denied;

  const { userId } = await params;

  // Verify the target user is a client
  const { data: profile } = await auth.ctx.supabase
    .from('profiles')
    .select('user_role, display_name')
    .eq('id', userId)
    .single();

  if (!profile) return errorResponse('User not found', 404);
  if (profile.user_role !== 'client') return errorResponse('Can only resend credentials for client users', 400);

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return errorResponse('Server configuration error', 500);

  const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);

  // Get the user's email
  const { data: authData, error: authError } = await adminClient.auth.admin.getUserById(userId);
  if (authError || !authData?.user?.email) {
    return errorResponse('Could not retrieve user email', 500);
  }

  // Generate temp password and set it
  const tempPassword = generateTempPassword();
  const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
    password: tempPassword,
  });

  if (updateError) return errorResponse(updateError.message, 500);

  // Send credentials email
  const loginUrl = process.env.NEXT_PUBLIC_SITE_URL
    ? `${process.env.NEXT_PUBLIC_SITE_URL}/login`
    : 'https://kmboards.co/login';

  const emailSent = await sendCredentialsEmail({
    to: authData.user.email,
    displayName: profile.display_name || 'Client',
    password: tempPassword,
    loginUrl,
  });

  return successResponse({
    email: authData.user.email,
    temp_password: tempPassword,
    email_sent: emailSent,
  });
}
