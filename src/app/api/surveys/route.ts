import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getSurveys, submitSurvey } from '@/lib/analytics';

export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('client_id') ?? undefined;
  const surveyType = searchParams.get('survey_type') ?? undefined;
  const limitStr = searchParams.get('limit');
  const limit = limitStr ? parseInt(limitStr, 10) : undefined;

  const surveys = await getSurveys(auth.ctx.supabase, { clientId, surveyType, limit });
  return successResponse(surveys);
}

interface SubmitSurveyBody {
  client_id: string;
  card_id?: string;
  rating: number;
  feedback?: string;
  survey_type: string;
}

export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<SubmitSurveyBody>(request);
  if (!body.ok) return body.response;

  const { client_id, rating, survey_type } = body.body;

  if (!client_id) return errorResponse('Client ID is required');
  if (rating === undefined || rating === null) return errorResponse('Rating is required');
  if (rating < 1 || rating > 5) return errorResponse('Rating must be between 1 and 5');
  if (!survey_type) return errorResponse('Survey type is required');
  if (!['delivery', 'milestone', 'periodic'].includes(survey_type)) {
    return errorResponse('Invalid survey type');
  }

  const survey = await submitSurvey(auth.ctx.supabase, {
    clientId: client_id,
    cardId: body.body.card_id,
    rating,
    feedback: body.body.feedback,
    surveyType: survey_type,
    submittedBy: auth.ctx.userId,
  });

  if (!survey) return errorResponse('Failed to submit survey', 500);
  return successResponse(survey, 201);
}
