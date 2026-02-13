import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { sendToAllChats } from '@/lib/telegram-family';

export async function GET() {
  return handleCheckReminders();
}

export async function POST() {
  return handleCheckReminders();
}

async function handleCheckReminders() {
  if (process.env.DISABLE_CRON_JOBS === 'true') {
    return NextResponse.json({ success: true, message: 'Cron jobs disabled' });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const { data: events, error } = await supabase
      .from('family_events')
      .select('*')
      .not('reminder_minutes', 'is', null)
      .gte('start_time', oneHourAgo.toISOString());

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const remindersToSend: Array<{ id: string; title: string; person: string; category: string; start_time: string; reminder_minutes: number }> = [];
    const nowMs = now.getTime();

    for (const event of events || []) {
      const startTime = new Date(event.start_time);
      const reminderTime = new Date(startTime.getTime() - (event.reminder_minutes * 60 * 1000));
      const timeDiff = nowMs - reminderTime.getTime();

      if (timeDiff >= 0 && timeDiff < 6 * 60 * 1000) {
        remindersToSend.push(event);
      }
    }

    const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    const CATEGORY_EMOJI: Record<string, string> = {
      'אימון': '🏋️', 'חוג': '🎨', 'עבודה': '💼', 'משפחה': '👨‍👩‍👧‍👧', 'טיסה': '✈️', 'אחר': '📌',
    };

    const results = await Promise.all(
      remindersToSend.map(async (event) => {
        try {
          const startDate = new Date(event.start_time);
          const dayName = DAYS_HE[startDate.getDay()];
          const dateStr = `${startDate.getDate()}/${startDate.getMonth() + 1}`;
          const timeStr = startDate.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jerusalem' });
          const catEmoji = CATEGORY_EMOJI[event.category] || '📌';

          let reminderText = '';
          if (event.reminder_minutes >= 1440) reminderText = 'יום לפני';
          else if (event.reminder_minutes >= 120) reminderText = `${event.reminder_minutes / 60} שעות לפני`;
          else if (event.reminder_minutes >= 60) reminderText = 'שעה לפני';
          else reminderText = `${event.reminder_minutes} דקות לפני`;

          const message = `⏰ <b>תזכורת!</b>\n\n${catEmoji} <b>${event.title}</b>\n👤 ${event.person}\n🗓 יום ${dayName}, ${dateStr}\n🕐 <b>${timeStr}</b>\n\n📌 ${reminderText}`;

          const success = await sendToAllChats(message);
          return { eventId: event.id, success };
        } catch (err) {
          return { eventId: event.id, success: false, error: String(err) };
        }
      })
    );

    return NextResponse.json({
      success: true,
      remindersChecked: events?.length || 0,
      remindersSent: remindersToSend.length,
      results,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
