import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { notifyNewEvent } from '@/lib/telegram-family';

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseAdminClient();
    const { searchParams } = new URL(request.url);
    const start = searchParams.get('start');
    const end = searchParams.get('end');

    let query = supabase
      .from('family_events')
      .select('*')
      .order('start_time', { ascending: true });

    if (start) query = query.gte('start_time', start);
    if (end) query = query.lte('start_time', end);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ events: data });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseAdminClient();
    const body = await request.json();
    const { title, person, category, start_time, end_time, recurring, reminder_minutes, notes } = body;

    if (!title || !person || !category || !start_time || !end_time) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('family_events')
      .insert({ title, person, category, start_time, end_time, recurring: recurring || false, reminder_minutes: reminder_minutes || null, notes: notes || null })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    notifyNewEvent({ title, person, category, start_time, end_time, notes, reminder_minutes }).catch(() => {});

    return NextResponse.json({ event: data });
  } catch {
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
  }
}
