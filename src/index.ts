import { Hono } from 'hono';
import type { Env, TelegramUpdate } from './types';
import { exchangeCode, isAuthenticated } from './google';
import { handleWebhook } from './handlers';
import { sendMessage } from './telegram';

type HonoEnv = { Bindings: Env };

const app = new Hono<HonoEnv>();

app.get('/', (c) => c.text('Telegram Calendar Bot is running'));

app.post('/webhook', async (c) => {
  const update: TelegramUpdate = await c.req.json();
  await handleWebhook(update, c.env);
  return c.json({ ok: true });
});

app.get('/oauth/callback', async (c) => {
  const code = c.req.query('code');
  if (!code) return c.text('Missing code', 400);

  try {
    const tokens = await exchangeCode(code, c.env);
    await c.env.KV.put('google_tokens', JSON.stringify(tokens));
    await sendMessage(c.env, c.env.TELEGRAM_CHAT_ID, '✅ Google Calendar מחובר בהצלחה! אפשר להתחיל להוסיף אירועים.');
    return c.html('<h1>Connected! You can close this tab and go back to Telegram.</h1>');
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return c.text(`OAuth error: ${msg}`, 500);
  }
});

app.get('/status', async (c) => {
  const authed = await isAuthenticated(c.env);
  return c.json({ authenticated: authed });
});

export default {
  fetch: app.fetch,
};
