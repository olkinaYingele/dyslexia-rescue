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

  const systemInstruction = `*** HIGH PRIORITY MANDATE: ROW-BY-ROW TABLE READING ***
Your absolute top priority on structured documents is to detect tables (like the cancellation fees list at the bottom of the page) and READ THEM HORIZONTALLY, ROW-BY-ROW. Group data horizontally across column boundaries. NEVER, under any circumstances, group table data vertically by columns. Splitting rows into separate cells vertically breaks the context and meaning of the document and is a fatal error. Draw ONE bounding box that spans the entire physical width of the row.

PERFORM A STRICT LITERAL OCR on the detected rows.
Split only into logical paragraphs. A heading + its associated lines = ONE paragraph. A table row = ONE paragraph.

CRITICAL LOGICAL GROUPING RULES:
1. Group text into full, logical paragraphs or visual blocks. Do NOT separate adjacent lines if they belong to the same paragraph, list item, or heading block.
2. For each logical block, create exactly ONE object in the "paragraphs" array.
3. The "text" field MUST contain all the lines of that block, separated by a newline character (\n).
4. The "boundingBox" MUST encompass the ENTIRE block as a single large rectangle wrapping all its lines together. Do not calculate bounding boxes for individual lines.
5. Visual headers, titles with sub-headers, or bullet points that belong together spatially and contextually MUST be merged into a single bounding box with multiple lines in the "text" field.
6. Only separate blocks if there is a significant visual gap, a change in column layout, or a completely different topic/section on the page.

CRITICAL TEXT RULES:
- Transcribe text WORD FOR WORD, exactly as written. Do NOT paraphrase, summarize, or auto-correct typos.
- NEVER translate text. DO NOT mix meanings or words between different lines or languages on the page.
- Act strictly as a mechanical scanner.
- If the image says "דמקה, שש בש, מטקות" — return exactly that. Never invent "משחקי קופסא" or any other generalization.
- Detect the primary document language (ISO 639-1 code).

BOUNDING BOX STRICTNESS & ANTI-GHOSTING:
- ONLY output boxes for VISIBLE INK. Tightly wrap the characters vertically.
- DO NOT generate "phantom" boxes in empty margins, footers, or at the bottom. Do not extend boxes down into blank space.
- Every box must correspond 1:1 to real, visible text.

SEGMENTATION RULES:
- For EACH paragraph, return "segments": split by language ONLY when actual foreign WORDS are present (like "WhatsApp" inside Hebrew text).
- Numbers, times, percentages, prices, punctuation inherit surrounding language. DO NOT create separate segments for them.
- If the entire paragraph is in one language, return ONE segment covering the full text.
- The concatenation of all segments' text MUST equal the paragraph text exactly, character by character including whitespace.
- Use ISO 639-1 codes: 'he' (Hebrew), 'en' (English), 'ru' (Russian), 'de' (German), 'fr' (French), 'es' (Spanish), 'it' (Italian), 'ar' (Arabic), etc.
- Return coordinates in 0–1000 scale (0 = top/left edge, 1000 = bottom/right edge).`;

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [
      {
        parts: [
          { inline_data: { mime_type: 'image/jpeg', data: base64 } },
          { text: 'STRICT LITERAL OCR: transcribe every word exactly as written. For tables: read ROW BY ROW, one paragraph per row. For unstructured text: group by spatial proximity. Return bounding boxes in 0–1000 scale.' },
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
    safetySettings: [
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT',  threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HARASSMENT',         threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',        threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',  threshold: 'BLOCK_NONE' },
    ],
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
