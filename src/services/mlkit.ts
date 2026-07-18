import { Platform } from 'react-native';

let TextRecognition: any = null;

// ML Kit is only available in native builds (EAS), not Expo Go
try {
  TextRecognition = require('@react-native-ml-kit/text-recognition').default;
} catch {
  // Expo Go or web — ML Kit unavailable
}

export async function mlkitOcr(base64: string): Promise<string | null> {
  if (Platform.OS !== 'android' || !TextRecognition) return null;

  try {
    // ML Kit requires a file URI or remote URL, not raw base64.
    // We pass base64 as a data URI.
    const uri = `data:image/jpeg;base64,${base64}`;
    const result = await TextRecognition.recognize(uri);
    const text = result?.text ?? '';
    console.log('[MLKit] OCR text:', text.slice(0, 200));
    return text.trim() || null;
  } catch (e) {
    console.warn('[MLKit] OCR failed:', e);
    return null;
  }
}
