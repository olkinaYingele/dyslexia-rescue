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
    imageWidth:  { type: 'number', description: 'Total width of the image in pixels as you see it' },
    imageHeight: { type: 'number', description: 'Total height of the image in pixels as you see it' },
    paragraphs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          boundingBox: {
            type: 'object',
            properties: {
              top:    { type: 'number', description: 'Top edge in pixels' },
              left:   { type: 'number', description: 'Left edge in pixels' },
              width:  { type: 'number', description: 'Width in pixels' },
              height: { type: 'number', description: 'Height in pixels' },
            },
            required: ['top', 'left', 'width', 'height'],
          },
        },
        required: ['text', 'boundingBox'],
      },
    },
  },
  required: ['imageWidth', 'imageHeight', 'paragraphs'],
};

export async function extractParagraphs(base64: string): Promise<Paragraph[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

  const systemInstruction = `Analyze the image. Find all text and divide it into logical paragraphs.
Rules:
- A heading + all lines under it = ONE paragraph (not separate paragraphs per line)
- A schedule/list with dates = ONE paragraph containing all dates and descriptions
- Goal: 2 to 4 large paragraphs, never more than 5
- Extract text in the original language (Hebrew/English as written)
- Return bounding box coordinates in PIXELS as you see the image
- Also return imageWidth and imageHeight — the total pixel dimensions of the image as you see it`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [
        {
          parts: [
            { inline_data: { mime_type: 'image/jpeg', data: base64 } },
            { text: 'Divide this image into logical text paragraphs. Return pixel coordinates and the image dimensions you see.' },
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
    }),
  });

  if (!response.ok) throw new Error(`Gemini API error: ${await response.text()}`);

  const data = await response.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const content = parts.find((p: any) => !p.thought)?.text ?? parts[0]?.text;
  if (!content) throw new Error('Empty response from Gemini');

  const parsed = JSON.parse(content);

  const imgW = parsed.imageWidth  || 1;
  const imgH = parsed.imageHeight || 1;

  console.log('=== GEMINI RAW JSON ===');
  console.log(JSON.stringify(parsed, null, 2));
  console.log(`=== Normalizing by ${imgW}x${imgH} ===`);

  return (parsed.paragraphs || [])
    .map((item: any, index: number) => ({
      id: `p-${index}`,
      text: item.text?.trim() || '',
      index,
      box: {
        x:      (item.boundingBox?.left   ?? 0)  / imgW,
        y:      (item.boundingBox?.top    ?? 0)  / imgH,
        width:  (item.boundingBox?.width  ?? imgW) / imgW,
        height: (item.boundingBox?.height ?? imgH) / imgH,
      },
    }))
    .filter((p: Paragraph) => p.text.length > 0);
}
