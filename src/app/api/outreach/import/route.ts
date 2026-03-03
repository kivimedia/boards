import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { parseCSV, parsePastedText, checkDuplicates } from '@/lib/outreach/lead-parser';

/**
 * POST /api/outreach/import - Import leads from CSV or pasted text
 *
 * Body: {
 *   mode: 'csv' | 'paste';
 *   content: string;          // CSV text or pasted LinkedIn search results
 *   selected_indices?: number[];  // Which leads to actually import (from preview)
 *   confirm?: boolean;        // If true, actually insert into DB. If false, return preview.
 * }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  let body: {
    mode: 'csv' | 'paste';
    content: string;
    selected_indices?: number[];
    confirm?: boolean;
  };

  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  if (!body.mode || !body.content) {
    return errorResponse('mode and content are required', 400);
  }

  // Parse the input
  const parseResult = body.mode === 'csv'
    ? parseCSV(body.content)
    : parsePastedText(body.content);

  if (parseResult.leads.length === 0) {
    return errorResponse('No valid leads found in input', 400);
  }

  // Check duplicates against existing leads
  const leadsWithDupes = await checkDuplicates(supabase, userId, parseResult.leads);
  const duplicatesFound = leadsWithDupes.filter(l => l.is_duplicate).length;

  // If this is a preview request, return the parsed data
  if (!body.confirm) {
    return successResponse({
      preview: true,
      leads: leadsWithDupes,
      total_parsed: parseResult.total_parsed,
      duplicates_found: duplicatesFound,
      auto_qualified: parseResult.auto_qualified,
      auto_skipped: parseResult.auto_skipped,
      needs_review: parseResult.needs_review,
      errors: parseResult.errors,
    });
  }

  // Filter to selected leads only
  let leadsToImport = leadsWithDupes;
  if (body.selected_indices && body.selected_indices.length > 0) {
    const selectedSet = new Set(body.selected_indices);
    leadsToImport = leadsWithDupes.filter(l => selectedSet.has(l.row_index));
  } else {
    // Default: import all selected (non-duplicate, non-skip) leads
    leadsToImport = leadsWithDupes.filter(l => l.selected && !l.is_duplicate);
  }

  if (leadsToImport.length === 0) {
    return errorResponse('No leads selected for import', 400);
  }

  // Create batch record
  const { data: batch, error: batchError } = await supabase
    .from('li_batches')
    .insert({
      user_id: userId,
      source_type: body.mode === 'csv' ? 'csv' : 'paste',
      total_imported: leadsToImport.length,
      duplicates_found: duplicatesFound,
      status: 'processing',
    })
    .select()
    .single();

  if (batchError || !batch) {
    return errorResponse(`Failed to create batch: ${batchError?.message}`, 500);
  }

  // Insert leads
  const leadRows = leadsToImport.map(lead => ({
    user_id: userId,
    batch_id: batch.id,
    full_name: lead.full_name,
    first_name: lead.first_name,
    last_name: lead.last_name,
    linkedin_url: lead.linkedin_url,
    email: lead.email,
    job_position: lead.job_position,
    company_name: lead.company_name,
    company_url: lead.company_url,
    country: lead.country,
    city: lead.city,
    state: lead.state,
    connection_degree: lead.connection_degree,
    connections_count: lead.connections_count,
    pipeline_stage: 'TO_ENRICH',
    qualification_status: 'pending',
    enrichment_tier: 0,
  }));

  const { data: insertedLeads, error: insertError } = await supabase
    .from('li_leads')
    .insert(leadRows)
    .select('id');

  if (insertError) {
    // Update batch as failed
    await supabase.from('li_batches').update({ status: 'failed', error_message: insertError.message }).eq('id', batch.id);
    return errorResponse(`Failed to insert leads: ${insertError.message}`, 500);
  }

  // Update batch as completed
  await supabase.from('li_batches').update({
    status: 'completed',
    total_imported: insertedLeads?.length || 0,
    completed_at: new Date().toISOString(),
  }).eq('id', batch.id);

  // Log pipeline events
  if (insertedLeads) {
    const events = insertedLeads.map(lead => ({
      lead_id: lead.id,
      from_stage: null,
      to_stage: 'TO_ENRICH',
      triggered_by: 'scout',
      notes: `Imported via ${body.mode}`,
    }));

    await supabase.from('li_pipeline_events').insert(events);
  }

  return successResponse({
    batch_id: batch.id,
    imported: insertedLeads?.length || 0,
    duplicates_skipped: duplicatesFound,
    errors: parseResult.errors,
  });
}
