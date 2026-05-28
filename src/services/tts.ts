import * as FileSystem from 'expo-file-system/legacy';
import { TTS_API_KEY } from '../config';
import { TextSegment } from './claude';
import { HEBREW_ABBREV, normalizeHebrewQuotes } from './textCleanup';

// Карта голосов по языку. Дешёвые Standard голоса (~130KB/абзац).
const VOICES: Record<string, { lang: string; voice: string }> = {
  he: { lang: 'he-IL', voice: 'he-IL-Standard-A' },
  en: { lang: 'en-US', voice: 'en-US-Standard-C' },
  ru: { lang: 'ru-RU', voice: 'ru-RU-Standard-A' },
  de: { lang: 'de-DE', voice: 'de-DE-Standard-A' },
  fr: { lang: 'fr-FR', voice: 'fr-FR-Standard-A' },
  es: { lang: 'es-ES', voice: 'es-ES-Standard-A' },
  it: { lang: 'it-IT', voice: 'it-IT-Standard-A' },
  pt: { lang: 'pt-PT', voice: 'pt-PT-Standard-A' },
  ar: { lang: 'ar-XA', voice: 'ar-XA-Standard-A' },
  nl: { lang: 'nl-NL', voice: 'nl-NL-Standard-A' },
  pl: { lang: 'pl-PL', voice: 'pl-PL-Standard-A' },
  tr: { lang: 'tr-TR', voice: 'tr-TR-Standard-A' },
  uk: { lang: 'uk-UA', voice: 'uk-UA-Standard-A' },
};

const FALLBACK_VOICE = VOICES.en;

export interface SegmentAudio {
  text: string;
  language: string;
  audioUri: string;          // file:// path
  words: string[];           // word array, parallel to wordTimes
  wordTimes: number[];       // seconds when each word starts; last entry = total duration
}

export interface ParagraphAudio {
  segments: SegmentAudio[];
  totalDuration: number;     // sum of all segment durations
}

// Escape special chars for SSML
function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// Оборачивает HH:MM в SSML cardinal — чтобы TTS читал числа буквально,
// а не интерпретировал как время ("13:54" → "тринадцать пятьдесят четыре",
// а не "шесть минут до двух днём").
function wrapNumbersForLiteralReading(escapedWord: string): string {
  return escapedWord.replace(
    /(\d{1,2}):(\d{1,2})/g,
    '<say-as interpret-as="cardinal">$1</say-as>:<say-as interpret-as="cardinal">$2</say-as>'
  );
}

// Раскрывает ивритские сокращения через SSML <sub alias="...">.
// TTS читает alias (полное слово), но мы видим в дисплее оригинал
// и тайминги слов остаются на оригинальных позициях.
function expandHebrewAbbreviations(escapedWord: string, language: string): string {
  if (language !== 'he') return escapedWord;
  let result = escapedWord;
  // Сначала проверяем известные сокращения из словаря (длинные впереди — длиннее имеет приоритет)
  const sortedAbbrevs = Object.keys(HEBREW_ABBREV).sort((a, b) => b.length - a.length);
  for (const abbrev of sortedAbbrevs) {
    if (result.includes(abbrev)) {
      const alias = escapeXml(HEBREW_ABBREV[abbrev]);
      // escapeAll позволит безопасно использовать в alias
      result = result.split(abbrev).join(`<sub alias="${alias}">${abbrev}</sub>`);
    }
  }
  // Неизвестные сокращения с ивритской кавычкой ״ — читаем буквы отдельно
  // (например "מל״ג" → m-l-g, но через alias чтобы тайминг не сбивался)
  result = result.replace(/([א-ת])״([א-ת])/g, (_match, l1, l2) => {
    return `<sub alias="${l1} ${l2}">${l1}״${l2}</sub>`;
  });
  return result;
}

// Split into words and build SSML with marks before each word.
function buildSsml(text: string, language: string): { ssml: string; words: string[] } {
  // Нормализуем виды кавычек для иврита, чтобы словарь сработал
  const normalizedText = language === 'he' ? normalizeHebrewQuotes(text) : text;
  const words = normalizedText.split(/\s+/).filter(w => w.length > 0);
  const parts = words.map((w, i) => {
    let processed = escapeXml(w);
    processed = wrapNumbersForLiteralReading(processed);
    processed = expandHebrewAbbreviations(processed, language);
    return `<mark name="w${i}"/>${processed}`;
  });
  const ssml = `<speak>${parts.join(' ')}<mark name="end"/></speak>`;
  return { ssml, words };
}

async function ttsSynthesize(text: string, language: string): Promise<{ audioBase64: string; words: string[]; wordTimes: number[] }> {
  const voice = VOICES[language] || FALLBACK_VOICE;
  const { ssml, words } = buildSsml(text, language);

  const url = `https://texttospeech.googleapis.com/v1beta1/text:synthesize?key=${TTS_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { ssml },
      voice: { languageCode: voice.lang, name: voice.voice },
      audioConfig: { audioEncoding: 'MP3', sampleRateHertz: 24000 },
      enableTimePointing: ['SSML_MARK'],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.warn(`[TTS] API error ${res.status}:`, errText.slice(0, 300));
    throw new Error('TTS_API_ERROR');
  }

  const data = await res.json();
  const audioBase64 = data.audioContent || '';
  // Build wordTimes: index N = start time of word N; final entry = end time
  const timepoints: Array<{ markName: string; timeSeconds: number }> = data.timepoints || [];
  const wordTimes: number[] = new Array(words.length).fill(0);
  let endTime = 0;
  for (const tp of timepoints) {
    if (tp.markName === 'end') {
      endTime = tp.timeSeconds;
    } else if (tp.markName.startsWith('w')) {
      const idx = parseInt(tp.markName.slice(1), 10);
      if (!isNaN(idx) && idx < words.length) {
        wordTimes[idx] = tp.timeSeconds;
      }
    }
  }
  wordTimes.push(endTime);  // wordTimes.length = words.length + 1
  return { audioBase64, words, wordTimes };
}

// Saves base64 audio to FileSystem, returns file URI
async function saveAudioFile(base64: string, fileName: string): Promise<string> {
  const dir = `${FileSystem.documentDirectory}tts/`;
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  const uri = `${dir}${fileName}`;
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
  return uri;
}

// Generate TTS audio for one paragraph (all its language segments in parallel).
export async function generateParagraphAudio(
  segments: TextSegment[],
  cacheId: string,
  paragraphIndex: number,
): Promise<ParagraphAudio> {
  const results = await Promise.all(
    segments.map(async (seg, segIdx) => {
      const { audioBase64, words, wordTimes } = await ttsSynthesize(seg.text, seg.language);
      const fileName = `${cacheId}_p${paragraphIndex}_s${segIdx}.mp3`;
      const audioUri = await saveAudioFile(audioBase64, fileName);
      return {
        text: seg.text,
        language: seg.language,
        audioUri,
        words,
        wordTimes,
      } as SegmentAudio;
    })
  );

  const totalDuration = results.reduce((sum, s) => sum + (s.wordTimes[s.wordTimes.length - 1] || 0), 0);
  return { segments: results, totalDuration };
}

// Generate audio for ALL paragraphs in parallel.
export async function generateAllAudio(
  paragraphs: Array<{ segments: TextSegment[] }>,
  cacheId: string,
): Promise<ParagraphAudio[]> {
  return Promise.all(
    paragraphs.map((p, i) => generateParagraphAudio(p.segments, cacheId, i))
  );
}

// Delete all audio files for a given cacheId (called when image is deleted)
export async function deleteAudioForCache(cacheId: string): Promise<void> {
  const dir = `${FileSystem.documentDirectory}tts/`;
  try {
    const files = await FileSystem.readDirectoryAsync(dir);
    const toDelete = files.filter(f => f.startsWith(`${cacheId}_`));
    await Promise.all(toDelete.map(f => FileSystem.deleteAsync(`${dir}${f}`, { idempotent: true })));
  } catch (e) {
    // Directory doesn't exist or other error — fine, nothing to delete
  }
}
