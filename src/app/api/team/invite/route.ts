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
        subject: 'Welcome to Kivi Media - Your Login Credentials',
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 0;">
            <div style="background: #1a1f36; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
              <h1 style="color: #fff; font-size: 20px; margin: 0;">Kivi Media</h1>
            </div>
            <p style="color: #333; font-size: 15px; line-height: 1.6;">
              Hi ${params.displayName},
            </p>
            <p style="color: #333; font-size: 15px; line-height: 1.6;">
              You have been invited to Kivi Media. Here are your login credentials:
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

interface InviteBody {
  email: string;
  display_name: string;
}

/**
 * POST /api/team/invite
 * Invite a new user by email. Creates an auth user + profile, marks them active.
 * Requires the caller to be an admin or agency_owner.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  // Check if requester has permission (agency_owner or admin)
  const { data: requester } = await supabase
    .from('profiles')
    .select('agency_role, user_role')
    .eq('id', userId)
    .single();

  if (requester?.agency_role !== 'agency_owner' && requester?.user_role !== 'admin') {
    return errorResponse('Only agency owners or admins can invite users', 403);
  }

  const body = await parseBody<InviteBody>(request);
  if (!body.ok) return body.response;

  const { email, display_name } = body.body;
  if (!email?.trim()) return errorResponse('email is required');
  if (!display_name?.trim()) return errorResponse('display_name is required');

  // Need service role key for auth.admin
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return errorResponse('Server is not configured for user invitations (missing service role key)', 500);
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey
  );

  try {
    // Check if user already exists
    const { data: existingProfile } = await adminClient
      .from('profiles')
      .select('id, display_name')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle();

    if (existingProfile) {
      // User already exists — just return their profile
      return successResponse(existingProfile);
    }

    // Create user directly via admin API with a temp password
    const tempPassword = generateTempPassword();
    const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
      email: email.trim(),
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        display_name: display_name.trim(),
      },
    });

    if (createError || !createData.user) {
      return errorResponse(createError?.message || 'Failed to create user', 500);
    }

    const newUserId = createData.user.id;

    // The handle_new_user trigger creates the profile row automatically.
    // Update it to active since an admin is explicitly inviting them.
    // Small delay to allow trigger to complete.
    await new Promise((r) => setTimeout(r, 500));

    await adminClient
      .from('profiles')
      .update({
        account_status: 'active',
        display_name: display_name.trim(),
      })
      .eq('id', newUserId);

    // Fetch the final profile to return
    const { data: profile } = await adminClient
      .from('profiles')
      .select('id, display_name, avatar_url, role')
      .eq('id', newUserId)
      .single();

    // Send credentials via email
    const loginUrl = process.env.NEXT_PUBLIC_SITE_URL
      ? `${process.env.NEXT_PUBLIC_SITE_URL}/login`
      : 'https://kmboards.co/login';

    const emailSent = await sendCredentialsEmail({
      to: email.trim(),
      displayName: display_name.trim(),
      password: tempPassword,
      loginUrl,
    });

    return successResponse({
      ...profile,
      email: email.trim(),
      temp_password: tempPassword,
      email_sent: emailSent,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to invite user';
    return errorResponse(message, 500);
  }
}
