import { NextRequest } from 'next/server';
import { getAuthContext, successResponse, errorResponse, parseBody } from '@/lib/api-helpers';

interface Params {
  params: { id: string };
}

export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const { supabase } = auth.ctx;
  const cardId = params.id;

  const { data, error } = await supabase
    .from('attachments')
    .select('*')
    .eq('card_id', cardId)
    .order('created_at', { ascending: false });

  if (error) return errorResponse(error.message, 500);
  return successResponse(data);
}

interface CreateAttachmentBody {
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
}

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuthContext();
  if (!auth.ok) return auth.response;

  const body = await parseBody<CreateAttachmentBody>(request);
  if (!body.ok) return body.response;

  const { file_name, file_size, mime_type, storage_path } = body.body;

  if (!file_name?.trim()) return errorResponse('file_name is required');
  if (!storage_path?.trim()) return errorResponse('storage_path is required');
  if (file_size === undefined || file_size === null) return errorResponse('file_size is required');
  if (!mime_type?.trim()) return errorResponse('mime_type is required');

  const { supabase, userId } = auth.ctx;
  const cardId = params.id;

  const { data, error } = await supabase
    .from('attachments')
    .insert({
      card_id: cardId,
      file_name: file_name.trim(),
      file_size,
      mime_type: mime_type.trim(),
      storage_path: storage_path.trim(),
      uploaded_by: userId,
    })
    .select('*')
    .single();

  if (error) return errorResponse(error.message, 500);

  // Log activity
  await supabase.from('activity_log').insert({
    card_id: cardId,
    user_id: userId,
    event_type: 'attachment_uploaded',
    metadata: {
      attachment_id: data.id,
      file_name: data.file_name,
      file_size: data.file_size,
      mime_type: data.mime_type,
    },
  });

  return successResponse(data, 201);
}
