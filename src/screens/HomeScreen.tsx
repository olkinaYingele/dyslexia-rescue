import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  FlatList,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { extractParagraphs, Paragraph } from '../services/claude';
import { saveToCache, loadCache, CachedScreen } from '../services/cache';

interface Props {
  onParagraphsReady: (paragraphs: Paragraph[], imageUri: string) => void;
}

export default function HomeScreen({ onParagraphsReady }: Props) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [recent, setRecent] = useState<CachedScreen[]>([]);

  const refreshCache = useCallback(async () => {
    const items = await loadCache();
    setRecent(items);
  }, []);

  useEffect(() => { refreshCache(); }, []);

  const processImage = async (uri: string) => {
    setLoading(true);
    setStatus('מכין תמונה...');
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1200 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      const base64 = manipulated.base64 || '';
      setStatus('מנתח טקסט...');
      const paragraphs = await extractParagraphs(base64);
      if (paragraphs.length === 0) {
        Alert.alert('לא נמצא טקסט', 'לא זוהה טקסט עברי בתמונה. נסה שוב.');
        return;
      }
      await saveToCache(manipulated.uri, paragraphs);
      await refreshCache();
      onParagraphsReady(paragraphs, manipulated.uri);
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
    onParagraphsReady(item.paragraphs, item.localImagePath);
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
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4A90E2" />
          <Text style={styles.loadingText}>{status}</Text>
        </View>
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
              <TouchableOpacity style={styles.recentItem} onPress={() => openCached(item)}>
                <Image source={{ uri: item.localImagePath }} style={styles.recentThumb} />
                <Text style={styles.recentTime}>{formatTime(item.timestamp)}</Text>
              </TouchableOpacity>
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
  loadingContainer: { alignItems: 'center', gap: 20 },
  loadingText: { fontSize: 20, color: '#4A90E2', textAlign: 'center' },
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
  recentTime: { fontSize: 11, color: '#95A5A6', textAlign: 'center' },
});
