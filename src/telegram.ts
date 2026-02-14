import type { Env } from './types';

export async function sendMessage(
  env: Env,
  chatId: string | number,
  text: string,
  inlineKeyboard?: Array<Array<{ text: string; callback_data: string }>>
): Promise<boolean> {
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };
  if (inlineKeyboard) payload.reply_markup = { inline_keyboard: inlineKeyboard };

  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.ok;
}

export async function editMessage(
  env: Env,
  chatId: string | number,
  messageId: number,
  text: string
): Promise<boolean> {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML' }),
  });
  return res.ok;
}

export async function answerCallback(env: Env, callbackId: string, text?: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackId, text }),
  });
}

export async function getVoiceFileUrl(env: Env, fileId: string): Promise<string | null> {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`);
  const data: any = await res.json();
  if (!data.ok || !data.result?.file_path) return null;
  return `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${data.result.file_path}`;
}
