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
    documentLanguage: {
      type: 'string',
      description: "ISO 639-1 code of the primary language in the image (e.g. 'he', 'en', 'ru', 'ar')",
    },
    paragraphs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'The EXACT literal text of the paragraph, word for word, exactly as it appears. Do not change, summarize, or fix anything.',
          },
          boundingBox: {
            type: 'object',
            properties: {
              top:    { type: 'number' },
              left:   { type: 'number' },
              width:  { type: 'number' },
              height: { type: 'number' },
            },
            required: ['top', 'left', 'width', 'height'],
          },
        },
        required: ['text', 'boundingBox'],
      },
    },
  },
  required: ['documentLanguage', 'paragraphs'],
};

export async function extractParagraphs(base64: string): Promise<{ paragraphs: Paragraph[]; language: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

  const systemInstruction = `PERFORM A STRICT CHARACTER-BY-CHARACTER LITERAL OCR. Your only task is to visually scan the image for natural language text and transcribe it EXACTLY as written, symbol by symbol, word for word.
CRITICAL RULES:
1. NEVER guess or predict words based on context. If a line says 'דלת סגורה, חלון 1 פתוח, חלון 2 סגור', transcribe exactly that. DO NOT hallucinate or repeat previous paragraphs.
2. DO NOT try to make the text make sense. Act like a blind mechanical scanner.
3. Completely IGNORE truth tables, math equations, logic gate drawings, and standalone letters/numbers.
4. Only capture real text sentences, phrases, and handwritten descriptions.
5. Return bounding box coordinates in 0–1000 scale (0 = top/left edge, 1000 = bottom/right edge).
6. Detect the primary language of the document and return its ISO code (e.g. "he", "en", "ru").`;

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [
      {
        parts: [
          { inline_data: { mime_type: 'image/jpeg', data: base64 } },
          { text: 'STRICT CHARACTER-BY-CHARACTER OCR. Transcribe ONLY real text sentences and phrases, symbol by symbol, exactly as written. NEVER guess or hallucinate words. IGNORE truth tables, equations, logic gate drawings, standalone letters/numbers. Bounding boxes in 0–1000 scale. Detect document language.' },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.0,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  // Retry up to 5 times on 503 (server overload), with increasing delays
  let response: Response | null = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    if (response.ok || response.status !== 503) break;
    if (attempt < 5) await new Promise(r => setTimeout(r, attempt * 3000)); // 3s, 6s, 9s, 12s
  }

  if (!response!.ok) {
    const errText = await response!.text();
    if (response!.status === 503) {
      throw new Error('השרת עמוס כרגע. נסה שוב בעוד דקה.');
    }
    throw new Error(`Gemini API error: ${errText}`);
  }

  const data = await response!.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const content = parts.find((p: any) => !p.thought)?.text ?? parts[0]?.text;
  if (!content) throw new Error('Empty response from Gemini');

  const parsed = JSON.parse(content);
  const boxes = parsed.paragraphs || [];
  const language = parsed.documentLanguage || 'he';

  console.log('=== GEMINI RAW JSON ===');
  console.log(JSON.stringify(parsed, null, 2));

  const paragraphs = (boxes as any[])
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

  return { paragraphs, language };
}
