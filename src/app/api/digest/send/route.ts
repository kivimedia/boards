import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { sendDigest, buildDigestEmail } from '@/lib/digest-emails';
import { fetchMyTasks } from '@/lib/my-tasks';

interface SendDigestBody {
  user_id?: string;
}

/**
 * POST /api/digest/send
 * Trigger digest send (cron-callable).
 * If user_id is provided, send for that specific user; otherwise placeholder for batch.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const parsed = await parseBody<SendDigestBody>(request);
  if (!parsed.ok) return parsed.response;

  const { supabase } = auth.ctx;
  const targetUserId = parsed.body.user_id;

  try {
    if (targetUserId) {
      // Fetch user profile for name and email
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, email')
        .eq('id', targetUserId)
        .single();

      if (!profile) return errorResponse('User not found', 404);

      // Fetch tasks for digest data (get first 200 for digest summary)
      const result = await fetchMyTasks(supabase, targetUserId, 1, 200);
      const tasks = result.tasks;
      const now = new Date();

      const overdueCards = tasks
        .filter((t) => t.isOverdue)
        .map((t) => ({ title: t.title, boardName: t.boardName, dueDate: t.dueDate! }));

      const assignedCards = tasks.map((t) => ({
        title: t.title,
        boardName: t.boardName,
        dueDate: t.dueDate,
        priority: t.priority,
      }));

      const emailContent = buildDigestEmail({
        userName: profile.display_name,
        assignedCards,
        overdueCards,
        mentionedComments: [],
        completedCards: [],
      });

      await sendDigest(supabase, targetUserId, profile.email, emailContent);
    }

    // Batch processing would be implemented here for cron usage

    return successResponse({ sent: true });
  } catch (err: any) {
    return errorResponse(err.message || 'Failed to send digest', 500);
  }
}
