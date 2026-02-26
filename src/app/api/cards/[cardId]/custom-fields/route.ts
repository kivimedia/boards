import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { auth } from '@clerk/nextjs/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { cardId: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { cardId } = params;
    const { searchParams } = new URL(request.url);
    const boardId = searchParams.get('boardId');

    if (!boardId) {
      return NextResponse.json({ error: 'boardId is required' }, { status: 400 });
    }

    const supabase = await createClient();

    // Fetch definitions and values in parallel
    const [defsResult, valsResult] = await Promise.all([
      supabase
        .from('custom_field_definitions')
        .select('*')
        .eq('board_id', boardId)
        .order('position', { ascending: true }),
      supabase
        .from('custom_field_values')
        .select('*, definition:custom_field_definitions(*)')
        .eq('card_id', cardId),
    ]);

    if (defsResult.error) {
      console.error('[API] custom_field_definitions error:', defsResult.error);
      return NextResponse.json(
        { error: 'Failed to load custom field definitions', details: defsResult.error.message },
        { status: 500 }
      );
    }

    if (valsResult.error) {
      console.error('[API] custom_field_values error:', valsResult.error);
      return NextResponse.json(
        { error: 'Failed to load custom field values', details: valsResult.error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      definitions: defsResult.data || [],
      values: valsResult.data || [],
    });
  } catch (error) {
    console.error('[API] Custom fields error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
