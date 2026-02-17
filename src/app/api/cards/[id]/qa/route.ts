import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { runDevQA, storeQAResult, getCardQAHistory } from '@/lib/ai/dev-qa';
import type { QAChecklistItem } from '@/lib/types';

interface Params {
  params: { id: string };
}

/**
 * GET /api/cards/[id]/qa
 * Get the QA history for a card.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const cardId = params.id;

  try {
    const history = await getCardQAHistory(supabase, cardId);
    return successResponse(history);
  } catch (err) {
    return errorResponse(
      `Failed to fetch QA history: ${err instanceof Error ? err.message : String(err)}`,
      500
    );
  }
}

interface RunQABody {
  url: string;
  checklistTemplateId?: string;
  checklistItems?: QAChecklistItem[];
}

/**
 * POST /api/cards/[id]/qa
 * Run a new AI Dev QA analysis for a card.
 *
 * Body:
 *   url: string (required) - The URL to QA
 *   checklistTemplateId?: string - Template ID to load checklist items from
 *   checklistItems?: QAChecklistItem[] - Inline checklist items (takes priority)
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<RunQABody>(request);
  if (!body.ok) return body.response;

  const { url, checklistTemplateId, checklistItems: providedItems } = body.body;
  const { supabase, userId } = auth.ctx;
  const cardId = params.id;

  if (!url) {
    return errorResponse('url is required');
  }

  try {
    // Resolve checklist items
    let checklistItems: QAChecklistItem[];
    let resolvedTemplateId: string | undefined = checklistTemplateId;

    if (providedItems && providedItems.length > 0) {
      // Use inline items directly
      checklistItems = providedItems;
    } else if (checklistTemplateId) {
      // Fetch items from the specified template
      const { data: template, error: templateError } = await supabase
        .from('qa_checklist_templates')
        .select('*')
        .eq('id', checklistTemplateId)
        .single();

      if (templateError || !template) {
        return errorResponse('Checklist template not found', 404);
      }

      checklistItems = template.items as QAChecklistItem[];
    } else {
      // Fetch the default template
      const { data: defaultTemplate, error: defaultError } = await supabase
        .from('qa_checklist_templates')
        .select('*')
        .eq('is_default', true)
        .limit(1)
        .single();

      if (defaultError || !defaultTemplate) {
        return errorResponse(
          'No default QA checklist template found. Create one or provide checklistItems in the request body.',
          422
        );
      }

      checklistItems = defaultTemplate.items as QAChecklistItem[];
      resolvedTemplateId = defaultTemplate.id;
    }

    // Resolve board_id from card -> card_placements -> lists -> board
    const { data: placement, error: placementError } = await supabase
      .from('card_placements')
      .select('list:lists(board_id)')
      .eq('card_id', cardId)
      .limit(1)
      .single();

    if (placementError || !placement?.list) {
      return errorResponse('Could not determine board for this card', 500);
    }

    const boardId = (placement.list as unknown as { board_id: string }).board_id;

    // Run the AI Dev QA pipeline
    const { qaOutput, screenshots, consoleErrors, performanceMetrics } =
      await runDevQA(supabase, {
        cardId,
        boardId,
        userId,
        url,
        checklistItems,
      });

    // Store the result
    const stored = await storeQAResult(
      supabase,
      { cardId, boardId, userId, url, checklistItems },
      qaOutput,
      screenshots,
      consoleErrors,
      performanceMetrics,
      resolvedTemplateId
    );

    if (!stored) {
      // QA ran successfully but storage failed -- return the output anyway
      return successResponse(
        { ...qaOutput, screenshots, consoleErrors, performanceMetrics, _warning: 'QA completed but failed to persist to database.' },
        201
      );
    }

    return successResponse(stored, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Surface budget errors as 429
    if (message.includes('Budget exceeded')) {
      return errorResponse(message, 429);
    }

    // Surface configuration errors as 422
    if (message.includes('not configured') || message.includes('API key')) {
      return errorResponse(message, 422);
    }

    return errorResponse(`Dev QA failed: ${message}`, 500);
  }
}
