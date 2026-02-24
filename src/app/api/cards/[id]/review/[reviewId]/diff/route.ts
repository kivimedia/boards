import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateDesignDiff } from '@/lib/ai/visual-diff';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; reviewId: string } }
) {
  const supabase = createServerSupabaseClient();

  // Get the review to find attachment paths
  const { data: review } = await supabase
    .from('ai_review_results')
    .select('attachment_id, previous_attachment_id')
    .eq('id', params.reviewId)
    .eq('card_id', params.id)
    .single();

  if (!review || !review.previous_attachment_id) {
    return NextResponse.json(
      { error: 'Review not found or no previous attachment for comparison' },
      { status: 404 }
    );
  }

  // Get attachment storage paths
  const { data: currentAttachment } = await supabase
    .from('attachments')
    .select('storage_path')
    .eq('id', review.attachment_id)
    .single();

  const { data: previousAttachment } = await supabase
    .from('attachments')
    .select('storage_path')
    .eq('id', review.previous_attachment_id)
    .single();

  if (!currentAttachment || !previousAttachment) {
    return NextResponse.json({ error: 'Attachments not found' }, { status: 404 });
  }

  const result = await generateDesignDiff(
    supabase,
    currentAttachment.storage_path,
    previousAttachment.storage_path,
    params.id,
    params.reviewId
  );

  if (!result) {
    return NextResponse.json({ error: 'Failed to generate diff' }, { status: 500 });
  }

  // Get public URL for the diff image
  const { data: urlData } = supabase.storage
    .from('card-attachments')
    .getPublicUrl(result.diffStoragePath);

  return NextResponse.json({
    diffUrl: urlData.publicUrl,
    mismatchPercentage: result.mismatchPercentage,
    diffStoragePath: result.diffStoragePath,
  });
}
