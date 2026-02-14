import type { Env, ParsedEvent } from './types';

const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function getNowIsrael(): { date: string; time: string; dayName: string } {
  const now = new Date();
  const il = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const date = `${il.getFullYear()}-${String(il.getMonth() + 1).padStart(2, '0')}-${String(il.getDate()).padStart(2, '0')}`;
  const time = `${String(il.getHours()).padStart(2, '0')}:${String(il.getMinutes()).padStart(2, '0')}`;
  const dayName = DAYS_HE[il.getDay()];
  return { date, time, dayName };
}

const SYSTEM_PROMPT = `אתה עוזר לפענח טקסט חופשי לאירוע ביומן.

כללים:
- אם לא צוין תאריך, השתמש בהיום (שים לב לאזור זמן ישראל)
- אם לא צוינה שעת סיום, הוסף שעה לשעת ההתחלה
- אם צוין יום בשבוע (למשל "יום שני"), חשב את התאריך הקרוב ביותר קדימה
- אם נאמר "בעוד שעה", "בעוד חצי שעה" וכו' - חשב לפי השעה הנוכחית
- זהה מיקום אם מוזכר
- החזר JSON בלבד, בלי markdown

פורמט תשובה (JSON בלבד):
{
  "title": "שם האירוע",
  "date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD",
  "start_time": "HH:MM",
  "end_time": "HH:MM",
  "description": "",
  "location": ""
}`;

export async function parseEventText(env: Env, text: string): Promise<ParsedEvent> {
  const { date, time, dayName } = getNowIsrael();

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT + `\n\nהיום: ${date} (יום ${dayName}), השעה עכשיו: ${time}` },
        { role: 'user', content: text },
      ],
      temperature: 0.1,
      max_tokens: 300,
    }),
  });

  const data: any = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('No AI response');

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
