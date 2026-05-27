import { GEMINI_API_KEY } from '../config';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextSegment {
  text: string;
  language: string;  // ISO 639-1
}

export interface Paragraph {
  id: string;
  text: string;
  index: number;
  box: BoundingBox;
  segments: TextSegment[];  // splitted by language
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    documentLanguage: {
      type: 'string',
      description: "ISO 639-1 code of the primary language in the image (e.g. 'he', 'en', 'ru', 'de', 'fr')",
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
          segments: {
            type: 'array',
            description: 'Split paragraph text into contiguous segments by language. If the whole paragraph is in one language, return one segment with the full text. If it has multiple languages mixed (e.g. Hebrew with English words, or German with English), split at language boundaries.',
            items: {
              type: 'object',
              properties: {
                text: {
                  type: 'string',
                  description: 'Exact text of this segment (preserve original whitespace and punctuation).',
                },
                language: {
                  type: 'string',
                  description: "ISO 639-1 code: 'he', 'en', 'ru', 'de', 'fr', 'es', 'it', 'ar', etc.",
                },
              },
              required: ['text', 'language'],
            },
          },
        },
        required: ['text', 'boundingBox', 'segments'],
      },
    },
  },
  required: ['documentLanguage', 'paragraphs'],
};

export async function extractParagraphs(base64: string, signal?: AbortSignal): Promise<{ paragraphs: Paragraph[]; language: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

  const systemInstruction = `PERFORM A STRICT LITERAL OCR. Identify all text in the image and split it into logical paragraphs.
CRITICAL RULES — follow exactly:
- Transcribe text WORD FOR WORD, exactly as written. Do NOT paraphrase, summarize, auto-correct, or replace words with synonyms.
- If the image says "דמקה, שש בש, מטקות" — return exactly that. Never invent "משחקי קופסא" or any other generalization.
- A heading + its lines = ONE paragraph. A list or schedule = ONE paragraph.
- Detect the primary language of the document and return its ISO code (e.g. "he", "en", "ru", "de").
- For EACH paragraph, return "segments": split the paragraph text by language. If the whole paragraph is one language, return ONE segment. If it mixes languages (e.g. Hebrew with English brand names, or German with English words), split at language boundaries. The concatenation of all segments' text MUST equal the paragraph text exactly.
- Use ISO 639-1 codes: 'he' (Hebrew), 'en' (English), 'ru' (Russian), 'de' (German), 'fr' (French), 'es' (Spanish), 'it' (Italian), 'ar' (Arabic), etc.
- Return bounding box coordinates in 0–1000 scale (0 = top/left edge, 1000 = bottom/right edge).`;

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [
      {
        parts: [
          { inline_data: { mime_type: 'image/jpeg', data: base64 } },
          { text: 'STRICT LITERAL OCR: transcribe every word exactly as written. Split into logical paragraphs. For each paragraph, also split into language segments. Return bounding boxes in 0–1000 scale.' },
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
  try {
    for (let attempt = 1; attempt <= 5; attempt++) {
      response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal });
      if (response.ok || response.status !== 503) break;
      if (attempt < 5) await new Promise(r => setTimeout(r, attempt * 3000));
    }
  } catch (e: any) {
    if (e.name === 'AbortError') throw e;
    console.warn('[Gemini] Network error:', e);
    throw new Error('NO_INTERNET');
  }

  if (!response!.ok) {
    const errText = await response!.text();
    console.warn(`[Gemini] API error ${response!.status}:`, errText);
    throw new Error('API_ERROR');
  }

  const data = await response!.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const content = parts.find((p: any) => !p.thought)?.text ?? parts[0]?.text;
  if (!content) {
    console.warn('[Gemini] Empty response:', data);
    throw new Error('EMPTY_RESPONSE');
  }

  const parsed = JSON.parse(content);
  const boxes = parsed.paragraphs || [];
  const language = parsed.documentLanguage || 'he';

  console.log('=== GEMINI RAW JSON ===');
  console.log(JSON.stringify(parsed, null, 2));

  const paragraphs = (boxes as any[])
    .map((item: any) => {
      const text = item.text?.trim() || '';
      const segments: TextSegment[] = (item.segments && item.segments.length > 0)
        ? item.segments.map((s: any) => ({ text: s.text || '', language: s.language || language }))
        : [{ text, language }];
      return {
        text,
        box: {
          x:      (item.boundingBox?.left   ?? 0) / 1000,
          y:      (item.boundingBox?.top    ?? 0) / 1000,
          width:  (item.boundingBox?.width  ?? 0) / 1000,
          height: (item.boundingBox?.height ?? 0) / 1000,
        },
        segments,
      };
    })
    .filter((p) => p.text.length > 0)
    .map((p, index): Paragraph => ({ ...p, id: `p-${index}`, index }));  // re-index after filter

  return { paragraphs, language };
}
