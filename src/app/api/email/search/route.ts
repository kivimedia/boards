import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { getValidAccessToken } from '@/lib/google/token-manager';
import { searchSentEmails, getMessage, getHeader, extractTextBody } from '@/lib/google/gmail';

export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const maxResults = parseInt(searchParams.get('maxResults') || '10', 10);
  const pageToken = searchParams.get('pageToken') || undefined;
  const full = searchParams.get('full') === 'true';

  if (!query) return errorResponse('q query param required');

  const { supabase, userId } = auth.ctx;

  try {
    const accessToken = await getValidAccessToken(supabase, userId);
    if (!accessToken) return errorResponse('Google not connected', 401);

    const searchResult = await searchSentEmails(accessToken, query, maxResults, pageToken);

    if (!searchResult.messages || searchResult.messages.length === 0) {
      return successResponse({ emails: [], nextPageToken: null });
    }

    // If full=true, fetch full message details; otherwise return IDs + snippets
    if (full) {
      const emails = await Promise.all(
        searchResult.messages.map(async (m) => {
          const msg = await getMessage(accessToken, m.id);
          return {
            id: msg.id,
            threadId: msg.threadId,
            date: getHeader(msg, 'Date'),
            from: getHeader(msg, 'From'),
            to: getHeader(msg, 'To'),
            subject: getHeader(msg, 'Subject'),
            snippet: msg.snippet,
            body: extractTextBody(msg),
            hasAttachments: msg.payload.parts?.some((p) => p.filename && p.filename.length > 0) ?? false,
          };
        }),
      );
      return successResponse({ emails, nextPageToken: searchResult.nextPageToken });
    }

    // Light mode: just return IDs
    return successResponse({
      messages: searchResult.messages,
      resultSizeEstimate: searchResult.resultSizeEstimate,
      nextPageToken: searchResult.nextPageToken,
    });
  } catch (err) {
    return errorResponse((err as Error).message, 500);
  }
}
