import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { Paragraph } from './claude';

const CACHE_KEY = 'recent_screens';
const MAX_ITEMS = 5;
const CACHE_DIR = FileSystem.documentDirectory + 'cached_images/';

export interface CachedScreen {
  id: string;
  localImagePath: string;
  paragraphs: Paragraph[];
  timestamp: number;
}

async function ensureCacheDir() {
  const info = await FileSystem.getInfoAsync(CACHE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
  }
}

export async function saveToCache(imageUri: string, paragraphs: Paragraph[]): Promise<void> {
  try {
    await ensureCacheDir();
    const id = Date.now().toString();
    const localImagePath = CACHE_DIR + id + '.jpg';

    // Copy image to permanent location
    await FileSystem.copyAsync({ from: imageUri, to: localImagePath });

    const newItem: CachedScreen = { id, localImagePath, paragraphs, timestamp: Date.now() };

    const existing = await loadCache();
    const updated = [newItem, ...existing].slice(0, MAX_ITEMS);
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('Cache save failed:', e);
  }
}

export async function loadCache(): Promise<CachedScreen[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const items: CachedScreen[] = JSON.parse(raw);
    // Filter out items whose image files no longer exist
    const valid: CachedScreen[] = [];
    for (const item of items) {
      const info = await FileSystem.getInfoAsync(item.localImagePath);
      if (info.exists) valid.push(item);
    }
    return valid;
  } catch (e) {
    return [];
  }
}

export async function clearCache(): Promise<void> {
  try {
    const items = await loadCache();
    for (const item of items) {
      await FileSystem.deleteAsync(item.localImagePath, { idempotent: true });
    }
    await AsyncStorage.removeItem(CACHE_KEY);
    // Remove dir
    await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true });
  } catch (e) {
    console.warn('Cache clear failed:', e);
  }
}
