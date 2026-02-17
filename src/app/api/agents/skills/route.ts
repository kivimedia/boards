import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';
import { listSkills, createSkill, seedSkills, updateImprovedSkills } from '@/lib/agent-engine';

/**
 * GET /api/agents/skills — List all available skills
 * Query params: category, pack, quality_tier, search, is_active
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const skills = await listSkills(auth.ctx.supabase, {
      category: url.searchParams.get('category') as any,
      pack: url.searchParams.get('pack') as any,
      quality_tier: url.searchParams.get('quality_tier') as any,
      is_active: url.searchParams.get('is_active') === 'false' ? false : true,
      search: url.searchParams.get('search') ?? undefined,
    });

    return successResponse(skills);
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
}

/**
 * POST /api/agents/skills — Create a custom skill, seed defaults, or apply improvements
 * Body: { action: 'seed' } to seed all default skills
 * Body: { action: 'update_improved' } to apply quality improvements to already-seeded skills
 * Body: { slug, name, description, ... } to create a custom skill
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();

    if (body.action === 'seed') {
      // Seed all default skills
      const prompts = new Map<string, string>();
      if (body.prompts) {
        for (const [slug, prompt] of Object.entries(body.prompts)) {
          prompts.set(slug, prompt as string);
        }
      }
      const result = await seedSkills(auth.ctx.supabase, prompts);
      return successResponse(result, 201);
    }

    if (body.action === 'update_improved') {
      // Apply quality improvements to already-seeded skills + log improvements
      const prompts = new Map<string, string>();
      if (body.prompts) {
        for (const [slug, prompt] of Object.entries(body.prompts)) {
          prompts.set(slug, prompt as string);
        }
      }
      const result = await updateImprovedSkills(auth.ctx.supabase, prompts);
      return successResponse(result);
    }

    // Create a custom skill
    const skill = await createSkill(auth.ctx.supabase, body);
    return successResponse(skill, 201);
  } catch (err: any) {
    return errorResponse(err.message, 500);
  }
}
