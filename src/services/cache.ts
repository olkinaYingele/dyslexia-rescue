import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImageManipulator from 'expo-image-manipulator';
import { Paragraph } from './claude';

const CACHE_KEY = 'recent_screens_v6';
const MAX_ITEMS = 30;

export interface CachedScreen {
  id: string;
  thumbBase64: string;   // 120px — для миниатюры на главном экране
  imageBase64: string;   // 500px — для BoardScreen
  paragraphs: Paragraph[];
  timestamp: number;
  language: string;
  title: string;         // первые 1–2 слова из первого абзаца
}

// Извлекает 1–2 первых слова из текста абзацев
function extractTitle(paragraphs: Paragraph[]): string {
  const text = (paragraphs[0]?.text || '').trim();
  const words = text.split(/\s+/).filter(w => w.replace(/[^\p{L}\p{N}]/gu, '').length > 1);
  if (words.length === 0) return '';
  const first = words[0].replace(/[.,;:!?"""'']+$/, '');
  if (first.length > 6 || words.length === 1) return first;
  const second = words[1].replace(/[.,;:!?"""'']+$/, '');
  return `${first} ${second}`;
}

export interface CacheImages {
  thumbBase64: string;
  imageBase64: string;
}

// 500px — для просмотра в BoardScreen, готовим параллельно с Gemini
export async function prepareFullImage(imageUri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    imageUri,
    [{ resize: { width: 500 } }],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );
  return result.base64 || '';
}

// 120px — миниатюра для галереи, готовим в фоне после открытия экрана
export async function prepareThumb(imageUri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    imageUri,
    [{ resize: { width: 120 } }],
    { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );
  return result.base64 || '';
}

export async function saveToCache(
  id: string,
  images: CacheImages,
  paragraphs: Paragraph[],
  language: string = 'he'
): Promise<void> {
  try {
    const newItem: CachedScreen = {
      id,
      thumbBase64: images.thumbBase64,
      imageBase64: images.imageBase64,
      paragraphs,
      timestamp: Date.now(),
      language,
      title: extractTitle(paragraphs),
    };

    const existing = await loadCache();
    const updated = [newItem, ...existing].slice(0, MAX_ITEMS);
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(updated));
    console.log('Cache saved, total items:', updated.length);
  } catch (e) {
    console.warn('Cache save failed:', e);
  }
}

export async function loadCache(): Promise<CachedScreen[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CachedScreen[];
  } catch (e) {
    return [];
  }
}

export async function deleteFromCache(id: string): Promise<void> {
  const items = await loadCache();
  const updated = items.filter(i => i.id !== id);
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(updated));
}

export async function deleteDayFromCache(dateKey: string): Promise<void> {
  const items = await loadCache();
  const updated = items.filter(i => getDayKey(i.timestamp) !== dateKey);
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(updated));
}

export function getDayKey(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function clearCache(): Promise<void> {
  await AsyncStorage.removeItem(CACHE_KEY);
}
