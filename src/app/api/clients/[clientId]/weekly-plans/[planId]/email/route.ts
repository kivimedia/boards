import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getPlanWithTasks, sendWeeklyEmail } from '@/lib/weekly-gantt';

interface Params {
  params: Promise<{ clientId: string; planId: string }>;
}

interface SendEmailBody {
  recipients: string[];
}

/**
 * POST /api/clients/[clientId]/weekly-plans/[planId]/email
 * Send the weekly plan as an email to specified recipients.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<SendEmailBody>(request);
  if (!body.ok) return body.response;

  const { clientId, planId } = await params;
  const { recipients } = body.body;

  if (!Array.isArray(recipients) || recipients.length === 0) {
    return errorResponse('recipients must be a non-empty array of email addresses');
  }

  // Get the plan with tasks
  const plan = await getPlanWithTasks(auth.ctx.supabase, planId);
  if (!plan) return errorResponse('Plan not found', 404);

  // Get client name
  const { data: client } = await auth.ctx.supabase
    .from('clients')
    .select('name')
    .eq('id', clientId)
    .single();

  const clientName = client?.name || 'Client';

  try {
    const result = await sendWeeklyEmail(
      auth.ctx.supabase,
      planId,
      clientName,
      recipients,
      plan.tasks,
      plan.week_start
    );

    if (!result.success) {
      return errorResponse(result.error || 'Failed to send email', 500);
    }

    return successResponse({ sent: true });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : 'Failed to send email', 500);
  }
}
