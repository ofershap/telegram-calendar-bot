const BOT_TOKEN = process.env.TELEGRAM_CHAT_BOT_FAMILY;
const CHAT_IDS = (process.env.TELEGRAM_CHAT_ID_FAMILY)?.split(',').map(id => id.trim()) || [];

const FAMILY_MEMBERS = (process.env.FAMILY_MEMBERS || '').split(',').map(s => s.trim()).filter(Boolean);
const FAMILY_EMOJIS = (process.env.FAMILY_MEMBER_EMOJIS || '').split(',').map(s => s.trim()).filter(Boolean);

const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

const PERSON_EMOJI: Record<string, string> = { 'כולם': '👨‍👩‍👧‍👧' };
FAMILY_MEMBERS.forEach((name, i) => {
  PERSON_EMOJI[name] = FAMILY_EMOJIS[i] || '👤';
});

const CATEGORY_EMOJI: Record<string, string> = {
  'אימון': '🏋️', 'חוג': '🎨', 'עבודה': '💼', 'משפחה': '👨‍👩‍👧‍👧', 'אחר': '📌',
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jerusalem' });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function sendMessage(text: string): Promise<boolean> {
  if (!BOT_TOKEN || CHAT_IDS.length === 0) return false;

  try {
    const results = await Promise.all(
      CHAT_IDS.map(async (chatId) => {
        const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
        });
        if (!res.ok) console.error(`Failed to send to ${chatId}:`, await res.text());
        return res.ok;
      })
    );
    return results.every(r => r);
  } catch (error) {
    console.error('sendMessage error:', error);
    return false;
  }
}

export async function notifyNewEvent(event: {
  title: string; person: string; category: string;
  start_time: string; end_time: string;
  notes?: string | null; reminder_minutes?: number | null;
}, excludeChatId?: string): Promise<boolean> {
  if (!BOT_TOKEN || CHAT_IDS.length === 0) return false;

  const personEmoji = PERSON_EMOJI[event.person] || '👤';
  const catEmoji = CATEGORY_EMOJI[event.category] || '📌';
  const startDate = new Date(event.start_time);
  const dayName = DAYS_HE[startDate.getDay()];

  let message = `📅 <b>אירוע חדש ביומן!</b>\n\n${catEmoji} <b>${escapeHtml(event.title)}</b>\n${personEmoji} ${escapeHtml(event.person)}\n🗓 יום ${dayName}, ${formatDate(event.start_time)}\n🕐 ${formatTime(event.start_time)} - ${formatTime(event.end_time)}`;

  if (event.reminder_minutes) {
    let reminderText = '';
    if (event.reminder_minutes >= 1440) reminderText = 'יום לפני';
    else if (event.reminder_minutes >= 120) reminderText = `${event.reminder_minutes / 60} שעות לפני`;
    else if (event.reminder_minutes >= 60) reminderText = 'שעה לפני';
    else reminderText = `${event.reminder_minutes} דקות לפני`;
    message += `\n⏰ תזכורת: ${reminderText}`;
  }
  if (event.notes) message += `\n📝 ${escapeHtml(event.notes)}`;

  const targetChatIds = excludeChatId ? CHAT_IDS.filter(id => id !== excludeChatId) : CHAT_IDS;
  if (targetChatIds.length === 0) return true;

  try {
    const results = await Promise.all(
      targetChatIds.map(async (chatId) => {
        const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML', disable_web_page_preview: true }),
        });
        return res.ok;
      })
    );
    return results.every(r => r);
  } catch {
    return false;
  }
}

export function buildDailyScheduleMessage(events: Array<{
  title: string; person: string; category: string;
  start_time: string; end_time: string;
  notes?: string | null; reminder_minutes?: number | null;
}>, date: Date): string {
  const dayName = DAYS_HE[date.getDay()];
  const dateStr = `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;

  if (events.length === 0) {
    return `📋 <b>לוז יומי - יום ${dayName} ${dateStr}</b>\n\n✨ אין אירועים מתוכננים להיום! יום חופשי 🎉`;
  }

  const sorted = [...events].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  const lines = sorted.map(e => {
    const personEmoji = PERSON_EMOJI[e.person] || '👤';
    const catEmoji = CATEGORY_EMOJI[e.category] || '📌';
    const reminderIcon = e.reminder_minutes ? ' ⏰' : '';
    return `${formatTime(e.start_time)}-${formatTime(e.end_time)} ${catEmoji} <b>${escapeHtml(e.title)}</b> ${personEmoji} ${escapeHtml(e.person)}${reminderIcon}`;
  });

  const personCounts: Record<string, number> = {};
  events.forEach(e => { personCounts[e.person] = (personCounts[e.person] || 0) + 1; });
  const summary = Object.entries(personCounts).map(([person, count]) => {
    const emoji = PERSON_EMOJI[person] || '👤';
    return `${emoji} ${person}: ${count}`;
  }).join(' | ');

  return `📋 <b>לוז יומי - יום ${dayName} ${dateStr}</b>\n\n${lines.join('\n')}\n\n📊 סה"כ ${events.length} אירועים\n${summary}`;
}

export async function sendDailySchedule(events: Array<{
  title: string; person: string; category: string;
  start_time: string; end_time: string; notes?: string | null;
}>, date: Date): Promise<boolean> {
  return sendMessage(buildDailyScheduleMessage(events, date));
}

export async function sendToChat(chatId: string, text: string, inlineKeyboard?: Array<Array<{ text: string; callback_data: string }>>): Promise<boolean> {
  if (!BOT_TOKEN) return false;
  try {
    const payload: Record<string, unknown> = { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true };
    if (inlineKeyboard) payload.reply_markup = { inline_keyboard: inlineKeyboard };
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    return res.ok;
  } catch { return false; }
}

export async function sendToAllChats(text: string): Promise<boolean> {
  return sendMessage(text);
}

export async function editMessage(chatId: string, messageId: number, text: string): Promise<boolean> {
  if (!BOT_TOKEN) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML' }),
    });
    return res.ok;
  } catch { return false; }
}
