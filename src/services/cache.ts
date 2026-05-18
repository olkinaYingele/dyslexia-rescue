import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { Paragraph } from './claude';

const CACHE_KEY = 'recent_screens_v3';
const MAX_ITEMS = 5;
const PERM_DIR = FileSystem.documentDirectory + 'saved_screens/';

export interface CachedScreen {
  id: string;
  thumbBase64: string;
  permImagePath: string;  // permanent copy in documentDirectory
  paragraphs: Paragraph[];
  timestamp: number;
}

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(PERM_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(PERM_DIR, { intermediates: true });
  }
}

export async function saveToCache(
  imageUri: string,
  paragraphs: Paragraph[]
): Promise<void> {
  try {
    await ensureDir();
    const id = Date.now().toString();

    // Copy full image to permanent location
    const permImagePath = PERM_DIR + id + '.jpg';
    await FileSystem.copyAsync({ from: imageUri, to: permImagePath });

    // Make tiny thumbnail
    const thumb = await ImageManipulator.manipulateAsync(
      permImagePath,
      [{ resize: { width: 120 } }],
      { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );

    const newItem: CachedScreen = {
      id,
      thumbBase64: thumb.base64 || '',
      permImagePath,
      paragraphs,
      timestamp: Date.now(),
    };

    const existing = await loadCache();
    // Clean up old files that exceed MAX_ITEMS
    const toDelete = existing.slice(MAX_ITEMS - 1);
    for (const old of toDelete) {
      await FileSystem.deleteAsync(old.permImagePath, { idempotent: true });
    }
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
    // Filter out items whose files no longer exist
    const valid: CachedScreen[] = [];
    for (const item of items) {
      const info = await FileSystem.getInfoAsync(item.permImagePath);
      if (info.exists) valid.push(item);
    }
    return valid;
  } catch (e) {
    return [];
  }
}

export async function clearCache(): Promise<void> {
  try {
    await FileSystem.deleteAsync(PERM_DIR, { idempotent: true });
    await AsyncStorage.removeItem(CACHE_KEY);
  } catch (e) {}
}
