import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { buildDailyScheduleMessage, sendToChat, editMessage, notifyNewEvent } from '@/lib/telegram-family';

const FAMILY_MEMBERS = (process.env.FAMILY_MEMBERS || '').split(',').map(s => s.trim()).filter(Boolean);
const DEFAULT_PERSON = process.env.DEFAULT_PERSON || 'כולם';
const CATEGORIES = process.env.FAMILY_CATEGORIES || 'אימון,חוג,עבודה,משפחה,אחר';
const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || '';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || '';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const callback = body.callback_query;
    if (callback) {
      const cbChatId = String(callback.message.chat.id);
      const cbMsgId = callback.message.message_id;
      const cbData = callback.data as string;

      if (cbData.startsWith('delete_event:')) {
        const eventId = cbData.replace('delete_event:', '');
        const supabase = createSupabaseAdminClient();
        const { error } = await supabase.from('family_events').delete().eq('id', eventId);
        await editMessage(cbChatId, cbMsgId, error ? '❌ שגיאה במחיקה' : '🗑 האירוע נמחק מהיומן');
      }
      return NextResponse.json({ ok: true });
    }

    const message = body.message;
    if (!message) return NextResponse.json({ ok: true });

    const chatId = String(message.chat.id);

    if (message.voice) {
      await handleVoiceMessage(chatId, message.voice.file_id);
      return NextResponse.json({ ok: true });
    }

    if (!message.text) return NextResponse.json({ ok: true });

    const text = message.text.trim();
    const botSuffix = BOT_USERNAME ? `@${BOT_USERNAME}` : '';

    if (text === '/today' || text === `/today${botSuffix}`) {
      await handleToday(chatId);
    } else if (text === '/tomorrow' || text === `/tomorrow${botSuffix}`) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      await handleDaySchedule(chatId, tomorrow);
    } else if (text === '/week' || text === `/week${botSuffix}`) {
      await handleWeek(chatId);
    } else if (text === '/site' || text === `/site${botSuffix}`) {
      await sendToChat(chatId, `🌐 <b>היומן המשפחתי באתר</b>\n\n📅 כניסה ליומן:\n${APP_URL}/family-schedule\n\n💡 באתר תוכלו לראות את כל האירועים, להוסיף ולערוך בקלות`);
    } else if (text === '/help' || text === `/help${botSuffix}` || text === '/start' || text === `/start${botSuffix}`) {
      await sendToChat(chatId, `🤖 <b>בוט היומן המשפחתי</b>\n\n📝 <b>להוספת אירוע:</b> פשוט כתבו בשפה חופשית או שלחו הודעה קולית\nלדוגמה: "אימון יום שני 18:00"\n\n📋 <b>פקודות:</b>\n/today - לוז היום\n/tomorrow - לוז מחר\n/week - לוז שבועי\n/site - לינק ליומן באתר\n/help - עזרה`);
    } else if (!text.startsWith('/')) {
      await handleAddEvent(chatId, text);
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}

async function handleToday(chatId: string) {
  await handleDaySchedule(chatId, new Date());
}

async function handleDaySchedule(chatId: string, date: Date) {
  const supabase = createSupabaseAdminClient();
  const startOfDay = new Date(date); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date); endOfDay.setHours(23, 59, 59, 999);

  const { data: events } = await supabase
    .from('family_events')
    .select('*')
    .gte('start_time', startOfDay.toISOString())
    .lte('start_time', endOfDay.toISOString())
    .order('start_time', { ascending: true });

  const message = buildDailyScheduleMessage(events || [], date);
  await sendToChat(chatId, message);
}

async function handleWeek(chatId: string) {
  const supabase = createSupabaseAdminClient();
  const today = new Date();
  const sunday = new Date(today); sunday.setDate(today.getDate() - today.getDay()); sunday.setHours(0, 0, 0, 0);
  const saturday = new Date(sunday); saturday.setDate(sunday.getDate() + 6); saturday.setHours(23, 59, 59, 999);

  const { data: events } = await supabase
    .from('family_events')
    .select('*')
    .gte('start_time', sunday.toISOString())
    .lte('start_time', saturday.toISOString())
    .order('start_time', { ascending: true });

  const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

  if (!events || events.length === 0) {
    await sendToChat(chatId, '📋 <b>לוז שבועי</b>\n\n✨ אין אירועים השבוע!');
    return;
  }

  const byDay: Record<number, typeof events> = {};
  events.forEach(e => { const day = new Date(e.start_time).getDay(); if (!byDay[day]) byDay[day] = []; byDay[day].push(e); });

  let msg = `📋 <b>לוז שבועי</b>\n${sunday.getDate()}/${sunday.getMonth() + 1} - ${saturday.getDate()}/${saturday.getMonth() + 1}\n`;
  for (let i = 0; i < 7; i++) {
    const dayEvents = byDay[i];
    if (dayEvents && dayEvents.length > 0) {
      msg += `\n<b>📅 יום ${DAYS_HE[i]}:</b>\n`;
      dayEvents.forEach(e => {
        const time = new Date(e.start_time).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jerusalem' });
        msg += `  ${time} - ${e.title} (${e.person})\n`;
      });
    }
  }
  msg += `\n📊 סה"כ ${events.length} אירועים השבוע`;
  await sendToChat(chatId, msg);
}

const AI_SYSTEM_PROMPT = `אתה עוזר לפענח טקסט חופשי לאירוע ביומן משפחתי.

האנשים במשפחה: ${FAMILY_MEMBERS.join(', ')}, כולם
קטגוריות: ${CATEGORIES}

כללים:
- אם לא צוין שם, ברירת מחדל: ${DEFAULT_PERSON}
- אם לא צוינה קטגוריה, נסה להסיק. ברירת מחדל: אחר
- אם לא צוין תאריך, השתמש בהיום (שים לב לאזור זמן ישראל)
- אם לא צוינה שעת סיום, הוסף שעה לשעת ההתחלה
- אם צוין יום בשבוע (למשל "יום שני"), חשב את התאריך הקרוב ביותר קדימה
- זהה בקשות תזכורת: "תזכיר לי", "הזכר לי", "שלח תזכורת" וכו'
  * 5 דקות לפני = 5
  * 10 דקות לפני = 10
  * 15 דקות לפני = 15
  * 30 דקות לפני = 30
  * שעה לפני = 60
  * שעתיים לפני = 120
  * יום לפני / 24 שעות לפני = 1440
- החזר JSON בלבד

פורמט תשובה (JSON בלבד):
{
  "title": "שם האירוע",
  "person": "שם האדם",
  "category": "קטגוריה",
  "date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD",
  "start_time": "HH:MM",
  "end_time": "HH:MM",
  "recurring": false,
  "reminder_minutes": null,
  "notes": ""
}`;

async function handleAddEvent(chatId: string, text: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) { await sendToChat(chatId, '❌ שגיאה: חסר מפתח OpenAI'); return; }

  const now = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  const dayName = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'][new Date().getDay()];

  try {
    await sendToChat(chatId, '🔄 מעבד...');

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: AI_SYSTEM_PROMPT + `\n\nהיום: ${now} (יום ${dayName})` },
          { role: 'user', content: text },
        ],
        temperature: 0.1, max_tokens: 300,
      }),
    });

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) { await sendToChat(chatId, '❌ לא הצלחתי להבין את ההודעה'); return; }

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) { await sendToChat(chatId, '❌ לא הצלחתי לפענח את האירוע'); return; }

    const parsed = JSON.parse(jsonMatch[0]);
    const endDate = parsed.end_date || parsed.date;

    const ilOffset = (dt: string) => {
      const d = new Date(dt);
      const utc = d.toLocaleString('en-US', { timeZone: 'UTC' });
      const il = d.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' });
      return (new Date(il).getTime() - new Date(utc).getTime()) / 3600000;
    };
    const offsetH = ilOffset(new Date().toISOString());
    const pad = (n: number) => `${n >= 0 ? '+' : '-'}${String(Math.abs(n)).padStart(2, '0')}:00`;
    const tz = pad(offsetH);
    const startTime = new Date(`${parsed.date}T${parsed.start_time}:00${tz}`).toISOString();
    const endTime = new Date(`${endDate}T${parsed.end_time}:00${tz}`).toISOString();

    const supabase = createSupabaseAdminClient();
    const { data: inserted, error } = await supabase.from('family_events').insert({
      title: parsed.title, person: parsed.person, category: parsed.category,
      start_time: startTime, end_time: endTime,
      recurring: parsed.recurring || false,
      reminder_minutes: parsed.reminder_minutes || null,
      notes: parsed.notes || null,
    }).select('id').single();

    if (error) { await sendToChat(chatId, `❌ שגיאה בשמירה: ${error.message}`); return; }

    const DAYS_HE_L = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
    const evDay = DAYS_HE_L[new Date(parsed.date).getDay()];
    const multiDay = parsed.end_date && parsed.end_date !== parsed.date;

    let msg = `✅ <b>אירוע נוסף ליומן!</b>\n\n📌 <b>${parsed.title}</b>\n👤 ${parsed.person}\n🗓 יום ${evDay}, ${parsed.date}`;
    if (multiDay) msg += ` עד ${parsed.end_date}`;
    msg += `\n🕐 ${parsed.start_time} - ${parsed.end_time}`;
    if (parsed.reminder_minutes) {
      let reminderText = '';
      if (parsed.reminder_minutes >= 1440) reminderText = 'יום לפני';
      else if (parsed.reminder_minutes >= 120) reminderText = `${parsed.reminder_minutes / 60} שעות לפני`;
      else if (parsed.reminder_minutes >= 60) reminderText = 'שעה לפני';
      else reminderText = `${parsed.reminder_minutes} דקות לפני`;
      msg += `\n⏰ תזכורת: ${reminderText}`;
    }
    if (parsed.notes) msg += `\n📝 ${parsed.notes}`;

    await sendToChat(chatId, msg, [[{ text: '🗑 מחק אירוע', callback_data: `delete_event:${inserted.id}` }]]);

    notifyNewEvent({
      title: parsed.title, person: parsed.person, category: parsed.category,
      start_time: startTime, end_time: endTime,
      notes: parsed.notes || null, reminder_minutes: parsed.reminder_minutes || null,
    }, chatId).catch(() => {});
  } catch {
    await sendToChat(chatId, '❌ שגיאה בעיבוד ההודעה');
  }
}

async function handleVoiceMessage(chatId: string, fileId: string) {
  const botToken = process.env.TELEGRAM_CHAT_BOT_FAMILY;
  const apiKey = process.env.OPENAI_API_KEY;

  if (!botToken || !apiKey) { await sendToChat(chatId, '❌ שגיאה: חסרים מפתחות API'); return; }

  try {
    await sendToChat(chatId, '🎤 מעבד הודעה קולית...');

    const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
    const fileData = await fileRes.json();
    if (!fileData.ok || !fileData.result.file_path) {
      await sendToChat(chatId, '❌ לא הצלחתי להוריד את ההודעה הקולית'); return;
    }

    const fileUrl = `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`;
    const audioRes = await fetch(fileUrl);
    const audioBuffer = await audioRes.arrayBuffer();

    const formData = new FormData();
    formData.append('file', new Blob([audioBuffer], { type: 'audio/ogg' }), 'voice.ogg');
    formData.append('model', 'whisper-1');
    formData.append('language', 'he');

    const transcribeRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', headers: { 'Authorization': `Bearer ${apiKey}` }, body: formData,
    });

    const transcription = await transcribeRes.json();
    if (!transcription.text) { await sendToChat(chatId, '❌ לא הצלחתי לתמלל את ההודעה הקולית'); return; }

    await sendToChat(chatId, `📝 תמלול: "${transcription.text}"`);
    await handleAddEvent(chatId, transcription.text);
  } catch {
    await sendToChat(chatId, '❌ שגיאה בעיבוד הודעה קולית');
  }
}
