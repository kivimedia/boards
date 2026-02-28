import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import type { PageForgeNamingIssue, PageForgeDesignerFixRequest } from '@/lib/types';

interface Params {
  params: { id: string };
}

/**
 * POST /api/pageforge/builds/[id]/designer-request
 * Generate a Designer Fix Request document from selected naming issues.
 * Body: { issues: string[], feedback: string }
 *   - issues: array of nodeIds to request fixes for
 *   - feedback: optional message for the designer
 */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  let body: { issues: string[]; feedback: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const { issues: requestedNodeIds, feedback } = body;

  if (!requestedNodeIds || !Array.isArray(requestedNodeIds) || requestedNodeIds.length === 0) {
    return errorResponse('issues array with at least one nodeId is required');
  }

  // Fetch the build
  const { data: build, error: buildError } = await auth.ctx.supabase
    .from('pageforge_builds')
    .select('id, artifacts, page_title, figma_file_key')
    .eq('id', params.id)
    .single();

  if (buildError || !build) {
    return errorResponse('Build not found', 404);
  }

  const artifacts = (build.artifacts || {}) as Record<string, any>;
  const namingData = artifacts.preflight?.figma_naming;

  if (!namingData?.issues || namingData.issues.length === 0) {
    return errorResponse('No naming issues found in preflight data');
  }

  // Filter to only the requested nodeIds
  const allIssues: PageForgeNamingIssue[] = namingData.issues;
  const nodeIdSet = new Set(requestedNodeIds);
  const filteredIssues = allIssues.filter((issue) => nodeIdSet.has(issue.nodeId));

  if (filteredIssues.length === 0) {
    return errorResponse('None of the specified nodeIds match existing naming issues');
  }

  // Build the designer fix request object
  const designerFixRequest: PageForgeDesignerFixRequest = {
    requested_at: new Date().toISOString(),
    requested_by: auth.ctx.userId,
    feedback: feedback || '',
    issues: filteredIssues,
    status: 'pending',
  };

  // Update build artifacts with the designer fix request
  const updatedArtifacts = {
    ...artifacts,
    designer_fix_request: designerFixRequest,
  };

  const { error: updateError } = await auth.ctx.supabase
    .from('pageforge_builds')
    .update({
      artifacts: updatedArtifacts,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id);

  if (updateError) {
    return errorResponse('Failed to save designer fix request');
  }

  // Generate a markdown report
  const figmaUrl = `https://www.figma.com/file/${build.figma_file_key}`;
  const lines: string[] = [
    `# Designer Fix Request - ${build.page_title}`,
    '',
    `**Figma File:** ${figmaUrl}`,
    `**Requested:** ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
    `**Issues Found:** ${filteredIssues.length}`,
    '',
  ];

  if (feedback) {
    lines.push('## Notes from Requester', '', feedback, '');
  }

  lines.push('## Naming Issues to Fix', '');
  lines.push('| # | Current Name | Type | Issue | Suggested Fix |');
  lines.push('|---|---|---|---|---|');

  filteredIssues.forEach((issue, idx) => {
    const typeName = issue.nodeType.toLowerCase().replace(/_/g, ' ');
    lines.push(
      `| ${idx + 1} | \`${issue.nodeName}\` | ${typeName} | ${issue.issue} | ${issue.suggested} |`
    );
  });

  lines.push('');
  lines.push(
    '---',
    '',
    'Please rename the listed layers in Figma following the conventions above, then notify the team when complete.'
  );

  const markdownReport = lines.join('\n');

  return successResponse({
    designer_fix_request: designerFixRequest,
    markdown_report: markdownReport,
  });
}

/**
 * GET /api/pageforge/builds/[id]/designer-request
 * Get the current designer fix request status.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { data: build, error: buildError } = await auth.ctx.supabase
    .from('pageforge_builds')
    .select('id, artifacts')
    .eq('id', params.id)
    .single();

  if (buildError || !build) {
    return errorResponse('Build not found', 404);
  }

  const artifacts = (build.artifacts || {}) as Record<string, any>;
  const designerFixRequest = artifacts.designer_fix_request || null;

  return successResponse({ designer_fix_request: designerFixRequest });
}

/**
 * PATCH /api/pageforge/builds/[id]/designer-request
 * Mark the designer fix request as resolved.
 */
export async function PATCH(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { data: build, error: buildError } = await auth.ctx.supabase
    .from('pageforge_builds')
    .select('id, artifacts')
    .eq('id', params.id)
    .single();

  if (buildError || !build) {
    return errorResponse('Build not found', 404);
  }

  const artifacts = (build.artifacts || {}) as Record<string, any>;

  if (!artifacts.designer_fix_request) {
    return errorResponse('No designer fix request exists for this build');
  }

  if (artifacts.designer_fix_request.status === 'resolved') {
    return errorResponse('Designer fix request is already resolved');
  }

  const updatedRequest = {
    ...artifacts.designer_fix_request,
    status: 'resolved',
    resolved_at: new Date().toISOString(),
  };

  const updatedArtifacts = {
    ...artifacts,
    designer_fix_request: updatedRequest,
  };

  const { error: updateError } = await auth.ctx.supabase
    .from('pageforge_builds')
    .update({
      artifacts: updatedArtifacts,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id);

  if (updateError) {
    return errorResponse('Failed to update designer fix request');
  }

  return successResponse({ designer_fix_request: updatedRequest });
}
