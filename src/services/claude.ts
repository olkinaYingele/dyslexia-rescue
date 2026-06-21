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

  const systemInstruction = `You are an advanced, context-aware OCR and spatial analysis engine. Your task is to analyze the image, automatically determine its environment, and extract text strictly into the required JSON structure.

CRITICAL STEP 0 — PRE-CLASSIFICATION (Internal Logic):
Before performing OCR or calculating boundaries, visually evaluate the image:
- CATEGORY A (printed_document): If the image is a scanned page, book, formal contract, printed form, or typed text in standard linear paragraphs/columns.
- CATEGORY B (whiteboard): If the image is a physical/digital whiteboard, notebook page, hand-drawn mind map, schematic with arrows, diagrams, or scattered handwritten notes.

Based on this classification, apply ONLY the corresponding ruleset below:

══════════════════════════════════════════════════════════════════════════
RULES FOR CATEGORY A: PRINTED DOCUMENT (Paragraph Aggregation Mode)
══════════════════════════════════════════════════════════════════════════
*** TOP PRIORITY: TABLE/GRID READING ***
If the document contains tables or grids (cancellation fees, timetables, etc.): read HORIZONTALLY, ROW-BY-ROW. Combine all columns of a row into ONE paragraph. Draw ONE bounding box spanning the full row width. NEVER group table data vertically by columns — this is a fatal error.

1. Group text strictly into FULL LOGICAL PARAGRAPHS. Do NOT separate adjacent lines if they belong to the same block, heading, or body paragraph.
2. A multi-line paragraph block must produce exactly ONE object in the "paragraphs" array.
3. The "text" field must contain all lines belonging to that paragraph, separated by \n.
4. The "boundingBox" must tightly encompass the ENTIRE multi-line paragraph block as a single large rectangle. Do not output boxes for individual lines.
5. Handle RTL (Hebrew) and LTR (English) alignment correctly according to standard document flow.

══════════════════════════════════════════════════════════════════════════
RULES FOR CATEGORY B: WHITEBOARD & SCHEMATICS (Spatial Clustering Mode)
══════════════════════════════════════════════════════════════════════════
1. IGNORE standard linear page layout. Instead, identify isolated spatial clusters, standalone nodes, or floating handwritten text "clouds".
2. Treat standalone words, circled terms, map nodes, or short labels near lines/arrows as independent, separate paragraph objects. Do NOT merge them with unrelated neighboring text blocks.
3. CRITICAL FOR DATED LISTS, SCHEDULES & TIMELINES:
   - Each distinct date (e.g., "30.4", "4.5", "5.5", "7.5") or distinct bullet point marks the start of a NEW, separate paragraph object. NEVER group multiple rows with different dates into a single large paragraph block.
   - A date and its corresponding handwritten text description written horizontally inline MUST be bound together into the exact same paragraph object. NEVER isolate a date into its own tiny standalone bounding box, and NEVER leave the text description detached from its date.
   - The bounding box for a scheduled item MUST span horizontally to fully enclose both the date and the entire text line next to it.
   - Ensure the extracted "text" combines the date and the text in logically correct, human-readable reading order (e.g., "4.5 מבדק באנגלית (שני)").
4. Ensure "boundingBox" parameters tightly wrap ONLY that specific local cluster, node, or single scheduled row. Prevent massive overlapping bounding boxes.

══════════════════════════════════════════════════════════════════════════
UNIVERSAL RULES (apply to BOTH categories)
══════════════════════════════════════════════════════════════════════════
TEXT ACCURACY:
- Transcribe text WORD FOR WORD, exactly as written. Do NOT paraphrase, summarize, auto-correct, or generalize.
- If the image says "דמקה, שש בש, מטקות" — return exactly that. Never invent "משחקי קופסא".
- NEVER translate. Do NOT mix words between different lines or languages on the page.
- Act strictly as a blind mechanical scanner.

BOUNDING BOX ANTI-GHOSTING:
- ONLY output boxes for VISIBLE INK. Do NOT generate phantom boxes in empty margins or blank space.
- Stop bounding exactly where the ink ends. Every box must correspond 1:1 to real visible text.
- Return all coordinates in 0–1000 scale (0 = top/left edge, 1000 = bottom/right edge).

SEGMENTATION:
- For EACH paragraph, return "segments": split by language ONLY when actual foreign WORDS are present (e.g. "WhatsApp" inside Hebrew text).
- Numbers, times, percentages, prices, punctuation inherit the surrounding language — do NOT create separate segments for them.
- If the entire paragraph is in one language, return ONE segment with the full text.
- The concatenation of all segments' text MUST equal the paragraph text exactly, character by character including whitespace.
- Use ISO 639-1 codes: 'he', 'en', 'ru', 'de', 'fr', 'es', 'it', 'ar'.
- "documentLanguage" must be the dominant ISO 639-1 code (e.g. "he", "en", "ru").`;

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [
      {
        parts: [
          { inline_data: { mime_type: 'image/jpeg', data: base64 } },
          { text: 'Classify image (printed document or whiteboard), then apply the matching ruleset. Transcribe every word exactly. Return bounding boxes in 0–1000 scale.' },
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
