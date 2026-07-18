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

const SIMPLE_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    documentLanguage: { type: 'string' },
    paragraphs: {
      type: 'array',
      minItems: 1,
      maxItems: 1,
      items: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'All visible text from the image, exactly as written.' },
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
            items: {
              type: 'object',
              properties: {
                text: { type: 'string' },
                language: { type: 'string' },
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

export type ImageCategory = 'auto' | 'document' | 'whiteboard' | 'menu' | 'cursive';

async function geminiRawOcr(base64: string, signal?: AbortSignal): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const body = JSON.stringify({
    contents: [{
      parts: [
        { inline_data: { mime_type: 'image/jpeg', data: base64 } },
        { text: 'Please transcribe all the text you see in this image. Return only the transcribed text, preserving the original language and reading order.' },
      ],
    }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 4096,
      thinkingConfig: { thinkingBudget: 0 },
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT',  threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HARASSMENT',         threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',        threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',  threshold: 'BLOCK_NONE' },
    ],
  });

  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal });
  if (!res.ok) throw new Error(`OCR_STEP1_ERROR_${res.status}`);
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const text = parts.find((p: any) => !p.thought)?.text ?? parts[0]?.text ?? '';
  console.log('[Hybrid] Step 1 OCR text:', text);
  return text.trim();
}

async function geminiStructure(base64: string, rawText: string, signal?: AbortSignal): Promise<{ paragraphs: Paragraph[]; language: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

  const systemInstruction = `You are a text layout engine. The OCR text from this image has already been extracted:

═══════════════════════════════════
${rawText}
═══════════════════════════════════

Your task:
1. Identify where each logical paragraph appears in the image.
2. Copy the text EXACTLY as provided above — do NOT change, correct, or rewrite any word.
3. Group consecutive lines that form one paragraph into a single paragraph object.
4. Return bounding boxes as ymin/xmin/ymax/xmax in 0–1000 scale.
5. Return segments: split by language only if foreign words appear; otherwise one segment per paragraph.
6. "documentLanguage" = dominant ISO 639-1 code.

CRITICAL: You are NOT doing OCR. You already have the text. Only find where paragraphs are located.`;

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{
      parts: [
        { inline_data: { mime_type: 'image/jpeg', data: base64 } },
        { text: 'Locate each paragraph in the image and return its bounding box. Use only the text provided in the system instruction.' },
      ],
    }],
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

  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal });
  if (!res.ok) {
    const errText = await res.text();
    console.warn('[Hybrid] Step 2 error:', errText.slice(0, 300));
    // Fall back to single-paragraph wrapping the already-extracted text
    const lang = /[֐-׿]/.test(rawText) ? 'he' : /[Ѐ-ӿ]/.test(rawText) ? 'ru' : 'en';
    return {
      paragraphs: [{ id: '0', index: 0, text: rawText, box: { x: 0, y: 0, width: 1, height: 1 }, segments: [{ text: rawText, language: lang }] }],
      language: lang,
    };
  }

  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const content = (parts.find((p: any) => !p.thought)?.text ?? parts[0]?.text ?? '').replace(/```json|```/g, '').trim();
  console.log('[Hybrid] Step 2 content:', content.slice(0, 500));

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    const lang = /[֐-׿]/.test(rawText) ? 'he' : /[Ѐ-ӿ]/.test(rawText) ? 'ru' : 'en';
    return {
      paragraphs: [{ id: '0', index: 0, text: rawText, box: { x: 0, y: 0, width: 1, height: 1 }, segments: [{ text: rawText, language: lang }] }],
      language: lang,
    };
  }

  const language = parsed.documentLanguage || (/[֐-׿]/.test(rawText) ? 'he' : 'en');
  const paragraphs = ((parsed.paragraphs || []) as any[])
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
    .map((p, index): Paragraph => ({ ...p, id: `p-${index}`, index }));

  return { paragraphs, language };
}

export async function extractParagraphs(base64: string, signal?: AbortSignal, category: ImageCategory = 'auto', onRetry?: () => void): Promise<{ paragraphs: Paragraph[]; language: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

  const classificationBlock = category !== 'auto'
    ? `The user has already classified this image. Skip classification and apply ONLY the ruleset for ${
        category === 'document' ? 'MODE A' : category === 'whiteboard' ? 'MODE B' : category === 'cursive' ? 'MODE E' : 'MODE D'
      } below:`
    : `You are a high-performance, production-grade Hebrew OCR engine. Your sole task is to transcribe the text from the image into a single, clean, cohesive block of text.
CRITICAL OUTPUT RULE: Output ONLY the raw transcribed text. Do NOT output JSON, XML, HTML, or markdown code blocks. Do NOT include any coordinates, bounding boxes, or metadata. Do NOT add any introductory or concluding remarks.
TRANSCRIPTION & LAYOUT RULES:
1. Natural Reading Flow: Process text in logical reading order. For Hebrew, read Right to Left (RTL), Top to Bottom.
2. Column Handling: Never read across columns. Read the entire right column first, then the left column.
3. Preserve Line Breaks: Use line breaks and paragraph breaks to match the visual layout.
ANTI-HALLUCINATION & CONTEXT ANCHORING:
Analyze the context of the first 3 lines and use phonetic spelling correction matching that domain.
NEVER hallucinate real-estate boilerplate. If you see ambiguous characters, do not translate them into "מ"ר", "קומה", or "שוקי שוורץ" unless explicitly printed. Map them to logical words within the identified context.`;

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
RULES FOR CATEGORY B: HANDWRITTEN TEXT (Spatial Clustering Mode)
══════════════════════════════════════════════════════════════════════════
You are an expert OCR engine specializing in reading cursive Hebrew handwriting (כתב יד עברי) in personal diaries, health logs, school notebooks, and whiteboards.

THE ROOT CAUSE OF FAILURE (CRITICAL): When processing complex JSON with bounding boxes and difficult handwriting simultaneously, the model may experience attention collapse — copying dummy text or numbers (like "823", "1,752.2", "2049") across paragraphs to save compute. YOU MUST DESTROY THIS LOOP. Every paragraph is unique. Do not repeat text or coordinates from previous blocks unless they are identical in the image.

STRUCTURAL SEGMENTATION RULES:
1. IGNORE standard linear page layout. Identify isolated spatial clusters, standalone nodes, or floating handwritten text "clouds".
2. Treat standalone words, circled terms, or short labels near arrows as independent paragraph objects. Do NOT merge unrelated clusters.
3. CRITICAL FOR DATED LISTS, DIARIES & TIMELINES:
   - Each distinct date (e.g., "28/6/25", "15/4/26") marks the start of a NEW, separate paragraph object. NEVER group multiple dates into one block.
   - A date and its description on the same horizontal line MUST be in the same paragraph object.
   - The bounding box MUST span horizontally to fully enclose both the date and the full text line beside it.
   - "text" must present them in natural reading order (e.g., "28/6/25 בסלון, 6 דקות, 20:45").
4. Bounding boxes must tightly wrap ONLY that specific cluster or row. No massive overlapping boxes.

STRICT CONTEXTUAL READING — HEBREW HANDWRITING CONTEXT:
- This is a personal diary or health log. Isolated multi-digit numbers like "823", "1752", "2049" are almost certainly misreadings of Hebrew cursive words. Re-examine those regions.
- Abbreviations like מ"ר (sq. meters) in this context are almost certainly מ"ג (milligrams), דק' (minutes), or similar medical/time units.
- If you see what appears to be a real-estate term (floor number, square meters) in a handwritten diary — re-read it as a time, duration, or location word.

FEW-SHOT EXAMPLE — diary with dated entries (coordinates in 0–1000 scale):
  { "text": "28/6/25 בסלון, 6 דקות, 20:45", "boundingBox": { "ymin": 120, "xmin": 20, "ymax": 170, "xmax": 980 }, "segments": [{ "text": "28/6/25 בסלון, 6 דקות, 20:45", "language": "he" }] }
  { "text": "29/6/25 כאב ראש, בוקר, 08:30", "boundingBox": { "ymin": 185, "xmin": 20, "ymax": 235, "xmax": 980 }, "segments": [{ "text": "29/6/25 כאב ראש, בוקר, 08:30", "language": "he" }] }
Note: the two paragraphs have DIFFERENT ymin/ymax values. Coordinates are 0–1000, NOT pixels.

SELF-CHECK before outputting: If any two paragraphs share identical "text", or you see "823" / "1,752" / "2049" / "קומה" as standalone tokens inside Hebrew diary text — halt, re-read those regions, and correct.`;

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

  const rulesE = `══════════════════════════════════════════════════════════════════════════
RULES FOR MODE E: CURSIVE HANDWRITING / DIARY (כתב יד / יומן)
══════════════════════════════════════════════════════════════════════════
You are an expert OCR engine specializing in challenging cursive Hebrew handwriting (כתב יד עברי רהוט) in personal diaries, medical logs, and handwritten notes.

ANTI-HALLUCINATION — ATTENTION LOOP COLLAPSE:
When transcribing complex cursive simultaneously with JSON bounding boxes, the model may copy dummy text or misread cursive letters as numbers. YOU MUST PREVENT THIS:
- Every paragraph is unique. NEVER copy "text" or coordinates from a previous paragraph.
- Isolated 3-4 digit numbers like "823", "1752", "2049" appearing inside Hebrew diary text are almost certainly misreadings of cursive Hebrew words — re-examine those strokes carefully.
- If you see what appears to be a real-estate term (מ"ר, קומה, שוקי שוורץ) in a diary context — it is almost certainly a misread. Re-examine.

TIMELINE SEGMENTATION:
- Each distinct date (e.g., "28/6/25", "15/4/26") marks the start of a NEW, separate paragraph object.
- The date AND all its associated description text (until the next date) must be in the SAME paragraph object.
- Bounding box must span horizontally to fully enclose both the date and all text on that line.
- Read Hebrew right-to-left. The rightmost token on a line is the first word.

FEW-SHOT EXAMPLE (coordinates in 0–1000 scale):
Input line: "28/6/25 צבע, בסלון, בבית | 6 דקות | 20:45"
Output:
{ "text": "28/6/25 צבע, בסלון, בבית | 6 דקות | 20:45", "boundingBox": { "ymin": 120, "xmin": 20, "ymax": 175, "xmax": 980 }, "segments": [{ "text": "28/6/25 צבע, בסלון, בבית | 6 דקות | 20:45", "language": "he" }] }

COMPLIANCE CHECK: Before outputting, scan for "מ"ר", "קומה", "שוקי שוורץ", "1,752", "823". If found in a diary context — discard and re-transcribe using phonetic cursive decoding.`;

  const rulesAutoModeC = `══════════════════════════════════════════════════════════════════════════
RULES FOR MODE C: TECHNICAL / DIAGRAM
══════════════════════════════════════════════════════════════════════════
1. Separate logic/truth tables from schematic drawings — each is its own paragraph group.
2. Treat formulas, math equations, and logical expressions as standalone dedicated paragraphs.
3. Ignore illustrative drawings themselves, but extract every text label and annotation near drawing lines.
4. For truth tables: each row is one paragraph. Read columns left-to-right within each row.`;

  const activeRules = category === 'document' ? rulesA
    : category === 'whiteboard' ? rulesB
    : category === 'cursive' ? rulesE
    : category === 'menu' ? rulesC
    : '';  // auto: no extra rules, classificationBlock is the full prompt

  const systemInstruction = category === 'auto'
    ? classificationBlock  // simple control prompt — no extra rules
    : `You are an advanced, context-aware OCR and spatial analysis engine. Your task is to analyze the image and extract text strictly into the required JSON structure.

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
- "documentLanguage" must be the dominant ISO 639-1 code (e.g. "he", "en", "ru").

PHASE 4 — FINAL REPETITION CHECK (before outputting):
Scan your generated paragraphs. If you detect phrases like "מ"ר", "קומה", "שוקי שוורץ", or numbers like "823", "1,752", "2049" repeating across paragraphs in an image that is NOT about real estate — discard the draft and re-transcribe using strict phonetic cursive decoding aligned with the image's actual domain. If any two paragraphs share identical "text" values — you have a hallucination loop, discard duplicates and re-read.`;

  const body = JSON.stringify({
    ...(category !== 'auto' && { systemInstruction: { parts: [{ text: systemInstruction }] } }),
    contents: [
      {
        parts: [
          { inline_data: { mime_type: 'image/jpeg', data: base64 } },
          { text: category === 'auto'
              ? 'Please transcribe all the text you see in this image. Return only the transcribed text, preserving the original language and reading order.'
              : `This is a ${category === 'document' ? 'Mode A structured document' : category === 'whiteboard' ? 'Mode B handwritten/spatial image' : category === 'cursive' ? 'Mode E cursive Hebrew diary' : 'Mode D menu or price list'}. Apply the ruleset for this mode. Transcribe every word exactly. Return bounding boxes as ymin/xmin/ymax/xmax in 0–1000 scale.`
          },
        ],
      },
    ],
    generationConfig: {
      temperature: category === 'auto' ? 0.7 : 0.1,
      maxOutputTokens: 8192,
      ...(category !== 'auto' && { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA }),
      thinkingConfig: { thinkingBudget: (category === 'whiteboard' || category === 'cursive') ? 2048 : 0 },
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT',  threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HARASSMENT',         threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',        threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',  threshold: 'BLOCK_NONE' },
    ],
  });

  // Auto mode: plain OCR only — no JSON schema, no system instruction, no attention collapse
  if (category === 'auto') {
    console.log('\n[Auto] Starting plain OCR');
    try {
      const rawText = await geminiRawOcr(base64, signal);
      if (!rawText) throw new Error('EMPTY_RESPONSE');
      const lang = /[֐-׿]/.test(rawText) ? 'he' : /[Ѐ-ӿ]/.test(rawText) ? 'ru' : 'en';
      return {
        paragraphs: [{
          id: '0', index: 0, text: rawText,
          box: { x: 0, y: 0, width: 1, height: 1 },
          segments: [{ text: rawText, language: lang }],
        }],
        language: lang,
      };
    } catch (e: any) {
      if (e.name === 'AbortError') throw e;
      console.warn('[Auto] OCR failed, falling back to single-call:', e.message);
      // Fall through to standard single-call path below
    }
  }

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
    if (response!.status === 400) {
      if (errText.includes('User location is not supported') || errText.includes('location')) {
        throw new Error('LOCATION_ERROR');
      }
      if (errText.includes('SAFETY') || errText.includes('safety')) {
        throw new Error('SAFETY_ERROR');
      }
      if (errText.includes('image') || errText.includes('IMAGE') || errText.includes('mime')) {
        throw new Error('INVALID_IMAGE');
      }
      throw new Error('API_ERROR');
    }
    if (response!.status === 404) {
      throw new Error('SERVICE_ERROR');
    }
    if (response!.status === 503) {
      throw new Error('SERVICE_ERROR');
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

  // Auto mode returns plain text — wrap it into our paragraph structure
  if (category === 'auto') {
    const lang = /[֐-׿]/.test(cleanContent) ? 'he'
      : /[Ѐ-ӿ]/.test(cleanContent) ? 'ru'
      : 'en';
    const paragraph = {
      id: '0', index: 0,
      text: cleanContent,
      box: { x: 0, y: 0, width: 1, height: 1 },
      segments: [{ text: cleanContent, language: lang }],
    };
    return { paragraphs: [paragraph], language: lang };
  }

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
