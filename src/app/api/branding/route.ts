import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';
import { getPortalBranding, upsertPortalBranding } from '@/lib/analytics';

export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('client_id') ?? undefined;

  const branding = await getPortalBranding(auth.ctx.supabase, clientId);
  return successResponse(branding);
}

interface UpsertBrandingBody {
  client_id?: string;
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  favicon_url?: string;
  custom_domain?: string;
  company_name?: string;
  footer_text?: string;
  is_active?: boolean;
}

export async function PUT(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<UpsertBrandingBody>(request);
  if (!body.ok) return body.response;

  const branding = await upsertPortalBranding(auth.ctx.supabase, {
    clientId: body.body.client_id,
    logoUrl: body.body.logo_url,
    primaryColor: body.body.primary_color,
    secondaryColor: body.body.secondary_color,
    accentColor: body.body.accent_color,
    faviconUrl: body.body.favicon_url,
    customDomain: body.body.custom_domain,
    companyName: body.body.company_name,
    footerText: body.body.footer_text,
    isActive: body.body.is_active,
  });

  if (!branding) return errorResponse('Failed to save branding', 500);
  return successResponse(branding);
}
