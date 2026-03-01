import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, errorResponse } from '@/lib/api-helpers';
import {
  discoverClientCards,
  extractAssetLinks,
  buildSearchTerms,
  collectCredentials,
  buildReportData,
  generateCsv,
} from '@/lib/offboarding';
import { createOffboardingSheet } from '@/lib/integrations/google-sheets';

interface Params {
  params: { clientId: string };
}

interface ReportBody {
  cardIds?: string[];
  includeCredentials: boolean;
  format: 'google_sheet' | 'csv';
  extraSearchTerms?: string[];
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  let body: ReportBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid request body');
  }

  // Fetch client
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('*')
    .eq('id', params.clientId)
    .single();

  if (clientError || !client) return errorResponse('Client not found', 404);

  // Build search terms and discover cards
  const searchTerms = await buildSearchTerms(supabase, client, body.extraSearchTerms || []);
  let cards = await discoverClientCards(supabase, params.clientId, searchTerms);

  // If specific card IDs provided, filter to only those
  if (body.cardIds && body.cardIds.length > 0) {
    const idSet = new Set(body.cardIds);
    cards = cards.filter(c => idSet.has(c.id));
  }

  // Extract assets
  const { assets, fileAttachments } = await extractAssetLinks(supabase, cards);

  // Collect credentials if requested
  const credentials = body.includeCredentials
    ? await collectCredentials(supabase, params.clientId, userId)
    : [];

  // Build report
  const report = buildReportData(client, cards, assets, fileAttachments, credentials, searchTerms);

  if (body.format === 'csv') {
    const csv = generateCsv(report);
    const fileName = `${client.name.replace(/[^a-zA-Z0-9]/g, '_')}_Offboarding_${new Date().toISOString().split('T')[0]}.csv`;
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  }

  if (body.format === 'google_sheet') {
    try {
      const sheetUrl = await createOffboardingSheet(report, client.email || undefined);
      return NextResponse.json({ data: { sheetUrl } });
    } catch (err: any) {
      return errorResponse(`Google Sheets error: ${err.message}`, 500);
    }
  }

  return errorResponse('Invalid format. Use "csv" or "google_sheet"');
}
