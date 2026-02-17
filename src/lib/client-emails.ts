import { SupabaseClient } from '@supabase/supabase-js';
import type { ClientEmail, EmailTone, EmailStatus, ClientEmailConfig } from './types';
import { createAnthropicClient, touchApiKey } from './ai/providers';
import { resolveModelWithFallback } from './ai/model-resolver';
import { logUsage } from './ai/cost-tracker';
import { canMakeAICall } from './ai/budget-checker';
import { buildEmailDraftPrompt, getSystemPrompt } from './ai/prompt-templates';

// ============================================================================
// EMAIL CONFIG
// ============================================================================

export async function getClientEmailConfig(
  supabase: SupabaseClient,
  clientId: string
): Promise<ClientEmailConfig> {
  const { data } = await supabase
    .from('clients')
    .select('email_config')
    .eq('id', clientId)
    .single();

  return (data?.email_config as ClientEmailConfig) ?? {};
}

export async function updateClientEmailConfig(
  supabase: SupabaseClient,
  clientId: string,
  config: ClientEmailConfig
): Promise<void> {
  await supabase
    .from('clients')
    .update({ email_config: config })
    .eq('id', clientId);
}

// ============================================================================
// EMAIL CRUD
// ============================================================================

export async function getClientEmails(
  supabase: SupabaseClient,
  clientId: string,
  status?: EmailStatus
): Promise<ClientEmail[]> {
  let query = supabase
    .from('client_emails')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);

  const { data } = await query;
  return (data as ClientEmail[]) ?? [];
}

export async function getClientEmail(
  supabase: SupabaseClient,
  emailId: string
): Promise<ClientEmail | null> {
  const { data } = await supabase
    .from('client_emails')
    .select('*')
    .eq('id', emailId)
    .single();

  return data as ClientEmail | null;
}

export async function createEmail(
  supabase: SupabaseClient,
  clientId: string,
  email: {
    subject: string;
    body: string;
    tone?: EmailTone;
    recipients: string[];
    cc?: string[];
    draftedBy: string;
    aiGenerated?: boolean;
    modelUsed?: string;
    scheduledFor?: string;
  }
): Promise<ClientEmail | null> {
  const { data, error } = await supabase
    .from('client_emails')
    .insert({
      client_id: clientId,
      subject: email.subject,
      body: email.body,
      tone: email.tone ?? 'friendly',
      recipients: email.recipients,
      cc: email.cc ?? [],
      status: 'draft',
      drafted_by: email.draftedBy,
      ai_generated: email.aiGenerated ?? false,
      model_used: email.modelUsed ?? null,
      scheduled_for: email.scheduledFor ?? null,
    })
    .select()
    .single();

  if (error) return null;
  return data as ClientEmail;
}

export async function updateEmail(
  supabase: SupabaseClient,
  emailId: string,
  updates: Partial<Pick<ClientEmail, 'subject' | 'body' | 'tone' | 'recipients' | 'cc' | 'status' | 'scheduled_for' | 'approved_by'>>
): Promise<ClientEmail | null> {
  const { data, error } = await supabase
    .from('client_emails')
    .update(updates)
    .eq('id', emailId)
    .select()
    .single();

  if (error) return null;
  return data as ClientEmail;
}

// ============================================================================
// AI EMAIL DRAFTING
// ============================================================================

export async function draftClientEmail(
  supabase: SupabaseClient,
  clientId: string,
  userId: string
): Promise<ClientEmail | null> {
  const startTime = Date.now();

  // 1. Budget check
  const budgetCheck = await canMakeAICall(supabase, {
    provider: 'anthropic',
    activity: 'email_draft',
    userId,
  });

  if (!budgetCheck.allowed) {
    throw new Error(`Budget exceeded: ${budgetCheck.reason}`);
  }

  // 2. Get client info and email config
  const { data: client } = await supabase
    .from('clients')
    .select('name, email_config')
    .eq('id', clientId)
    .single();

  if (!client) throw new Error('Client not found');

  const config = (client.email_config as ClientEmailConfig) ?? {};
  const tone = config.tone ?? 'friendly';

  // 3. Gather deliverables (cards moved to Delivered/Approved in last period)
  const { data: deliveredCards } = await supabase
    .from('cards')
    .select('title')
    .eq('client_id', clientId)
    .eq('client_status', 'delivered')
    .order('updated_at', { ascending: false })
    .limit(10);

  const deliverables = (deliveredCards ?? []).map((c: { title: string }) => c.title);

  // 4. Gather upcoming milestones (cards with due dates)
  const { data: upcomingCards } = await supabase
    .from('cards')
    .select('title, due_date')
    .eq('client_id', clientId)
    .not('due_date', 'is', null)
    .gte('due_date', new Date().toISOString())
    .order('due_date', { ascending: true })
    .limit(5);

  const milestones = (upcomingCards ?? []).map(
    (c: { title: string; due_date: string }) => `${c.title} (due: ${c.due_date.split('T')[0]})`
  );

  // 5. Gather action items
  const { data: actionCards } = await supabase
    .from('cards')
    .select('title')
    .eq('client_id', clientId)
    .eq('approval_status', 'pending')
    .limit(5);

  const actionItems = (actionCards ?? []).map((c: { title: string }) => c.title);

  // 6. Resolve model and create client
  const modelConfig = await resolveModelWithFallback(supabase, 'email_draft');
  const aiClient = await createAnthropicClient(supabase);
  if (!aiClient) throw new Error('Anthropic API key not configured.');

  // 7. Build prompt and send
  const systemPrompt = getSystemPrompt('email_draft');
  const userPrompt = buildEmailDraftPrompt(
    client.name,
    tone as 'formal' | 'friendly' | 'casual',
    deliverables,
    milestones,
    actionItems
  );

  const response = await aiClient.messages.create({
    model: modelConfig.model_id,
    max_tokens: modelConfig.max_tokens,
    temperature: modelConfig.temperature,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const latencyMs = Date.now() - startTime;
  await touchApiKey(supabase, 'anthropic');

  const responseText = response.content
    .filter((block) => block.type === 'text')
    .map((block) => {
      if (block.type === 'text') return block.text;
      return '';
    })
    .join('\n');

  // 8. Log usage
  await logUsage(supabase, {
    userId,
    cardId: undefined,
    activity: 'email_draft',
    provider: 'anthropic',
    modelId: modelConfig.model_id,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    latencyMs,
    status: 'success',
    metadata: { client_id: clientId },
  });

  // 9. Parse and create email
  const subjectMatch = responseText.match(/Subject:\s*(.+)/i);
  const subject = subjectMatch ? subjectMatch[1].trim() : `Update for ${client.name}`;
  const body = subjectMatch
    ? responseText.replace(/Subject:\s*.+\n*/i, '').trim()
    : responseText;

  return createEmail(supabase, clientId, {
    subject,
    body,
    tone: tone as EmailTone,
    recipients: config.recipients ?? [],
    cc: config.cc ?? [],
    draftedBy: userId,
    aiGenerated: true,
    modelUsed: modelConfig.model_id,
  });
}

// ============================================================================
// SEND EMAIL (PLACEHOLDER — REQUIRES RESEND API KEY)
// ============================================================================

export async function sendEmail(
  supabase: SupabaseClient,
  emailId: string
): Promise<{ success: boolean; error?: string }> {
  const email = await getClientEmail(supabase, emailId);
  if (!email) return { success: false, error: 'Email not found' };
  if (email.status !== 'approved') return { success: false, error: 'Email must be approved before sending' };

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL ?? 'updates@agency.com',
        to: email.recipients,
        cc: email.cc.length > 0 ? email.cc : undefined,
        subject: email.subject,
        html: email.body.replace(/\n/g, '<br>'),
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      await updateEmail(supabase, emailId, { status: 'failed' });
      return { success: false, error: `Resend API error: ${err}` };
    }

    const result = await response.json();
    await supabase
      .from('client_emails')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        resend_message_id: result.id,
      })
      .eq('id', emailId);

    return { success: true };
  } catch (err) {
    await updateEmail(supabase, emailId, { status: 'failed' });
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
