// Тест word-level timestamps через SSML marks
// Запуск: node test-timestamps.mjs

import { readFileSync } from 'fs';

const configContent = readFileSync('./src/config.ts', 'utf-8');
const keyMatch = configContent.match(/TTS_API_KEY\s*=\s*['"]([^'"]+)['"]/);
const API_KEY = keyMatch[1];

const text = "Возможно думает: «Люди странные, но я красива»";

// Разбиваем на слова и оборачиваем SSML с marks между ними
const words = text.split(/\s+/);
const ssml = '<speak>' + words.map((w, i) => `<mark name="w${i}"/>${w}`).join(' ') + '<mark name="end"/></speak>';
console.log('SSML:', ssml, '\n');

const URL = `https://texttospeech.googleapis.com/v1beta1/text:synthesize?key=${API_KEY}`;

const t0 = Date.now();
const res = await fetch(URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    input: { ssml },
    voice: { languageCode: 'ru-RU', name: 'ru-RU-Standard-A' },
    audioConfig: {
      audioEncoding: 'MP3',
      sampleRateHertz: 24000,
    },
    enableTimePointing: ['SSML_MARK'],
  }),
});

const elapsed = Date.now() - t0;

if (!res.ok) {
  console.error('❌ Ошибка:', res.status);
  console.error(await res.text());
  process.exit(1);
}

const data = await res.json();
const audioKB = Math.round((data.audioContent?.length || 0) * 0.75 / 1024);

console.log(`✓ Ответ за ${elapsed}ms`);
console.log(`Аудио: ${audioKB} KB\n`);
console.log('Word timestamps:');
data.timepoints?.forEach((tp, i) => {
  const word = words[i] || '(end)';
  console.log(`  ${tp.markName}: ${tp.timeSeconds.toFixed(3)}s  ← "${word}"`);
});
