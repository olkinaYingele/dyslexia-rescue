import { GEMINI_API_KEY } from '../config';

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
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

  const prompt = `אתה מומחה לקריאת כתב יד בעברית מלוחות כיתה. זו משימת קריאה קריטית עבור ילד עם דיסלקציה.

הקשר: לוח של כיתת יסודי/חטיבה. המילים השכיחות ביותר:
מבחן, שיעורי בית, דף עבודה, להגשה, ציון, נושא, שטח, היקף, חשבון, אנגלית, עברית, מדעים, היסטוריה, תנ״ך, יום שני/שלישי/רביעי/חמישי/שישי, לא למחוק, לג׳, חופש, מחר, השבוע.

זהה את כל בלוקי הטקסט בתמונה. לכל בלוק — קרא בעיון, שים לב לדמיון בין אותיות: ב/כ, ד/ר, ה/ח/ת, מ/ס.

החזר JSON בלבד (ללא markdown, ללא קוד בקשים):
{
  "paragraphs": [
    {
      "text": "הטקסט המדויק",
      "box": { "x": 0.05, "y": 0.10, "width": 0.90, "height": 0.20 }
    }
  ]
}

כללי box (0.0–1.0 יחסית לתמונה): x,y = פינה שמאלית-עליונה, width/height = גודל הבלוק.
חשוב: x+width ≤ 1.0 ו-y+height ≤ 1.0 תמיד.`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { inline_data: { mime_type: 'image/jpeg', data: base64 } },
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,
        thinkingConfig: {
          thinkingBudget: 0,
        },
      },
    }),
  });

  if (!response.ok) throw new Error(`Gemini API error: ${await response.text()}`);

  const data = await response.json();
  // 2.5-flash is a thinking model — find the non-thought part
  const parts = data.candidates?.[0]?.content?.parts || [];
  const content = parts.find((p: any) => !p.thought)?.text ?? parts[0]?.text;
  if (!content) throw new Error('Empty response from Gemini');

  // Strip markdown code fences if present
  const cleaned = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Could not parse response from Gemini');

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
