import * as fs from 'fs';
import * as path from 'path';
import { IMAGE_SYSTEM_PROMPT } from '../src/prompts';

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

interface TestCase {
  name: string;
  imagePath: string;
  caption?: string;
  expectedTitle: string;
  expectedDate?: string;
  expectedTime?: string;
  expectedLocation?: string;
}

const TEST_CASES: TestCase[] = [
  {
    name: 'Birthday invitation - נועם ועמית',
    imagePath: path.join(__dirname, 'fixtures/birthday-invitation.png'),
    caption: 'הזמנה ליום הולדת',
    expectedTitle: 'נועם ועמית חוגגים יום הולדת 6',
    expectedDate: '2026-03-22',
    expectedTime: '17:00',
    expectedLocation: '',
  },
];

async function callOpenAI(prompt: string, testCase: TestCase) {
  const { date, time, dayName } = getNowIsrael();

  const imageBuffer = fs.readFileSync(testCase.imagePath);
  const base64 = imageBuffer.toString('base64');
  const ext = path.extname(testCase.imagePath).slice(1);
  const mimeMap: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
  const contentType = mimeMap[ext] || 'image/jpeg';

  const userContent: any[] = [
    { type: 'image_url', image_url: { url: `data:${contentType};base64,${base64}`, detail: 'high' } },
  ];
  if (testCase.caption) {
    userContent.push({ type: 'text', text: `[context: forwarded from "${testCase.caption}"]` });
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: prompt + `\n\nToday: ${date} (${dayName}), current time: ${time} (Israel timezone)` },
        { role: 'user', content: userContent },
      ],
      temperature: 0.1,
      max_tokens: 500,
    }),
  });

  const data: any = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error(`No AI response: ${JSON.stringify(data)}`);

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Could not parse: ${content}`);

  return JSON.parse(jsonMatch[0]);
}

function check(testCase: TestCase, result: any): string[] {
  const issues: string[] = [];

  const expectedWords = testCase.expectedTitle.split(' ');
  const matchedWords = expectedWords.filter(w => result.title?.includes(w));
  if (matchedWords.length < expectedWords.length * 0.6) {
    issues.push(`TITLE: got "${result.title}", expected ~"${testCase.expectedTitle}"`);
  }

  if (testCase.caption && result.title === testCase.caption) {
    issues.push(`TITLE IS JUST THE CAPTION: "${result.title}"`);
  }

  if (testCase.expectedDate && result.date !== testCase.expectedDate) {
    issues.push(`DATE: got "${result.date}", expected "${testCase.expectedDate}"`);
  }

  if (testCase.expectedTime && result.start_time !== testCase.expectedTime) {
    issues.push(`TIME: got "${result.start_time}", expected "${testCase.expectedTime}"`);
  }

  if (testCase.expectedLocation !== undefined && result.location && testCase.expectedLocation === '') {
    issues.push(`LOCATION: got "${result.location}", expected empty`);
  }

  return issues;
}

async function main() {
  const runs = parseInt(process.argv[2] || '1', 10);
  console.log(`Running ${runs} iteration(s) using IMAGE_SYSTEM_PROMPT from src/prompts.ts\n`);

  for (const tc of TEST_CASES) {
    console.log(`--- ${tc.name} ---`);
    console.log(`Caption: "${tc.caption || 'none'}"\n`);

    let passed = 0;
    for (let i = 0; i < runs; i++) {
      try {
        const result = await callOpenAI(IMAGE_SYSTEM_PROMPT, tc);
        const issues = check(tc, result);

        if (runs === 1) {
          console.log(`  title:    "${result.title}"`);
          console.log(`  date:     "${result.date}"`);
          console.log(`  time:     "${result.start_time}"`);
          console.log(`  location: "${result.location}"`);
        }

        if (issues.length === 0) {
          passed++;
          if (runs > 1) process.stdout.write('.');
        } else {
          if (runs > 1) process.stdout.write('X');
          if (runs === 1) {
            console.log(`\n  ISSUES:`);
            issues.forEach(i => console.log(`    - ${i}`));
          }
        }
      } catch (err) {
        if (runs > 1) process.stdout.write('E');
        else console.log(`  ERROR: ${err}`);
      }
    }

    if (runs > 1) console.log('');
    console.log(`\n  Result: ${passed}/${runs} passed${passed === runs ? ' ✅' : ' ❌'}\n`);
  }
}

main();
