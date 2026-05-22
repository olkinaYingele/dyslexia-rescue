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

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    paragraphs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          boundingBox: {
            type: 'object',
            properties: {
              top:    { type: 'number', description: 'Top edge as % of image height (0=top, 100=bottom)' },
              left:   { type: 'number', description: 'Left edge as % of image width (0=left, 100=right)' },
              width:  { type: 'number', description: 'Width as % of image width' },
              height: { type: 'number', description: 'Height as % of image height' },
            },
            required: ['top', 'left', 'width', 'height'],
          },
        },
        required: ['text', 'boundingBox'],
      },
    },
  },
  required: ['paragraphs'],
};

export async function extractParagraphs(base64: string): Promise<Paragraph[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

  const systemInstruction = `Analyze the image. Find all text and divide it into logical paragraphs.
Rules:
- A heading + all lines under it = ONE paragraph (not separate lines)
- A schedule or list with dates = ONE paragraph containing everything
- Extract text in the original language (Hebrew/English as written)
- Return bounding box as PERCENTAGES (0–100) from the top-left corner of the image:
  - left: 0 = left edge, 100 = right edge
  - top: 0 = top edge, 100 = bottom edge
  - width and height are also percentages of the total image dimensions
  - Example: top-left quarter = { top: 0, left: 0, width: 50, height: 50 }
  - Example: full image = { top: 0, left: 0, width: 100, height: 100 }`;

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [
      {
        parts: [
          { inline_data: { mime_type: 'image/jpeg', data: base64 } },
          { text: 'Divide this image into logical text paragraphs. Return bounding boxes as percentages (0–100) from the top-left corner.' },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  // Retry up to 3 times on 503 (server overload)
  let response: Response | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    if (response.ok || response.status !== 503) break;
    if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 2000));
  }

  if (!response!.ok) throw new Error(`Gemini API error: ${await response!.text()}`);

  const data = await response!.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const content = parts.find((p: any) => !p.thought)?.text ?? parts[0]?.text;
  if (!content) throw new Error('Empty response from Gemini');

  const parsed = JSON.parse(content);
  const boxes = parsed.paragraphs || [];

  console.log('=== GEMINI RAW JSON ===');
  console.log(JSON.stringify(parsed, null, 2));

  return (boxes as any[])
    .map((item: any, index: number) => ({
      id: `p-${index}`,
      text: item.text?.trim() || '',
      index,
      // Gemini returns all coordinates in 0–1000 scale
      box: {
        x:      (item.boundingBox?.left   ?? 0) / 1000,
        y:      (item.boundingBox?.top    ?? 0) / 1000,
        width:  (item.boundingBox?.width  ?? 0) / 1000,
        height: (item.boundingBox?.height ?? 0) / 1000,
      },
    }))
    .filter((p: Paragraph) => p.text.length > 0);
}
