import type { Env, ParsedEvent } from './types';
import { TEXT_SYSTEM_PROMPT, IMAGE_SYSTEM_PROMPT } from './prompts';

const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function getNowIsrael(): { date: string; time: string; dayName: string } {
  const now = new Date();
  const il = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const date = `${il.getFullYear()}-${String(il.getMonth() + 1).padStart(2, '0')}-${String(il.getDate()).padStart(2, '0')}`;
  const time = `${String(il.getHours()).padStart(2, '0')}:${String(il.getMinutes()).padStart(2, '0')}`;
  const dayName = DAYS_HE[il.getDay()];
  return { date, time, dayName };
}

function parseJsonResponse(content: string): ParsedEvent[] {
  const arrayMatch = content.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      const arr = JSON.parse(arrayMatch[0]);
      if (Array.isArray(arr) && arr.length > 0) return arr;
    } catch {}
  }

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Could not parse AI response');
  return [JSON.parse(jsonMatch[0])];
}

export async function parseEventText(env: Env, text: string): Promise<ParsedEvent[]> {
  const { date, time, dayName } = getNowIsrael();

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: TEXT_SYSTEM_PROMPT + `\n\nהיום: ${date} (יום ${dayName}), השעה עכשיו: ${time}` },
        { role: 'user', content: text },
      ],
      temperature: 0.1,
      max_tokens: 800,
    }),
  });

  const data: any = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('No AI response');

  return parseJsonResponse(content);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function parseEventImage(env: Env, imageUrl: string, caption?: string): Promise<ParsedEvent> {
  const { date, time, dayName } = getNowIsrael();

  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) throw new Error(`Failed to download image: ${imageRes.status}`);
  const imageBuffer = await imageRes.arrayBuffer();
  const base64 = arrayBufferToBase64(imageBuffer);

  const ext = imageUrl.split('.').pop()?.toLowerCase() || '';
  const mimeMap: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
  const contentType = mimeMap[ext] || 'image/jpeg';

  const userContent: any[] = [
    { type: 'image_url', image_url: { url: `data:${contentType};base64,${base64}`, detail: 'high' } },
  ];
  if (caption) {
    userContent.push({ type: 'text', text: `[context: forwarded from "${caption}"]` });
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: IMAGE_SYSTEM_PROMPT + `\n\nToday: ${date} (${dayName}), current time: ${time} (Israel timezone)` },
        { role: 'user', content: userContent },
      ],
      temperature: 0.1,
      max_tokens: 500,
    }),
  });

  const data: any = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error(data.error?.message || `No AI response: ${JSON.stringify(data)}`);

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Could not parse AI response');

  return JSON.parse(jsonMatch[0]);
}

export async function transcribeVoice(env: Env, audioUrl: string): Promise<string> {
  const audioRes = await fetch(audioUrl);
  const audioBuffer = await audioRes.arrayBuffer();

  const formData = new FormData();
  formData.append('file', new Blob([audioBuffer], { type: 'audio/ogg' }), 'voice.ogg');
  formData.append('model', 'whisper-1');
  formData.append('language', 'he');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: formData,
  });

  const data: any = await res.json();
  if (!data.text) throw new Error('Transcription failed');
  return data.text;
}
