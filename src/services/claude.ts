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

const HEADERS = {
  'Content-Type': 'application/json',
  'x-api-key': ANTHROPIC_API_KEY,
  'anthropic-version': '2023-06-01',
};

async function claudeRequest(messages: any[], maxTokens = 4096): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: maxTokens,
      messages,
    }),
  });
  if (!response.ok) throw new Error(`Claude API error: ${await response.text()}`);
  const data = await response.json();
  return data.content[0].text;
}

// Pass 1: extract text only, with maximum accuracy
async function extractText(base64: string): Promise<string[]> {
  const result = await claudeRequest([{
    role: 'user',
    content: [
      {
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
      },
      {
        type: 'text',
        text: `זוהי תמונה של לוח עם כתב יד בעברית.
משימתך: לקרוא את הטקסט בדייקנות מרבית.

הנחיות לקריאה:
- קרא כל מילה בזהירות. אם אות לא ברורה, השתמש בהקשר של המשפט כדי לנחש נכון
- שים לב להבדלים בין: ב/כ, ד/ר, ה/ח, ו/ז, מ/ס, נ/ג
- עדיף מילה שלמה ומובנת על פני אותיות נפרדות
- שמור על סדר קריאה: מימין לשמאל, מלמעלה למטה
- כל בלוק/עמודה נפרדת = שורה נפרדת בתשובה

החזר רק את הטקסט, כל בלוק בשורה נפרדת, ללא הסברים:`,
      },
    ],
  }]);
  return result.split('\n').map(s => s.trim()).filter(s => s.length > 0);
}

// Pass 2: given the texts, find their bounding boxes
async function locateBlocks(base64: string, texts: string[]): Promise<BoundingBox[]> {
  const numbered = texts.map((t, i) => `${i + 1}. "${t.slice(0, 60)}..."`).join('\n');

  const result = await claudeRequest([{
    role: 'user',
    content: [
      {
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
      },
      {
        type: 'text',
        text: `בתמונה יש ${texts.length} בלוקי טקסט. מצא את המיקום של כל אחד.

הבלוקים:
${numbered}

החזר JSON בלבד:
{
  "boxes": [
    { "x": 0.05, "y": 0.10, "width": 0.90, "height": 0.15 },
    ...
  ]
}

כללים (ערכים 0.0–1.0 יחסית לגודל התמונה):
- x, y = פינה שמאלית-עליונה של הבלוק
- width, height = גודל הבלוק
- הbox חייב לכסות את כל הטקסט בבלוק
- סדר: לפי הסדר של הרשימה למעלה`,
      },
    ],
  }]);

  const match = result.match(/\{[\s\S]*\}/);
  if (!match) return texts.map((_, i) => ({ x: 0.05, y: i * 0.2, width: 0.9, height: 0.18 }));

  const parsed = JSON.parse(match[0]);
  return (parsed.boxes || []) as BoundingBox[];
}

export async function extractParagraphs(base64: string): Promise<Paragraph[]> {
  // Pass 1: read text accurately
  const texts = await extractText(base64);
  if (texts.length === 0) return [];

  // Pass 2: locate each block in the image
  const boxes = await locateBlocks(base64, texts);

  return texts.map((text, index) => ({
    id: `p-${index}`,
    text,
    index,
    box: boxes[index] || { x: 0.05, y: index * 0.2, width: 0.9, height: 0.18 },
  }));
}
