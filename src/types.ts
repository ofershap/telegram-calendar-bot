export interface Env {
  KV: KVNamespace;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  OPENAI_API_KEY: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_CALENDAR_ID: string;
  WORKER_URL: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: {
    id: string;
    data: string;
    message: TelegramMessage;
  };
}

export interface TelegramMessage {
  message_id: number;
  chat: { id: number; type: string };
  from?: { id: number; first_name: string };
  text?: string;
  voice?: { file_id: string; duration: number };
  entities?: Array<{ type: string; offset: number; length: number }>;
  date: number;
}

export interface GoogleTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export interface ParsedEvent {
  title: string;
  date: string;
  end_date?: string;
  start_time: string;
  end_time: string;
  description?: string;
  location?: string;
}

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  description?: string;
  location?: string;
}
