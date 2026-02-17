import { NextRequest } from 'next/server';
import { getAuthContext, errorResponse, parseBody } from '@/lib/api-helpers';
import {
  generateIndividualReport,
  generateTeamReport,
  generateDepartmentReport,
  generateExecutiveReport,
  reportToCSV,
} from '@/lib/productivity-report-generator';

interface GenerateBody {
  report_type: 'individual' | 'team' | 'department' | 'executive';
  start_date: string;
  end_date: string;
  user_id?: string;
  format?: 'json' | 'csv';
  compare_previous?: boolean;
}

/**
 * POST /api/productivity/reports/generate
 * Generate and return a productivity report.
 * Returns JSON data or CSV text depending on format param.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;

  const parsed = await parseBody<GenerateBody>(request);
  if (!parsed.ok) return parsed.response;

  const { report_type, start_date, end_date, user_id, format, compare_previous } = parsed.body;

  if (!report_type) return errorResponse('report_type is required');
  if (!start_date || !end_date) return errorResponse('start_date and end_date are required');

  try {
    let report;

    switch (report_type) {
      case 'individual':
        if (!user_id) return errorResponse('user_id is required for individual reports');
        report = await generateIndividualReport(supabase, user_id, start_date, end_date, compare_previous);
        break;
      case 'team':
        report = await generateTeamReport(supabase, start_date, end_date);
        break;
      case 'department':
        report = await generateDepartmentReport(supabase, start_date, end_date, compare_previous);
        break;
      case 'executive':
        report = await generateExecutiveReport(supabase, start_date, end_date);
        break;
      default:
        return errorResponse(`Invalid report_type: ${report_type}`);
    }

    if (format === 'csv') {
      const csv = reportToCSV(report);
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="productivity-${report_type}-${start_date}-${end_date}.csv"`,
        },
      });
    }

    return Response.json({ data: report });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate report';
    return errorResponse(message, 500);
  }
}
