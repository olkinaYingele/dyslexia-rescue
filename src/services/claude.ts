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
      description: 'ONLY natural language sentences and phrases. ABSOLUTELY NO math, NO logic symbols, NO single characters like A, B, C.',
      items: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'Strictly human-readable sentences or explanatory phrases in natural language (Hebrew, Russian, etc.). DO NOT include single letters, variables, logic gate names (AND/NOT/XOR), or math/boolean equations.',
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

  const systemInstruction = `CRITICAL OCR TASK: Extract ONLY full handwritten sentences, explanations, and descriptive text phrases written in natural language (Hebrew, Russian, etc.).
YOU MUST COMPLETELY IGNORE AND DROP:
1. Single Latin letters used as variables (A, B, C, F).
2. Logic gate labels and truth table headers (AND, NOT, XOR, OR).
3. Any mathematical, boolean, or algebraic formulas (like F=A.B.C, x²+3=0).
4. Pin labels or technical specifications.
5. Standalone numbers or digit-only content.
Your output must contain ONLY actual reading text — full sentences and descriptions. Transcribe them literally word-for-word, without any corrections or paraphrasing.
Return bounding box coordinates in 0–1000 scale (0 = top/left edge, 1000 = bottom/right edge).
Detect the primary language and return its ISO code (e.g. "he", "en", "ru").`;

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [
      {
        parts: [
          { inline_data: { mime_type: 'image/jpeg', data: base64 } },
          { text: 'Extract ONLY full natural language sentences and descriptive phrases (Hebrew, Russian, etc.). COMPLETELY IGNORE: single Latin letters (A, B, C), logic gate names (AND/NOT/XOR), boolean formulas, truth tables, standalone numbers. Transcribe eligible text literally word-for-word. Bounding boxes in 0–1000 scale. Detect document language.' },
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
