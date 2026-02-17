import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getGitHubLinks, createGitHubLink } from '@/lib/integrations';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const links = await getGitHubLinks(auth.ctx.supabase, id);
  return successResponse(links);
}

interface CreateGitHubLinkBody {
  integration_id: string;
  repo_owner: string;
  repo_name: string;
  link_type: 'issue' | 'pull_request' | 'branch';
  github_id?: number;
  github_url: string;
  state?: string;
  title?: string;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await parseBody<CreateGitHubLinkBody>(request);
  if (!body.ok) return body.response;

  const { integration_id, repo_owner, repo_name, link_type, github_url } = body.body;

  if (!integration_id) return errorResponse('Integration ID is required');
  if (!repo_owner?.trim()) return errorResponse('Repository owner is required');
  if (!repo_name?.trim()) return errorResponse('Repository name is required');
  if (!link_type) return errorResponse('Link type is required');
  if (!['issue', 'pull_request', 'branch'].includes(link_type)) return errorResponse('Invalid link type');
  if (!github_url?.trim()) return errorResponse('GitHub URL is required');

  const link = await createGitHubLink(auth.ctx.supabase, {
    integrationId: integration_id,
    cardId: id,
    repoOwner: repo_owner.trim(),
    repoName: repo_name.trim(),
    linkType: link_type,
    githubId: body.body.github_id,
    githubUrl: github_url.trim(),
    state: body.body.state,
    title: body.body.title,
  });

  if (!link) return errorResponse('Failed to create GitHub link', 500);
  return successResponse(link, 201);
}
