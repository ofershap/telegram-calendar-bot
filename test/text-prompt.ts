import { TEXT_SYSTEM_PROMPT } from '../src/prompts';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function getNowIsrael() {
  const now = new Date();
  const il = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const date = `${il.getFullYear()}-${String(il.getMonth() + 1).padStart(2, '0')}-${String(il.getDate()).padStart(2, '0')}`;
  const time = `${String(il.getHours()).padStart(2, '0')}:${String(il.getMinutes()).padStart(2, '0')}`;
  const dayName = DAYS_HE[il.getDay()];
  return { date, time, dayName };
}

interface TextTestCase {
  name: string;
  input: string;
  expectMultiple?: boolean;
  expected: Array<{
    titleContains: string;
    date?: string;
    time?: string;
    location?: string;
  }>;
}

const TEST_CASES: TextTestCase[] = [
  {
    name: 'Simple event - Hebrew',
    input: 'פגישה עם דני מחר ב-15:00',
    expected: [{ titleContains: 'דני', time: '15:00' }],
  },
  {
    name: 'Event with location',
    input: 'יומולדת של יואב ביום שישי ב-17:00 בפארק הירקון',
    expected: [{ titleContains: 'יואב', time: '17:00', location: 'פארק הירקון' }],
  },
  {
    name: 'English event',
    input: 'Team sync Monday 10am',
    expected: [{ titleContains: 'sync', time: '10:00' }],
  },
  {
    name: 'Multiple events in one message',
    input: `שימו 🩷- ביום שישי הקרוב 13/2 נצא לפעילות בגן נופר, ביום ראשון 15/2 נצא לפעילות במוזיאון הראשונים באבן יהודה וביום שני 16/2 נצא לצעדה בית ספרית- יוצרים קהילה שווה.
הוסף ליומן ובכל אירוע תרשום בכותרת ״ארבל (צאלון):״ לפני השם של האירוע`,
    expectMultiple: true,
    expected: [
      { titleContains: 'גן נופר' },
      { titleContains: 'מוזיאון' },
      { titleContains: 'צעדה' },
    ],
  },
];

async function callOpenAI(prompt: string, text: string): Promise<any> {
  const { date, time, dayName } = getNowIsrael();

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: prompt + `\n\nהיום: ${date} (יום ${dayName}), השעה עכשיו: ${time}` },
        { role: 'user', content: text },
      ],
      temperature: 0.1,
      max_tokens: 800,
    }),
  });

  const data: any = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error(`No AI response: ${JSON.stringify(data)}`);
  return { content, raw: content };
}

function parseResponse(content: string): any[] {
  const arrayMatch = content.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try { return JSON.parse(arrayMatch[0]); } catch {}
  }

  const objects: any[] = [];
  const regex = /\{[^{}]*\}/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    try { objects.push(JSON.parse(match[0])); } catch {}
  }
  if (objects.length > 0) return objects;

  const singleMatch = content.match(/\{[\s\S]*\}/);
  if (singleMatch) {
    try { return [JSON.parse(singleMatch[0])]; } catch {}
  }

  throw new Error(`Could not parse: ${content}`);
}

async function main() {
  console.log('=== Testing Text Prompt ===\n');

  let totalPassed = 0;
  let totalFailed = 0;

  for (const tc of TEST_CASES) {
    console.log(`--- ${tc.name} ---`);
    console.log(`Input: "${tc.input.slice(0, 80)}${tc.input.length > 80 ? '...' : ''}"\n`);

    try {
      const { content } = await callOpenAI(TEXT_SYSTEM_PROMPT, tc.input);
      const results = parseResponse(content);

      console.log(`  Got ${results.length} event(s):`);
      for (const r of results) {
        console.log(`    - "${r.title}" | ${r.date} ${r.start_time} | loc: "${r.location || ''}"`);
      }

      const issues: string[] = [];

      if (tc.expectMultiple && results.length < tc.expected.length) {
        issues.push(`Expected ${tc.expected.length} events, got ${results.length}`);
      }

      if (!tc.expectMultiple && results.length !== 1) {
        issues.push(`Expected 1 event, got ${results.length}`);
      }

      for (let i = 0; i < tc.expected.length; i++) {
        const exp = tc.expected[i];
        const res = results[i];
        if (!res) {
          issues.push(`Missing event #${i + 1}`);
          continue;
        }
        if (!res.title?.includes(exp.titleContains)) {
          issues.push(`Event #${i + 1} title "${res.title}" doesn't contain "${exp.titleContains}"`);
        }
        if (exp.date && res.date !== exp.date) {
          issues.push(`Event #${i + 1} date: got "${res.date}", expected "${exp.date}"`);
        }
        if (exp.time && res.start_time !== exp.time) {
          issues.push(`Event #${i + 1} time: got "${res.start_time}", expected "${exp.time}"`);
        }
        if (exp.location && !res.location?.includes(exp.location)) {
          issues.push(`Event #${i + 1} location: got "${res.location}", expected to contain "${exp.location}"`);
        }
      }

      if (issues.length === 0) {
        console.log(`\n  ✅ PASSED\n`);
        totalPassed++;
      } else {
        console.log(`\n  ❌ FAILED:`);
        issues.forEach(i => console.log(`    - ${i}`));
        console.log('');
        totalFailed++;
      }
    } catch (err) {
      console.log(`  ❌ ERROR: ${err}\n`);
      totalFailed++;
    }
  }

  console.log(`\n=== ${totalPassed} passed, ${totalFailed} failed ===`);
}

main();
