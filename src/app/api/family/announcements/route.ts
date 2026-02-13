import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from('family_announcements')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ announcements: data });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch announcements' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseAdminClient();
    const { text, color } = await request.json();

    if (!text) return NextResponse.json({ error: 'Missing text' }, { status: 400 });

    const { data, error } = await supabase
      .from('family_announcements')
      .insert({ text, color: color ?? 0 })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ announcement: data });
  } catch {
    return NextResponse.json({ error: 'Failed to create announcement' }, { status: 500 });
  }
}
