import type { Env, GoogleTokens, GoogleCalendarEvent } from './types';

const SCOPES = 'https://www.googleapis.com/auth/calendar';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

export function getAuthUrl(env: Env): string {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${env.WORKER_URL}/oauth/callback`,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCode(code: string, env: Env): Promise<GoogleTokens> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${env.WORKER_URL}/oauth/callback`,
      grant_type: 'authorization_code',
    }),
  });
  const data: any = await res.json();
  if (!data.access_token) throw new Error(`Token exchange failed: ${JSON.stringify(data)}`);
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
}

async function refreshAccessToken(env: Env, tokens: GoogleTokens): Promise<GoogleTokens> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: tokens.refresh_token,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  const data: any = await res.json();
  if (!data.access_token) throw new Error('Token refresh failed');
  const updated: GoogleTokens = {
    access_token: data.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
  await env.KV.put('google_tokens', JSON.stringify(updated));
  return updated;
}

async function getValidTokens(env: Env): Promise<GoogleTokens | null> {
  const raw = await env.KV.get('google_tokens');
  if (!raw) return null;
  let tokens: GoogleTokens = JSON.parse(raw);
  if (tokens.expires_at < Date.now() + 60_000) {
    tokens = await refreshAccessToken(env, tokens);
  }
  return tokens;
}

async function calendarFetch(env: Env, path: string, options: RequestInit = {}): Promise<any> {
  const tokens = await getValidTokens(env);
  if (!tokens) throw new Error('NOT_AUTHENTICATED');
  const res = await fetch(`${CALENDAR_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google API error ${res.status}: ${err}`);
  }
  return res.json();
}

export async function createEvent(
  env: Env,
  event: { title: string; startTime: string; endTime: string; description?: string; location?: string }
): Promise<GoogleCalendarEvent> {
  const calendarId = env.GOOGLE_CALENDAR_ID || 'primary';
  return calendarFetch(env, `/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    body: JSON.stringify({
      summary: event.title,
      start: { dateTime: event.startTime, timeZone: 'Asia/Jerusalem' },
      end: { dateTime: event.endTime, timeZone: 'Asia/Jerusalem' },
      description: event.description || undefined,
      location: event.location || undefined,
    }),
  });
}

export async function deleteEvent(env: Env, eventId: string): Promise<void> {
  const calendarId = env.GOOGLE_CALENDAR_ID || 'primary';
  const tokens = await getValidTokens(env);
  if (!tokens) throw new Error('NOT_AUTHENTICATED');
  await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
}

export async function getEventsForRange(
  env: Env,
  timeMin: string,
  timeMax: string
): Promise<GoogleCalendarEvent[]> {
  const calendarId = env.GOOGLE_CALENDAR_ID || 'primary';
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    timeZone: 'Asia/Jerusalem',
  });
  const data = await calendarFetch(env, `/calendars/${encodeURIComponent(calendarId)}/events?${params}`);
  return data.items || [];
}

export async function isAuthenticated(env: Env): Promise<boolean> {
  const tokens = await getValidTokens(env);
  return tokens !== null;
}
