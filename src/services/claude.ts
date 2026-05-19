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
              text: `אתה מומחה לקריאת כתב יד בעברית מתמונות של לוחות כיתה.

שלב א׳ — קרא את הטקסט:
- קרא כל בלוק מימין לשמאל, מלמעלה למטה
- השתמש בהקשר המשפט לזיהוי אותיות לא ברורות
- שים לב במיוחד לזוגות: ב/כ, ד/ר, ה/ח/ת, ו/ז, נ/ג, מ/ס, פ/צ
- העדף מילים שלמות ומובנות בעברית
- כתב יד בלוח: לעיתים אותיות נוגעות זו בזו — הפרד ביניהן

שלב ב׳ — מצא את מיקום כל בלוק בתמונה.

החזר JSON בלבד:
{
  "paragraphs": [
    {
      "text": "הטקסט המדויק של הבלוק",
      "box": { "x": 0.05, "y": 0.10, "width": 0.90, "height": 0.20 }
    }
  ]
}

כללי box (0.0–1.0 יחסית לתמונה):
- x, y = פינה שמאלית-עליונה
- width, height = גודל הבלוק, חייב לכסות את כל השורות
- התעלם מאיורים, לוגואים ועיטורים — רק טקסט`,
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
