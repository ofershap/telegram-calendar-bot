# Telegram Calendar Bot

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange.svg)](https://workers.cloudflare.com/)

A Telegram bot that creates Google Calendar events from natural language messages and voice notes, powered by AI.

Send a message like **"Meeting with Dan tomorrow at 3pm"** or a voice note, and it instantly appears in your Google Calendar.

<p align="center">
  <img src="assets/telegram-bot-demo.png" width="400" alt="Telegram bot creating a calendar event" />
  <img src="assets/google-calendar-demo.png" width="250" alt="Event appearing in Google Calendar" />
</p>

## Features

- **Natural language parsing** — Write freely in any language, AI extracts the event details
- **Voice messages** — Send a voice note, it gets transcribed and parsed automatically
- **Relative time** — "in an hour", "tomorrow at 10", "next Monday" all work
- **Instant sync** — Events appear in Google Calendar within seconds
- **Delete from chat** — Each event comes with a delete button to remove it
- **Zero UI** — No web app, no dashboard. Just Telegram and your calendar
- **Serverless** — Runs on Cloudflare Workers free tier with zero cold starts

## Architecture

```
Telegram → Cloudflare Worker → OpenAI (parse) → Google Calendar API
                              → OpenAI Whisper (voice transcription)
```

**Stack:** TypeScript, Hono, Cloudflare Workers, Cloudflare KV, OpenAI GPT-4o-mini + Whisper, Google Calendar API

## Setup Guide

### Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
- [Telegram account](https://telegram.org/)
- [Google Cloud account](https://console.cloud.google.com/)
- [OpenAI API key](https://platform.openai.com/api-keys)
- Node.js 18+

### 1. Create a Telegram Bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot` and follow the prompts
3. Save the **bot token** (looks like `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)
4. Send a message to your new bot, then visit:
   ```
   https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates
   ```
5. Find your **chat ID** in the response (`"chat":{"id":123456789}`)

### 2. Set Up Google Cloud

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. **Enable the Google Calendar API:**
   - Go to **APIs & Services → Library**
   - Search for "Google Calendar API"
   - Click **Enable**
4. **Create OAuth credentials:**
   - Go to **APIs & Services → Credentials**
   - Click **Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - Add authorized redirect URI: `https://telegram-calendar-bot.<YOUR_CF_SUBDOMAIN>.workers.dev/oauth/callback`
   - Save the **Client ID** and **Client Secret**
5. **Configure OAuth consent screen:**
   - Go to **APIs & Services → OAuth consent screen**
   - Set up as **External** (or Internal if using Google Workspace)
   - Add your email as a **test user**

### 3. Set Up Cloudflare

1. Install dependencies:
   ```bash
   npm install
   ```

2. Login to Cloudflare:
   ```bash
   npx wrangler login
   ```

3. Create a KV namespace:
   ```bash
   npx wrangler kv namespace create KV
   ```

4. Copy `wrangler.example.toml` to `wrangler.toml` and fill in your KV namespace ID:
   ```bash
   cp wrangler.example.toml wrangler.toml
   ```

5. Set your secrets:
   ```bash
   echo "YOUR_TOKEN" | npx wrangler secret put TELEGRAM_BOT_TOKEN
   echo "YOUR_CHAT_ID" | npx wrangler secret put TELEGRAM_CHAT_ID
   echo "YOUR_KEY" | npx wrangler secret put OPENAI_API_KEY
   echo "YOUR_CLIENT_ID" | npx wrangler secret put GOOGLE_CLIENT_ID
   echo "YOUR_SECRET" | npx wrangler secret put GOOGLE_CLIENT_SECRET
   echo "primary" | npx wrangler secret put GOOGLE_CALENDAR_ID
   echo "https://telegram-calendar-bot.YOUR_SUBDOMAIN.workers.dev" | npx wrangler secret put WORKER_URL
   ```

6. Deploy:
   ```bash
   npm run deploy
   ```

### 4. Register the Webhook

Tell Telegram where to send messages:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://telegram-calendar-bot.YOUR_SUBDOMAIN.workers.dev/webhook"}'
```

### 5. Connect Google Calendar

Send any message to your bot in Telegram. It will reply with a Google OAuth link. Click it, authorize, and you're done.

## Usage

Just send messages to your bot:

| Message | Result |
|---------|--------|
| `Meeting with Dan tomorrow at 3pm` | Creates event tomorrow 15:00-16:00 |
| `Dentist appointment Feb 20 at 10:30` | Creates event on Feb 20 10:30-11:30 |
| `Team lunch next Monday 12-14` | Creates event next Monday 12:00-14:00 |
| `Call in an hour` | Creates event 1 hour from now |
| 🎤 *Voice note* | Transcribes and creates event |

Each event confirmation includes a **delete button** to remove it from your calendar.

## Local Development

1. Copy the example config:
   ```bash
   cp wrangler.example.toml wrangler.toml
   ```

2. Create a `.dev.vars` file with your secrets:
   ```
   TELEGRAM_BOT_TOKEN=your_token
   TELEGRAM_CHAT_ID=your_chat_id
   OPENAI_API_KEY=your_key
   GOOGLE_CLIENT_ID=your_client_id
   GOOGLE_CLIENT_SECRET=your_secret
   GOOGLE_CALENDAR_ID=primary
   WORKER_URL=https://your-worker.workers.dev
   ```

3. Run locally:
   ```bash
   npm run dev
   ```

## Project Structure

```
src/
├── index.ts       # Hono routes (webhook, OAuth callback, status)
├── handlers.ts    # Telegram message handling and event creation
├── ai.ts          # OpenAI integration (text parsing + voice transcription)
├── google.ts      # Google Calendar API + OAuth token management
├── telegram.ts    # Telegram Bot API helpers
└── types.ts       # TypeScript interfaces
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Bot token from BotFather |
| `TELEGRAM_CHAT_ID` | Your Telegram chat ID |
| `OPENAI_API_KEY` | OpenAI API key |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_CALENDAR_ID` | Calendar ID (use `primary` for your main calendar) |
| `WORKER_URL` | Your deployed worker URL |

## Cost

This project runs entirely on free tiers and minimal API costs:

- **Cloudflare Workers** — Free tier: 100k requests/day
- **Cloudflare KV** — Free tier: 100k reads/day, 1k writes/day
- **OpenAI GPT-4o-mini** — ~$0.001 per event parsed
- **OpenAI Whisper** — ~$0.006 per minute of voice
- **Google Calendar API** — Free

Realistically, personal use costs **less than $1/month**.

## License

[MIT](LICENSE)
