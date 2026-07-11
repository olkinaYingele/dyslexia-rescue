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
              ymin: { type: 'number' },
              xmin: { type: 'number' },
              ymax: { type: 'number' },
              xmax: { type: 'number' },
            },
            required: ['ymin', 'xmin', 'ymax', 'xmax'],
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

export type ImageCategory = 'auto' | 'document' | 'whiteboard' | 'menu';

export async function extractParagraphs(base64: string, signal?: AbortSignal, category: ImageCategory = 'auto', onRetry?: () => void): Promise<{ paragraphs: Paragraph[]; language: string }> {
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

  const classificationBlock = category === 'auto'
    ? `CRITICAL STEP 0 — PRE-CLASSIFICATION (Internal Logic):
Before performing OCR or calculating boundaries, visually evaluate the image:
- CATEGORY A (printed_document): If the image is a scanned page, book, formal contract, printed form, or typed text in standard linear paragraphs/columns. MUST be printed/typed, NOT handwritten.
- CATEGORY B (whiteboard): If the image contains ANY handwritten text, whiteboard notes, chalkboard notes, notebook pages, hand-drawn mind maps, or lists written by hand (even if they look like tables, schedules, or have column structures). ANY handwritten content MUST go here.
- CATEGORY C (menu_table): If the image is a printed/typed restaurant menu, printed price list, printed product catalog, or any typed structured table with columnar data. MUST be printed/typed, NOT handwritten.

Based on this classification, apply ONLY the corresponding ruleset below:`
    : `The user has already classified this image. Skip classification and apply ONLY the ruleset for ${
        category === 'document' ? 'CATEGORY A' : category === 'whiteboard' ? 'CATEGORY B' : 'CATEGORY C'
      } below:`;

  const rulesA = `══════════════════════════════════════════════════════════════════════════
RULES FOR CATEGORY A: PRINTED DOCUMENT (Paragraph Aggregation Mode)
══════════════════════════════════════════════════════════════════════════
*** TOP PRIORITY: TABLE/GRID READING ***
If the document contains tables or grids (cancellation fees, timetables, etc.): read HORIZONTALLY, ROW-BY-ROW. Combine all columns of a row into ONE paragraph. Draw ONE bounding box spanning the full row width. NEVER group table data vertically by columns — this is a fatal error.

1. Group text strictly into FULL LOGICAL PARAGRAPHS. Do NOT separate adjacent lines if they belong to the same block, heading, or body paragraph.
2. A multi-line paragraph block must produce exactly ONE object in the "paragraphs" array.
3. The "text" field must contain all lines belonging to that paragraph, separated by \\n.
4. The "boundingBox" must tightly encompass the ENTIRE multi-line paragraph block as a single large rectangle. Do not output boxes for individual lines.
5. Handle RTL (Hebrew) and LTR (English) alignment correctly according to standard document flow.`;

  const rulesB = `══════════════════════════════════════════════════════════════════════════
RULES FOR CATEGORY B: WHITEBOARD & SCHEMATICS (Spatial Clustering Mode)
══════════════════════════════════════════════════════════════════════════
1. IGNORE standard linear page layout. Instead, identify isolated spatial clusters, standalone nodes, or floating handwritten text "clouds".
2. Treat standalone words, circled terms, map nodes, or short labels near lines/arrows as independent, separate paragraph objects. Do NOT merge them with unrelated neighboring text blocks.
3. CRITICAL FOR DATED LISTS, SCHEDULES & TIMELINES:
   - Each distinct date (e.g., "30.4", "4.5", "5.5", "7.5") or distinct bullet point marks the start of a NEW, separate paragraph object. NEVER group multiple rows with different dates into a single large paragraph block.
   - A date and its corresponding handwritten text description written horizontally inline MUST be bound together into the exact same paragraph object. NEVER isolate a date into its own tiny standalone bounding box, and NEVER leave the text description detached from its date.
   - The bounding box for a scheduled item MUST span horizontally to fully enclose both the date and the entire text line next to it.
   - Ensure the extracted "text" combines the date and the text in logically correct, human-readable reading order (e.g., "4.5 מבדק באנגלית (שני)").
4. Ensure "boundingBox" parameters tightly wrap ONLY that specific local cluster, node, or single scheduled row. Prevent massive overlapping bounding boxes.`;

  const rulesC = `══════════════════════════════════════════════════════════════════════════
RULES FOR CATEGORY C: STRUCTURED TABLES & MENUS (Row-Based Consolidation)
══════════════════════════════════════════════════════════════════════════
1. DO NOT split a menu item/table row into multiple separate paragraph objects.
2. Group the ENTIRE line—including Item Name and its Price/Value—into exactly ONE single paragraph object.
3. CRITICAL - OMIT ALL LEADER DOTS & ORNAMENTS: Completely ignore and strip out all connecting dots, dashes, or lines (e.g., '.......' or '------'). They are decorative ornaments, NOT text. Replace with "|" as a separator (e.g., "עוף בגריל | 45").
4. If an item has a small sub-description directly underneath it, include it in the same paragraph object, separating the main line and description with a newline character (\\n).
5. The "boundingBox" for each item MUST span horizontally across the page to fully enclose both the text and the price.
6. ULTRA TOKEN OPTIMIZATION (EMPTY SEGMENTS IS MANDATORY): To prevent JSON truncation and ensure ultra-fast processing under 3-5 seconds, you MUST NOT generate any language segments for Category C.
   - For every paragraph in Category C, the "segments" array MUST be completely empty: "segments": [].
   - Never write any objects inside the "segments" array for items in Category C.
7. Omitting dots and keeping "segments" strictly empty [] is mandatory to ensure complete JSON responses and fast API delivery.`;

  const activeRules = category === 'document' ? rulesA
    : category === 'whiteboard' ? rulesB
    : category === 'menu' ? rulesC
    : `${rulesA}\n\n${rulesB}\n\n${rulesC}`;

  const systemInstruction = `You are an advanced, context-aware OCR and spatial analysis engine. Your task is to analyze the image and extract text strictly into the required JSON structure.

${classificationBlock}

${activeRules}

══════════════════════════════════════════════════════════════════════════
UNIVERSAL RULES (apply to ALL categories)
══════════════════════════════════════════════════════════════════════════
TEXT ACCURACY:
- Transcribe text WORD FOR WORD, exactly as written. Do NOT paraphrase, summarize, auto-correct, or generalize.
- If the image says "דמקה, שש בש, מטקות" — return exactly that. Never invent "משחקי קופסא".
- NEVER translate. Do NOT mix words between different lines or languages on the page.
- Act strictly as a blind mechanical scanner.

BOUNDING BOX ANTI-GHOSTING:
- ONLY output boxes for VISIBLE INK. Do NOT generate phantom boxes in empty margins or blank space.
- Stop bounding exactly where the ink ends. Every box must correspond 1:1 to real visible text.
- Return all coordinates as [ymin, xmin, ymax, xmax] in 0–1000 scale (0 = top/left edge, 1000 = bottom/right edge).

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
          { text: category === 'auto'
              ? 'Classify image (Category A: printed document, Category B: whiteboard/handwritten, Category C: menu/price list/table), then apply the matching ruleset. Transcribe every word exactly. Return bounding boxes as ymin/xmin/ymax/xmax in 0–1000 scale.'
              : `This is a ${category === 'document' ? 'Category A printed document' : category === 'whiteboard' ? 'Category B whiteboard/handwritten image' : 'Category C menu or table'}. Apply the ruleset for this category. Transcribe every word exactly. Return bounding boxes as ymin/xmin/ymax/xmax in 0–1000 scale.`
          },
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

  const requestId = Date.now();
  console.log('\n\n\n');
  console.log('╔══════════════════════════════════════════════╗');
  console.log(`║  GEMINI REQUEST #${requestId}  ║`);
  console.log('╚══════════════════════════════════════════════╝');
  console.log('[Gemini] Sending request...');

  // 1 retry on 503 (server overload) after 2s; show "Trying again..." via onRetry callback.
  let response: Response | null = null;
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (attempt > 1) {
        console.log('[Gemini] 503 — retrying in 2s...');
        onRetry?.();
        await new Promise(r => setTimeout(r, 2000));
      }
      response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal });
      console.log(`[Gemini] HTTP status: ${response.status}`);
      if (response.ok || response.status !== 503) break;
    }
  } catch (e: any) {
    if (e.name === 'AbortError') {
      console.log('[Gemini] Request aborted by user');
      throw e;
    }
    console.warn('[Gemini] Network error:', e);
    throw new Error('NO_INTERNET');
  }

  if (!response!.ok) {
    const errText = await response!.text();
    console.warn(`[Gemini] API error ${response!.status}:`, errText);
    // Detect geographic restriction — common for users in Russia/Belarus without VPN
    if (errText.includes('User location is not supported') || errText.includes('location') && response!.status === 400) {
      throw new Error('LOCATION_ERROR');
    }
    throw new Error('API_ERROR');
  }

  const data = await response!.json();
  const candidate = data.candidates?.[0];
  console.log('[Gemini] finishReason:', candidate?.finishReason);
  console.log('[Gemini] safetyRatings:', JSON.stringify(candidate?.safetyRatings));
  console.log('[Gemini] usageMetadata:', JSON.stringify(data.usageMetadata));

  const parts = candidate?.content?.parts || [];
  const content = parts.find((p: any) => !p.thought)?.text ?? parts[0]?.text;
  if (!content) {
    console.warn('[Gemini] EMPTY_RESPONSE — full data:', JSON.stringify(data));
    throw new Error('EMPTY_RESPONSE');
  }

  console.log('[Gemini] Raw content length:', content.length);
  console.log('[Gemini] Raw content:', content);

  const cleanContent = content.replace(/```json|```/g, '').trim();
  console.log('[Gemini] Clean content length:', cleanContent.length);

  let parsed: any;
  try {
    parsed = JSON.parse(cleanContent);
  } catch (e: any) {
    console.warn('[Gemini] JSON.parse FAILED:', e.message);
    console.warn('[Gemini] Failing string (first 500 chars):', cleanContent.slice(0, 500));
    console.warn('[Gemini] Failing string (last 500 chars):', cleanContent.slice(-500));

    // Attempt to repair truncated JSON: find the last complete paragraph object
    // and close the structure. Gemini truncates mid-string when hitting token limit.
    try {
      // Each complete paragraph ends with its segments array closing: ]<newline>    }
      const closeMarker = ']\n    }';
      const lastClose = cleanContent.lastIndexOf(closeMarker);
      if (lastClose === -1) throw new Error('no repair marker');
      const repaired = cleanContent.slice(0, lastClose + closeMarker.length) + '\n  ]\n}';
      parsed = JSON.parse(repaired);
      console.warn(`[Gemini] JSON repaired — kept ${parsed.paragraphs?.length ?? 0} paragraphs`);
    } catch (repairErr: any) {
      console.warn('[Gemini] Repair also failed:', repairErr.message);
      throw new Error('PARSE_ERROR');
    }
  }

  const boxes = parsed.paragraphs || [];
  const language = parsed.documentLanguage || 'he';

  console.log(`[Gemini] Parsed OK — language: ${language}, paragraphs: ${boxes.length}`);
  console.log('[Gemini] Parsed JSON:', JSON.stringify(parsed, null, 2));

  const paragraphs = (boxes as any[])
    .map((item: any) => {
      const text = item.text?.trim() || '';
      const segments: TextSegment[] = (item.segments && item.segments.length > 0)
        ? item.segments.map((s: any) => ({ text: s.text || '', language: s.language || language }))
        : [{ text, language }];
      return {
        text,
        box: {
          x:      (item.boundingBox?.xmin ?? 0) / 1000,
          y:      (item.boundingBox?.ymin ?? 0) / 1000,
          width:  ((item.boundingBox?.xmax ?? 0) - (item.boundingBox?.xmin ?? 0)) / 1000,
          height: ((item.boundingBox?.ymax ?? 0) - (item.boundingBox?.ymin ?? 0)) / 1000,
        },
        segments,
      };
    })
    .filter((p) => p.text.length > 0)
    .map((p, index): Paragraph => ({ ...p, id: `p-${index}`, index }));  // re-index after filter

  return { paragraphs, language };
}
