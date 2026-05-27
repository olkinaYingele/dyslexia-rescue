// Тест времени Google Cloud TTS
// Запуск: node test-tts.mjs

import { readFileSync } from 'fs';

// Читаем TTS ключ из config.ts
const configContent = readFileSync('./src/config.ts', 'utf-8');
const keyMatch = configContent.match(/TTS_API_KEY\s*=\s*['"]([^'"]+)['"]/);
if (!keyMatch) {
  console.error('❌ Не нашёл TTS_API_KEY в src/config.ts');
  console.error('   Добавь строку: export const TTS_API_KEY = \'AIzaSy...\';');
  process.exit(1);
}
const API_KEY = keyMatch[1];
console.log(`✓ TTS ключ найден (длина ${API_KEY.length})\n`);

const paragraphs = [
  "МОДЕЛЬ: Я САМА",
  "Поза: случайная, но уверенная",
  "ВНУТРЕННИЙ ПОДИУМ: ВКЛЮЧЁН",
  "РУКА ЖИВЁТ СВОЕЙ ЖИЗНЬЮ независимая, непредсказуемая, немного театральная",
  "ДЕТАЛИ ПО ОБРАЗУ: топ: «мозаика хаоса», брюки: широкие для широких мыслей, кроссы: практичная база для великих дел, осанка: 10% спортзал, 90% упрямство",
  "← туфли: чёрные, с характером",
  "Возможно думает: «Люди странные, но я красива»",
  "УРОВЕНЬ ДРАМЫ ЛИЦА: ← 87%",
  "взгляд: сканирует, выражение: недовольное, настроение: загадочно-превосходное",
  "ТЕЛЕФОН КАК АКСЕССУАР ВЛАСТИ в нём ответы. и селфи. и контролёр всего происходящего",
  "ЭЛЕГАНТНОСТЬ С ЛЁГКОЙ ТРЕВОГОЙ как будто вот-вот что-то пойдёт не так — но вид не покажу",
  "ХАРАКТЕР: загадочный, но упрямый вероятно думает, что всё под контролем (и немного права)",
  "АНАЛИЗ ЛИЧНОСТИ: смесь грации, сарказма и бытового героизма",
];

const URL = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${API_KEY}`;

async function ttsRequest(text, idx) {
  const t0 = Date.now();
  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: 'ru-RU', name: 'ru-RU-Wavenet-C' },
      audioConfig: { audioEncoding: 'MP3' },
    }),
  });
  const elapsed = Date.now() - t0;
  if (!res.ok) {
    const errText = await res.text();
    console.error(`  ❌ Абзац ${idx + 1} failed: ${res.status}\n${errText.slice(0, 200)}`);
    return { idx, elapsed: -1, size: 0 };
  }
  const data = await res.json();
  const size = Math.round((data.audioContent?.length || 0) * 0.75 / 1024); // base64 → KB
  return { idx, elapsed, size, chars: text.length };
}

// === Тест 1: последовательно ===
console.log('=== Тест 1: По очереди (как будто пользователь ждёт каждый) ===');
const t1 = Date.now();
const seqResults = [];
for (let i = 0; i < paragraphs.length; i++) {
  const r = await ttsRequest(paragraphs[i], i);
  seqResults.push(r);
  console.log(`  Абзац ${i + 1} (${r.chars} симв): ${r.elapsed}ms, ${r.size}KB`);
}
const totalSeq = Date.now() - t1;
console.log(`  ИТОГО последовательно: ${totalSeq}ms\n`);

// === Тест 2: параллельно ===
console.log('=== Тест 2: Все запросы параллельно (если делаем после OCR разом) ===');
const t2 = Date.now();
const parResults = await Promise.all(paragraphs.map((t, i) => ttsRequest(t, i)));
const totalPar = Date.now() - t2;
parResults.forEach(r => {
  console.log(`  Абзац ${r.idx + 1}: ${r.elapsed}ms`);
});
console.log(`  ИТОГО параллельно: ${totalPar}ms\n`);

// === Итог ===
const totalChars = paragraphs.reduce((s, p) => s + p.length, 0);
const totalKB = parResults.reduce((s, r) => s + r.size, 0);
const cost = totalChars / 1_000_000 * 16; // WaveNet $16 / 1M chars
console.log('=== ИТОГ ===');
console.log(`Абзацев: ${paragraphs.length}`);
console.log(`Символов всего: ${totalChars}`);
console.log(`Аудио всего: ${totalKB} KB`);
console.log(`Последовательно: ${(totalSeq / 1000).toFixed(2)} сек`);
console.log(`Параллельно: ${(totalPar / 1000).toFixed(2)} сек`);
console.log(`Цена (WaveNet): $${cost.toFixed(5)}`);
