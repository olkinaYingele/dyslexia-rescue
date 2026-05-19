import { ANTHROPIC_API_KEY } from '../config';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Paragraph {
  id: string;
  text: string;
  index: number;
  box: BoundingBox;
}

export async function extractParagraphs(base64: string): Promise<Paragraph[]> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
            },
            {
              type: 'text',
              text: `אתה מומחה לקריאת כתב יד בעברית מלוחות כיתה. זו משימת קריאה קריטית עבור ילד עם דיסלקציה.

הקשר: מדובר בלוח של כיתת יסודי/חטיבה. המילים השכיחות ביותר:
מבחן, שיעורי בית, דף עבודה, להגשה, ציון, נושא, שטח, היקף, חשבון, אנגלית, עברית, מדעים, היסטוריה, תנ״ך, יום שני/שלישי/רביעי/חמישי/שישי, לא למחוק, לג׳, חופש, מחר, השבוע.

לפני שתכתוב JSON, חשוב בקול:
1. סרוק את התמונה וזהה כמה בלוקים יש
2. לכל בלוק — קרא אות אחר אות, ואז בדוק: האם זו מילה עברית מוכרת? אם לא — קרא שוב
3. שים לב: ב ו-כ נראות דומות, ד ו-ר נראות דומות, ה ו-ח ו-ת נראות דומות, מ ו-ס נראות דומות

אחרי שחשבת — החזר JSON בלבד:
{
  "paragraphs": [
    {
      "text": "הטקסט המדויק",
      "box": { "x": 0.05, "y": 0.10, "width": 0.90, "height": 0.20 }
    }
  ]
}

כללי box (0.0–1.0 יחסית לתמונה): x,y = פינה שמאלית-עליונה, width/height = גודל הבלוק.`,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) throw new Error(`Claude API error: ${await response.text()}`);

  const data = await response.json();
  const content = data.content[0].text;

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Could not parse response from Claude');

  const parsed = JSON.parse(jsonMatch[0]);
  return (parsed.paragraphs || [])
    .map((item: { text: string; box: BoundingBox }, index: number) => ({
      id: `p-${index}`,
      text: item.text?.trim() || '',
      index,
      box: item.box || { x: 0.05, y: index * 0.2, width: 0.9, height: 0.18 },
    }))
    .filter((p: Paragraph) => p.text.length > 0);
}
