// ============================================================================
// Google Ads Competitive Intel - TypeScript Client
// Talks to forked talknerdytome-labs service on VPS (port 8101)
// MIT License - Copyright (c) 2025 Gala Labs Inc
// ============================================================================

const GADS_INTEL_BASE = process.env.GADS_INTEL_URL || 'http://5.161.71.94:8101';
const INTERNAL_AUTH = process.env.VPS_INTERNAL_AUTH || '';

interface IntelRequestOptions {
  teamConfigId: string;
}

interface CompetitorAd {
  advertiser_name: string;
  advertiser_url: string;
  ad_id: string;
  creative_type: string;
  headline: string;
  description: string;
  call_to_action: string | null;
  first_shown: string;
  last_shown: string;
  regions: string[];
  platforms: string[];
  image_url: string | null;
  video_url: string | null;
}

interface AdDetails {
  ad_id: string;
  advertiser_name: string;
  headline: string;
  description: string;
  variations: Array<{
    headline: string;
    description: string;
    region: string;
    platform: string;
  }>;
  regional_stats: Array<{
    region: string;
    impression_estimate: string;
    date_range: string;
  }>;
  creative_assets: {
    images: string[];
    videos: string[];
  };
}

interface ImageAnalysis {
  description: string;
  brand_elements: string[];
  messaging_strategy: string;
  color_palette: string[];
  call_to_action: string | null;
  competitive_insights: string;
}

interface VideoAnalysis {
  summary: string;
  duration_seconds: number;
  key_messages: string[];
  brand_mentions: string[];
  production_quality: string;
  competitive_insights: string;
}

async function gadsIntelFetch<T>(
  path: string,
  opts: IntelRequestOptions,
  params?: Record<string, string>
): Promise<{ data: T | null; error: string | null }> {
  try {
    const url = new URL(path, GADS_INTEL_BASE);
    url.searchParams.set('team_config_id', opts.teamConfigId);
    if (params) {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    }

    const res = await fetch(url.toString(), {
      headers: {
        'X-Internal-Auth': INTERNAL_AUTH,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(45_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => 'Unknown error');
      return { data: null, error: `HTTP ${res.status}: ${text.slice(0, 500)}` };
    }

    const data = await res.json();
    return { data: data as T, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : String(err) };
  }
}

async function gadsIntelPost<T>(
  path: string,
  opts: IntelRequestOptions,
  body: Record<string, unknown>
): Promise<{ data: T | null; error: string | null }> {
  try {
    const url = new URL(path, GADS_INTEL_BASE);
    url.searchParams.set('team_config_id', opts.teamConfigId);

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'X-Internal-Auth': INTERNAL_AUTH,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => 'Unknown error');
      return { data: null, error: `HTTP ${res.status}: ${text.slice(0, 500)}` };
    }

    const data = await res.json();
    return { data: data as T, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Public API ────────────────────────────────────────────────────────────

export async function getCompetitorAds(
  opts: IntelRequestOptions,
  domain: string,
  keyword?: string,
  limit?: number
) {
  const params: Record<string, string> = { domain };
  if (keyword) params.keyword = keyword;
  if (limit) params.limit = String(limit);
  return gadsIntelFetch<CompetitorAd[]>('/competitor-ads', opts, params);
}

export async function getAdDetails(
  opts: IntelRequestOptions,
  adId: string
) {
  return gadsIntelFetch<AdDetails>('/ad-details', opts, { ad_id: adId });
}

export async function analyzeAdImage(
  opts: IntelRequestOptions,
  imageUrl: string,
  context?: string
) {
  return gadsIntelPost<ImageAnalysis>('/analyze-image', opts, {
    image_url: imageUrl,
    context: context || '',
  });
}

export async function analyzeAdVideo(
  opts: IntelRequestOptions,
  videoUrl: string,
  context?: string
) {
  return gadsIntelPost<VideoAnalysis>('/analyze-video', opts, {
    video_url: videoUrl,
    context: context || '',
  });
}

export type {
  IntelRequestOptions,
  CompetitorAd,
  AdDetails,
  ImageAnalysis,
  VideoAnalysis,
};
