import { NextRequest, NextResponse } from 'next/server';

const FAMILY_MEMBERS = (process.env.FAMILY_MEMBERS || '').split(',').map(s => s.trim()).filter(Boolean);
const DEFAULT_PERSON = process.env.DEFAULT_PERSON || FAMILY_MEMBERS[0] || 'כולם';
const CATEGORIES = process.env.FAMILY_CATEGORIES || 'אימון,חוג,עבודה,משפחה,אחר';

const SYSTEM_PROMPT = `אתה עוזר לפענח טקסט חופשי לאירוע ביומן משפחתי.

האנשים במשפחה: ${FAMILY_MEMBERS.join(', ')}, כולם
קטגוריות: ${CATEGORIES}

כללים:
- אם לא צוין שם, ברירת מחדל: ${DEFAULT_PERSON}
- אם לא צוינה קטגוריה, נסה להסיק. ברירת מחדל: אחר
- אם לא צוין תאריך, השתמש בהיום: ${new Date().toISOString().split('T')[0]}
- אם לא צוינה שעת סיום, הוסף שעה לשעת ההתחלה
- אם צוין יום בשבוע (למשל "יום שני"), חשב את התאריך הקרוב
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
  "start_time": "HH:MM",
  "end_time": "HH:MM",
  "recurring": false,
  "reminder_minutes": null,
  "notes": ""
}`;

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();
    if (!text) return NextResponse.json({ error: 'Missing text' }, { status: 400 });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'Missing API key' }, { status: 500 });

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
        temperature: 0.1,
        max_tokens: 300,
      }),
    });

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return NextResponse.json({ error: 'No response from AI' }, { status: 500 });

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ error: 'Could not parse AI response' }, { status: 500 });

    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ parsed });
  } catch {
    return NextResponse.json({ error: 'Failed to parse event' }, { status: 500 });
  }
}
