import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { sendDailySchedule } from '@/lib/telegram-family';

export async function GET(request: NextRequest) {
  if (process.env.DISABLE_CRON_JOBS === 'true') {
    return NextResponse.json({ success: true, message: 'Cron jobs disabled' });
  }

  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createSupabaseAdminClient();
    const now = new Date();
    const israelTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
    const startOfDay = new Date(israelTime);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(israelTime);
    endOfDay.setHours(23, 59, 59, 999);

    const { data: events } = await supabase
      .from('family_events')
      .select('*')
      .gte('start_time', startOfDay.toISOString())
      .lte('start_time', endOfDay.toISOString())
      .order('start_time', { ascending: true });

    const sent = await sendDailySchedule(events || [], israelTime);
    return NextResponse.json({ success: sent, eventsCount: events?.length || 0 });
  } catch {
    return NextResponse.json({ error: 'Failed to send daily schedule' }, { status: 500 });
  }
}

export async function POST() {
  if (process.env.DISABLE_CRON_JOBS === 'true') {
    return NextResponse.json({ success: true, message: 'Cron jobs disabled' });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const now = new Date();
    const israelTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
    const startOfDay = new Date(israelTime);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(israelTime);
    endOfDay.setHours(23, 59, 59, 999);

    const { data: events } = await supabase
      .from('family_events')
      .select('*')
      .gte('start_time', startOfDay.toISOString())
      .lte('start_time', endOfDay.toISOString())
      .order('start_time', { ascending: true });

    const sent = await sendDailySchedule(events || [], israelTime);
    return NextResponse.json({ success: sent, eventsCount: events?.length || 0 });
  } catch {
    return NextResponse.json({ error: 'Failed to send daily schedule' }, { status: 500 });
  }
}
