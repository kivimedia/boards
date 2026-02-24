import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { signPayload } from '@/lib/public-api';

interface TestWebhookBody {
  url: string;
  secret?: string;
}

/**
 * POST /api/v1/webhooks/test
 * Send a test webhook delivery to verify a URL is reachable and responds correctly.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<TestWebhookBody>(request);
  if (!body.ok) return body.response;

  const { url, secret } = body.body;

  if (!url?.trim()) {
    return errorResponse('URL is required');
  }

  try {
    new URL(url);
  } catch {
    return errorResponse('Invalid URL format');
  }

  if (!url.startsWith('https://')) {
    return errorResponse('Webhook URL must use HTTPS');
  }

  const testPayload = {
    event: 'webhook.test',
    timestamp: new Date().toISOString(),
    data: {
      message: 'This is a test webhook delivery from Agency Board.',
      user_id: auth.ctx.userId,
    },
  };

  const payloadStr = JSON.stringify(testPayload);
  const testSecret = secret || 'whsec_test';
  const signature = await signPayload(testSecret, payloadStr);
  const startTime = Date.now();

  let responseStatus: number | null = null;
  let responseBody: string | null = null;
  let success = false;
  let errorMessage: string | null = null;

  try {
    const response = await fetch(url.trim(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': 'webhook.test',
        'X-Webhook-Id': 'test',
      },
      body: payloadStr,
      signal: AbortSignal.timeout(10000),
    });

    responseStatus = response.status;
    responseBody = await response.text().catch(() => null);
    success = response.ok;
  } catch (err: unknown) {
    errorMessage = err instanceof Error ? err.message : 'Unknown error';
  }

  const responseTimeMs = Date.now() - startTime;

  return successResponse({
    success,
    response_status: responseStatus,
    response_body: responseBody ? responseBody.substring(0, 500) : null,
    response_time_ms: responseTimeMs,
    error_message: errorMessage,
    payload_sent: testPayload,
  });
}
