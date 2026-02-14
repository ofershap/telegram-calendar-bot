import type { Env, TelegramUpdate } from './types';
import { sendMessage, editMessage, answerCallback, getFileUrl } from './telegram';
import { createEvent, deleteEvent, isAuthenticated, getAuthUrl } from './google';
import { parseEventText, parseEventImage, transcribeVoice } from './ai';

const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatDate(dateTime: string): string {
  const d = new Date(dateTime);
  const il = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  return `${il.getDate()}/${il.getMonth() + 1}`;
}


export async function handleWebhook(update: TelegramUpdate, env: Env): Promise<void> {
  if (update.callback_query) {
    await handleCallback(update.callback_query, env);
    return;
  }

  const message = update.message;
  if (!message) return;

  const chatId = message.chat.id;

  const authed = await isAuthenticated(env);
  if (!authed) {
    const url = getAuthUrl(env);
    await sendMessage(env, chatId, `🔐 צריך לחבר את חשבון Google שלך קודם.\n\n<a href="${url}">לחץ כאן לחיבור</a>`);
    return;
  }

  if (message.voice) {
    await handleVoice(chatId, message.voice.file_id, env);
    return;
  }

  if (message.photo && message.photo.length > 0) {
    const largestPhoto = message.photo[message.photo.length - 1];
    await handlePhoto(chatId, largestPhoto.file_id, message.caption, env);
    return;
  }

  if (!message.text) return;
  const text = message.text.trim();

  if (text === '/start' || text === '/help') {
    await sendMessage(env, chatId,
      '🤖 <b>בוט יומן Google</b>\n\n' +
      '📝 <b>להוספת אירוע:</b>\n' +
      '• כתבו בשפה חופשית\n' +
      '• שלחו הודעה קולית\n' +
      '• שלחו תמונה (הזמנה, פלאייר, צילום מסך)\n\n' +
      'לדוגמה: "פגישה עם דני מחר ב-14:00"'
    );
  } else if (!text.startsWith('/')) {
    await handleAddEvent(chatId, text, env);
  }
}

async function handleCallback(callback: NonNullable<TelegramUpdate['callback_query']>, env: Env): Promise<void> {
  const chatId = callback.message.chat.id;
  const msgId = callback.message.message_id;
  const data = callback.data;

  if (data.startsWith('delete:')) {
    const eventId = data.replace('delete:', '');
    try {
      await deleteEvent(env, eventId);
      await editMessage(env, chatId, msgId, '🗑 האירוע נמחק מהיומן');
    } catch {
      await editMessage(env, chatId, msgId, '❌ שגיאה במחיקה');
    }
  }
  await answerCallback(env, callback.id);
}

async function handleAddEvent(chatId: number, text: string, env: Env): Promise<void> {
  try {
    await sendMessage(env, chatId, '🔄 מעבד...');

    const parsed = await parseEventText(env, text);

    const endDate = parsed.end_date || parsed.date;
    const startTime = `${parsed.date}T${parsed.start_time}:00`;
    const endTime = `${endDate}T${parsed.end_time}:00`;

    const event = await createEvent(env, {
      title: parsed.title,
      startTime,
      endTime,
      description: parsed.description || undefined,
      location: parsed.location || undefined,
    });

    const evDay = DAYS_HE[new Date(startTime).getDay()];
    let msg = `✅ <b>אירוע נוסף ליומן!</b>\n\n📌 <b>${escapeHtml(parsed.title)}</b>\n🗓 יום ${evDay}, ${formatDate(startTime)}\n🕐 ${parsed.start_time} - ${parsed.end_time}`;
    if (parsed.location) msg += `\n📍 ${escapeHtml(parsed.location)}`;
    if (parsed.description) msg += `\n📝 ${escapeHtml(parsed.description)}`;
    if (event.htmlLink) msg += `\n\n🔗 <a href="${event.htmlLink}">פתח ביומן</a>`;

    await sendMessage(env, chatId, msg, [[{ text: '🗑 מחק אירוע', callback_data: `delete:${event.id}` }]]);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    if (errMsg === 'NOT_AUTHENTICATED') {
      const url = getAuthUrl(env);
      await sendMessage(env, chatId, `🔐 צריך לחבר מחדש את Google.\n\n<a href="${url}">לחץ כאן</a>`);
    } else {
      await sendMessage(env, chatId, `❌ שגיאה: ${escapeHtml(errMsg)}`);
    }
  }
}

async function handleVoice(chatId: number, fileId: string, env: Env): Promise<void> {
  try {
    await sendMessage(env, chatId, '🎤 מעבד הודעה קולית...');

    const fileUrl = await getFileUrl(env, fileId);
    if (!fileUrl) {
      await sendMessage(env, chatId, '❌ לא הצלחתי להוריד את ההודעה הקולית');
      return;
    }

    const transcription = await transcribeVoice(env, fileUrl);
    await sendMessage(env, chatId, `📝 תמלול: "${escapeHtml(transcription)}"`);
    await handleAddEvent(chatId, transcription, env);
  } catch {
    await sendMessage(env, chatId, '❌ שגיאה בעיבוד הודעה קולית');
  }
}

async function handlePhoto(chatId: number, fileId: string, caption: string | undefined, env: Env): Promise<void> {
  try {
    await sendMessage(env, chatId, '📸 מעבד תמונה...');

    const fileUrl = await getFileUrl(env, fileId);
    if (!fileUrl) {
      await sendMessage(env, chatId, '❌ לא הצלחתי להוריד את התמונה');
      return;
    }

    const parsed = await parseEventImage(env, fileUrl, caption);

    const endDate = parsed.end_date || parsed.date;
    const startTime = `${parsed.date}T${parsed.start_time}:00`;
    const endTime = `${endDate}T${parsed.end_time}:00`;

    let description = parsed.description || '';
    if (description) description += '\n\n';
    description += `📸 נוצר מתמונה`;

    const event = await createEvent(env, {
      title: parsed.title,
      startTime,
      endTime,
      description,
      location: parsed.location || undefined,
      imageUrl: fileUrl,
    });

    const evDay = DAYS_HE[new Date(startTime).getDay()];
    let msg = `✅ <b>אירוע נוסף ליומן!</b>\n\n📌 <b>${escapeHtml(parsed.title)}</b> 📸\n🗓 יום ${evDay}, ${formatDate(startTime)}\n🕐 ${parsed.start_time} - ${parsed.end_time}`;
    if (parsed.location) msg += `\n📍 ${escapeHtml(parsed.location)}`;
    if (parsed.description) msg += `\n📝 ${escapeHtml(parsed.description)}`;
    if (event.htmlLink) msg += `\n\n🔗 <a href="${event.htmlLink}">פתח ביומן</a>`;

    await sendMessage(env, chatId, msg, [[{ text: '🗑 מחק אירוע', callback_data: `delete:${event.id}` }]]);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    if (errMsg === 'NOT_AUTHENTICATED') {
      const url = getAuthUrl(env);
      await sendMessage(env, chatId, `🔐 צריך לחבר מחדש את Google.\n\n<a href="${url}">לחץ כאן</a>`);
    } else {
      await sendMessage(env, chatId, `❌ שגיאה בעיבוד תמונה: ${escapeHtml(errMsg)}`);
    }
  }
}

