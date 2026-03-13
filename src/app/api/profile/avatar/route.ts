import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, successResponse, errorResponse } from '@/lib/api-helpers';

const MAX_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/**
 * POST /api/profile/avatar
 * Upload a profile avatar. Accepts multipart/form-data with a `file` field.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  let file: File | null = null;
  try {
    const formData = await request.formData();
    file = formData.get('file') as File | null;
  } catch {
    return errorResponse('Failed to parse form data');
  }

  if (!file) return errorResponse('No file provided');
  if (file.size > MAX_SIZE) return errorResponse('File too large. Maximum 2MB.');
  if (!ALLOWED_TYPES.includes(file.type)) {
    return errorResponse('Invalid file type. Use JPEG, PNG, WebP, or GIF.');
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const storagePath = `${userId}/avatar.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    return errorResponse(`Upload failed: ${uploadError.message}`);
  }

  const { data: urlData } = supabase.storage
    .from('avatars')
    .getPublicUrl(storagePath);

  // Add cache-buster so the browser picks up the new image
  const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', userId);

  if (updateError) {
    return errorResponse(`Failed to update profile: ${updateError.message}`);
  }

  return successResponse({ avatar_url: avatarUrl });
}

/**
 * DELETE /api/profile/avatar
 * Remove the current avatar.
 */
export async function DELETE() {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase, userId } = auth.ctx;

  // List files in user's avatar folder to find the current one
  const { data: files } = await supabase.storage
    .from('avatars')
    .list(userId);

  if (files && files.length > 0) {
    const paths = files.map((f) => `${userId}/${f.name}`);
    await supabase.storage.from('avatars').remove(paths);
  }

  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: null })
    .eq('id', userId);

  if (error) {
    return errorResponse(`Failed to update profile: ${error.message}`);
  }

  return successResponse({ success: true });
}
