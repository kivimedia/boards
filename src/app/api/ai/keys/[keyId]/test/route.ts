import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import { decryptFromHex } from '@/lib/encryption';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AIProvider } from '@/lib/types';

interface Params {
  params: { keyId: string };
}

/**
 * Test an API key by making a minimal call to the provider.
 */
async function testProviderKey(provider: AIProvider, apiKey: string): Promise<{ valid: boolean; message: string }> {
  try {
    switch (provider) {
      case 'anthropic': {
        const client = new Anthropic({ apiKey });
        await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hi' }],
        });
        return { valid: true, message: 'Anthropic API key is valid and working.' };
      }
      case 'openai': {
        const client = new OpenAI({ apiKey, timeout: 15000 });
        await client.models.list();
        return { valid: true, message: 'OpenAI API key is valid and working.' };
      }
      case 'google': {
        // Use a lightweight list-models call instead of generating content
        const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + apiKey, {
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) {
          return { valid: true, message: 'Google AI API key is valid and working.' };
        }
        if (res.status === 400 || res.status === 403) {
          return { valid: false, message: 'Invalid Google AI API key. Check your key in Google AI Studio.' };
        }
        return { valid: false, message: `Google API returned status ${res.status}.` };
      }
      case 'browserless': {
        const response = await fetch('https://chrome.browserless.io/json/version', {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(10000),
        });
        if (response.ok) {
          return { valid: true, message: 'Browserless API key is valid and working.' };
        }
        return { valid: false, message: `Browserless returned status ${response.status}. Check your API key.` };
      }
      default:
        return { valid: false, message: `Unknown provider: ${provider}` };
    }
  } catch (err) {
    const raw = err instanceof Error ? err.message : 'Unknown error';
    // Provide user-friendly hints
    if (raw.includes('401') || raw.includes('authentication') || raw.includes('invalid')) {
      return { valid: false, message: `Invalid API key. Double-check you copied the full key from your ${provider} dashboard.` };
    }
    if (raw.includes('429') || raw.includes('rate')) {
      return { valid: false, message: `Rate limited. The key is likely valid but you've hit the API rate limit. Try again in a minute.` };
    }
    if (raw.includes('402') || raw.includes('billing') || raw.includes('quota')) {
      return { valid: false, message: `Billing issue. The key is valid but your account needs a payment method or has exceeded its quota.` };
    }
    if (raw.includes('timeout') || raw.includes('ETIMEDOUT') || raw.includes('ECONNREFUSED')) {
      return { valid: false, message: `Connection timed out. The provider may be temporarily unavailable. Try again later.` };
    }
    return { valid: false, message: raw };
  }
}

/**
 * POST /api/ai/keys/[keyId]/test
 * Test if a stored API key works by making a minimal API call.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const { keyId } = params;

  const { data: keyRecord, error } = await supabase
    .from('ai_api_keys')
    .select('id, provider, key_encrypted')
    .eq('id', keyId)
    .single();

  if (error || !keyRecord) {
    return NextResponse.json({ valid: false, message: 'API key not found in database.' });
  }

  let decryptedKey: string;
  try {
    decryptedKey = decryptFromHex(keyRecord.key_encrypted);
  } catch (err) {
    console.error('[AI Keys Test] Decryption failed:', err);
    return NextResponse.json({
      valid: false,
      message: 'Failed to decrypt the stored key. The encryption key may have changed. Try deleting this key and adding it again.',
    });
  }

  const result = await testProviderKey(keyRecord.provider as AIProvider, decryptedKey);

  // Update last_used_at if test was successful
  if (result.valid) {
    await supabase
      .from('ai_api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyId);
  }

  return NextResponse.json(result);
}
