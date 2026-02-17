import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getWhatsAppConfig,
  verifyWebhookChallenge,
  verifyWebhookSignature,
  processStatusUpdate,
} from '@/lib/integrations/whatsapp-business-api';

export const dynamic = 'force-dynamic';

/**
 * GET /api/whatsapp/webhook
 * Meta webhook verification (hub challenge).
 */
export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('hub.mode');
  const token = request.nextUrl.searchParams.get('hub.verify_token');
  const challenge = request.nextUrl.searchParams.get('hub.challenge');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const config = await getWhatsAppConfig(supabase);
  if (!config) {
    return NextResponse.json({ error: 'WhatsApp not configured' }, { status: 503 });
  }

  const result = verifyWebhookChallenge(mode, token, challenge, config.webhook_verify_token);

  if (result.valid && result.challenge) {
    // Meta expects the challenge as plain text, not JSON
    return new NextResponse(result.challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

/**
 * POST /api/whatsapp/webhook
 * Receive inbound messages and status updates from Meta.
 */
export async function POST(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const config = await getWhatsAppConfig(supabase);
  if (!config) {
    return NextResponse.json({ error: 'WhatsApp not configured' }, { status: 503 });
  }

  // Verify signature
  const body = await request.text();
  const signature = request.headers.get('x-hub-signature-256');
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  if (appSecret) {
    const valid = await verifyWebhookSignature(body, signature, appSecret);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
  }

  try {
    const payload = JSON.parse(body);

    // Process each entry
    const entries = payload.entry ?? [];
    for (const entry of entries) {
      const changes = entry.changes ?? [];
      for (const change of changes) {
        if (change.field !== 'messages') continue;

        const value = change.value;

        // Process status updates
        const statuses = value.statuses ?? [];
        for (const status of statuses) {
          await processStatusUpdate(
            supabase,
            status.status,
            status.id,
            status.timestamp,
            status.errors
          );
        }

        // Process inbound messages
        const messages = value.messages ?? [];
        for (const message of messages) {
          // Check for idempotency - skip if we've already processed this message
          const { data: existing } = await supabase
            .from('whatsapp_messages')
            .select('id')
            .eq('external_id', message.id)
            .limit(1)
            .single();

          if (existing) continue;

          // Find the WhatsApp user by phone
          const fromPhone = message.from;
          const { data: waUser } = await supabase
            .from('whatsapp_users')
            .select('id, profile_id')
            .eq('phone_number', fromPhone)
            .limit(1)
            .single();

          // Extract message content
          let content = '';
          let mediaUrl: string | null = null;
          let mediaType: string | null = null;

          if (message.type === 'text' && message.text?.body) {
            content = message.text.body;
          } else if (message.type === 'interactive') {
            if (message.interactive?.button_reply) {
              content = `[Button: ${message.interactive.button_reply.title}]`;
            } else if (message.interactive?.list_reply) {
              content = `[List: ${message.interactive.list_reply.title}]`;
            }
          } else if (['image', 'video', 'document', 'audio'].includes(message.type)) {
            const media = message[message.type as 'image' | 'video' | 'document' | 'audio'];
            content = media?.caption || `[${message.type}]`;
            mediaType = message.type;
            // Media URL needs to be fetched via Media API using media.id
          }

          // Store inbound message
          await supabase.from('whatsapp_messages').insert({
            whatsapp_user_id: waUser?.id ?? null,
            profile_id: waUser?.profile_id ?? null,
            direction: 'inbound',
            message_type: 'reply',
            content,
            external_id: message.id,
            status: 'delivered',
            media_url: mediaUrl,
            media_type: mediaType,
          });

          // TODO: Process quick actions for text messages
          // if (message.type === 'text' && waUser) {
          //   await processQuickAction(supabase, waUser.id, content);
          // }
        }
      }
    }

    return NextResponse.json({ status: 'ok' });
  } catch (err) {
    console.error('[WhatsApp Webhook] Error:', err);
    // Always return 200 to Meta to prevent retries on parse errors
    return NextResponse.json({ status: 'ok' });
  }
}
