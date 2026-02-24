import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { decryptFromHex } from '@/lib/encryption';
import type { PGAService } from '@/lib/types';

/**
 * POST /api/podcast/integrations/test
 * Test an integration config by making a simple API call.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<{ service: PGAService }>(request);
  if (!body.ok) return body.response;

  const { service } = body.body;
  const { supabase } = auth.ctx;

  // Load config with encrypted key
  const { data: config } = await supabase
    .from('pga_integration_configs')
    .select('*')
    .eq('service', service)
    .maybeSingle();

  if (!config) {
    return errorResponse(`No configuration found for ${service}`);
  }
  if (!config.api_key_encrypted) {
    return errorResponse(`No API key configured for ${service}`);
  }

  let apiKey: string;
  try {
    apiKey = decryptFromHex(config.api_key_encrypted);
  } catch {
    return errorResponse(`Failed to decrypt API key for ${service}`, 500);
  }

  try {
    switch (service) {
      case 'instantly': {
        const res = await fetch('https://api.instantly.ai/api/v1/account/list', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        // Instantly uses query params for auth
        const url = `https://api.instantly.ai/api/v1/account/list?api_key=${encodeURIComponent(apiKey)}`;
        const testRes = await fetch(url);
        if (testRes.ok) {
          const data = await testRes.json();
          return successResponse({
            success: true,
            message: `Connected! Found ${Array.isArray(data) ? data.length : 0} sending account(s).`,
          });
        }
        return errorResponse(`Instantly API returned ${testRes.status}: ${await testRes.text()}`);
      }

      case 'hunter': {
        const res = await fetch(
          `https://api.hunter.io/v2/account?api_key=${encodeURIComponent(apiKey)}`
        );
        if (res.ok) {
          const json = await res.json();
          const remaining = json.data?.requests?.searches?.available ?? '?';
          return successResponse({
            success: true,
            message: `Connected! ${remaining} searches remaining this month.`,
          });
        }
        return errorResponse(`Hunter.io API returned ${res.status}: ${await res.text()}`);
      }

      case 'snov': {
        // Snov.io uses OAuth — get access token first
        const tokenRes = await fetch('https://api.snov.io/v1/oauth/access_token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grant_type: 'client_credentials',
            client_id: apiKey.split(':')[0],
            client_secret: apiKey.split(':')[1] || apiKey,
          }),
        });
        if (tokenRes.ok) {
          const tokenData = await tokenRes.json();
          if (tokenData.access_token) {
            return successResponse({
              success: true,
              message: 'Connected! OAuth token obtained successfully.',
            });
          }
        }
        return errorResponse(`Snov.io auth failed: ${await tokenRes.text()}`);
      }

      case 'calendly': {
        const res = await fetch('https://api.calendly.com/users/me', {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        });
        if (res.ok) {
          const json = await res.json();
          return successResponse({
            success: true,
            message: `Connected as ${json.resource?.name ?? 'unknown user'}.`,
          });
        }
        return errorResponse(`Calendly API returned ${res.status}: ${await res.text()}`);
      }

      default:
        return errorResponse(`Unknown service: ${service}`);
    }
  } catch (err: any) {
    return errorResponse(`Connection failed: ${err.message}`);
  }
}
