import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getDueSchedules, markScheduleRun } from '@/lib/qa-scheduler';
import { runDevQA, storeQAResult } from '@/lib/ai/dev-qa';
import { runVisualRegression } from '@/lib/ai/visual-regression';
import { createNotification } from '@/lib/notification-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const schedules = await getDueSchedules(supabase);
  if (schedules.length === 0) {
    return NextResponse.json({ message: 'No schedules due', processed: 0 });
  }

  let processed = 0;
  let errors = 0;

  for (const schedule of schedules) {
    try {
      // Run QA pipeline
      const defaultChecklist = [
        { category: 'Loading', text: 'Page loads successfully', severity: 'critical' as const },
        { category: 'Assets', text: 'No broken images', severity: 'major' as const },
        { category: 'Content', text: 'No placeholder content', severity: 'major' as const },
        { category: 'Responsive', text: 'Responsive on mobile', severity: 'major' as const },
        { category: 'Errors', text: 'No console errors', severity: 'minor' as const },
      ];

      const { qaOutput, screenshots, consoleErrors, performanceMetrics } = await runDevQA(supabase, {
        cardId: schedule.card_id,
        boardId: '', // Monitoring runs don't need board context
        userId: schedule.notify_user_id,
        url: schedule.url,
        checklistItems: defaultChecklist,
      });

      // Store results
      await storeQAResult(supabase, {
        cardId: schedule.card_id,
        boardId: '',
        userId: schedule.notify_user_id,
        url: schedule.url,
        checklistItems: defaultChecklist,
      }, qaOutput, screenshots, consoleErrors, performanceMetrics);

      // Run visual regression
      const regression = await runVisualRegression(
        supabase,
        schedule.card_id,
        schedule.url,
        screenshots
      );

      // Check for score drops or regressions
      const { data: previousResults } = await supabase
        .from('ai_qa_results')
        .select('overall_score')
        .eq('card_id', schedule.card_id)
        .order('created_at', { ascending: false })
        .limit(2);

      const previousScore = previousResults?.[1]?.overall_score ?? null;
      const scoreDrop = previousScore !== null ? previousScore - qaOutput.overallScore : 0;

      // Notify if issues found
      if (scoreDrop > 10 || regression.hasRegression || qaOutput.overallScore < 70) {
        let alertTitle = 'QA Monitoring Alert';
        let alertBody = '';

        if (scoreDrop > 10) {
          alertBody += `Score dropped from ${previousScore} to ${qaOutput.overallScore}. `;
        }
        if (regression.hasRegression) {
          alertBody += `Visual regression detected. `;
        }
        if (qaOutput.overallScore < 70) {
          alertBody += `QA score (${qaOutput.overallScore}) below threshold. `;
        }
        alertBody += `URL: ${schedule.url}`;

        await createNotification(supabase, {
          userId: schedule.notify_user_id,
          type: 'automation_triggered',
          title: alertTitle,
          body: alertBody,
          cardId: schedule.card_id,
        });
      }

      await markScheduleRun(supabase, schedule.id, schedule.frequency);
      processed++;
    } catch (err) {
      errors++;
      console.error(`[QAMonitor] Failed for schedule ${schedule.id}:`, err);
      await markScheduleRun(supabase, schedule.id, schedule.frequency);
    }
  }

  return NextResponse.json({ message: 'QA monitor complete', processed, errors });
}
