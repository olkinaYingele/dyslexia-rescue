import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImageManipulator from 'expo-image-manipulator';
import { Paragraph } from './claude';

const CACHE_KEY = 'recent_screens_v2';
const MAX_ITEMS = 5;

export interface CachedScreen {
  id: string;
  thumbBase64: string;   // small 120px thumbnail stored as base64
  imageUri: string;      // full-size image uri (for BoardScreen)
  paragraphs: Paragraph[];
  timestamp: number;
}

export async function saveToCache(
  imageUri: string,
  paragraphs: Paragraph[]
): Promise<void> {
  try {
    // Make a tiny thumbnail for display
    const thumb = await ImageManipulator.manipulateAsync(
      imageUri,
      [{ resize: { width: 120 } }],
      { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );

    const newItem: CachedScreen = {
      id: Date.now().toString(),
      thumbBase64: thumb.base64 || '',
      imageUri,
      paragraphs,
      timestamp: Date.now(),
    };

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
    return JSON.parse(raw) as CachedScreen[];
  } catch (e) {
    return [];
  }
}

export async function clearCache(): Promise<void> {
  await AsyncStorage.removeItem(CACHE_KEY);
}
