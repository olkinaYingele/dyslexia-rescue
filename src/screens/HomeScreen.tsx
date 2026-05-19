import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  SafeAreaView,
  FlatList,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { extractParagraphs, Paragraph } from '../services/claude';
import { saveToCache, loadCache, deleteFromCache, CachedScreen } from '../services/cache';
import ProgressLoader from '../components/ProgressLoader';

interface Props {
  onParagraphsReady: (paragraphs: Paragraph[], imageUri: string, cacheId?: string, originalUri?: string) => void;
}

export default function HomeScreen({ onParagraphsReady }: Props) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [done, setDone] = useState(false);
  const [recent, setRecent] = useState<CachedScreen[]>([]);

  const refreshCache = useCallback(async () => {
    const items = await loadCache();
    setRecent(items);
  }, []);

  useEffect(() => { refreshCache(); }, []);

  const processImage = async (uri: string) => {
    setLoading(true);
    setDone(false);
    setStatus('מכין תמונה...');
    try {
      const oriented = await ImageManipulator.manipulateAsync(
        uri, [], { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
      );
      const { width: w, height: h } = oriented;
      const maxDim = 1200;
      const scale = Math.min(maxDim / Math.max(w, h), 1);
      const manipulated = await ImageManipulator.manipulateAsync(
        oriented.uri,
        [{ resize: { width: Math.round(w * scale), height: Math.round(h * scale) } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      setStatus('מנתח טקסט...');
      const paragraphs = await extractParagraphs(manipulated.base64 || '');
      if (paragraphs.length === 0) {
        Alert.alert('לא נמצא טקסט', 'לא זוהה טקסט עברי בתמונה. נסה שוב.');
        return;
      }
      setDone(true);
      await new Promise(r => setTimeout(r, 400)); // show 100% briefly
      // Don't auto-save — user will choose on exit
      onParagraphsReady(paragraphs, manipulated.uri, undefined, manipulated.uri);
    } catch (e: any) {
      Alert.alert('שגיאה', e.message || 'אירעה שגיאה. נסה שוב.');
    } finally {
      setLoading(false);
      setStatus('');
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('נדרשת הרשאה', 'יש לאפשר גישה למצלמה'); return; }
    const result = await ImagePicker.launchCameraAsync({ quality: 1 });
    if (!result.canceled) await processImage(result.assets[0].uri);
  };

  const pickFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('נדרשת הרשאה', 'יש לאפשר גישה לגלריה'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 1 });
    if (!result.canceled) await processImage(result.assets[0].uri);
  };

  const openCached = (item: CachedScreen) => {
    onParagraphsReady(item.paragraphs, `data:image/jpeg;base64,${item.imageBase64}`, item.id);
  };

  const handleDelete = (item: CachedScreen) => {
    Alert.alert('מחיקה', 'למחוק את התמונה הזו?', [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'מחק', style: 'destructive',
        onPress: async () => {
          await deleteFromCache(item.id);
          await refreshCache();
        },
      },
    ]);
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' }) +
      ' ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>קורא</Text>
      <Text style={styles.subtitle}>צלם את הלוח או הספר</Text>

      {loading ? (
        <ProgressLoader status={status} done={done} />
      ) : (
        <View style={styles.buttons}>
          <TouchableOpacity style={styles.mainButton} onPress={takePhoto}>
            <Text style={styles.buttonIcon}>📷</Text>
            <Text style={styles.buttonText}>צלם תמונה</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={pickFromGallery}>
            <Text style={styles.buttonIcon}>🖼️</Text>
            <Text style={styles.buttonText}>בחר מהגלריה</Text>
          </TouchableOpacity>
        </View>
      )}

      {recent.length > 0 && !loading && (
        <View style={styles.recentSection}>
          <Text style={styles.recentTitle}>אחרונים</Text>
          <FlatList
            data={recent}
            horizontal
            keyExtractor={i => i.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.recentList}
            renderItem={({ item }) => (
              <View style={styles.recentItem}>
                <TouchableOpacity onPress={() => openCached(item)}>
                  <Image
                    source={{ uri: `data:image/jpeg;base64,${item.thumbBase64}` }}
                    style={styles.recentThumb}
                  />
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item)}>
                  <Text style={styles.deleteBtnText}>✕</Text>
                </TouchableOpacity>
                <Text style={styles.recentTime}>{formatTime(item.timestamp)}</Text>
              </View>
            )}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 64, fontWeight: 'bold', color: '#2C3E50', marginBottom: 8 },
  subtitle: { fontSize: 22, color: '#7F8C8D', marginBottom: 40, textAlign: 'center' },
  buttons: { width: '80%', gap: 20 },
  mainButton: {
    backgroundColor: '#4A90E2', borderRadius: 20, paddingVertical: 30,
    alignItems: 'center', shadowColor: '#4A90E2',
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 10,
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF', borderRadius: 20, paddingVertical: 25,
    alignItems: 'center', borderWidth: 2, borderColor: '#4A90E2',
  },
  buttonIcon: { fontSize: 48, marginBottom: 8 },
  buttonText: { fontSize: 24, fontWeight: '600', color: '#2C3E50' },
  recentSection: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingBottom: 16 },
  recentTitle: {
    fontSize: 16, fontWeight: '700', color: '#7F8C8D',
    textAlign: 'right', paddingHorizontal: 20, marginBottom: 8,
  },
  recentList: { paddingHorizontal: 16, gap: 12 },
  recentItem: { alignItems: 'center', gap: 4 },
  recentThumb: {
    width: 80, height: 80, borderRadius: 12,
    borderWidth: 2, borderColor: '#4A90E2',
  },
  deleteBtn: {
    position: 'absolute', top: -6, right: -6,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#E74C3C',
    alignItems: 'center', justifyContent: 'center',
  },
  deleteBtnText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  recentTime: { fontSize: 11, color: '#95A5A6', textAlign: 'center' },
});
