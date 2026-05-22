import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  SafeAreaView, FlatList, Image, Dimensions, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { LinearGradient } from 'expo-linear-gradient';
import { extractParagraphs, Paragraph } from '../services/claude';
import { saveToCache, loadCache, deleteFromCache, CachedScreen } from '../services/cache';
import ProgressLoader from '../components/ProgressLoader';

const { width } = Dimensions.get('window');
const THUMB_SIZE = (width - 48) / 3;

interface Props {
  onParagraphsReady: (paragraphs: Paragraph[], imageUri: string, language: string, cacheId?: string, originalUri?: string) => void;
}

export default function HomeScreen({ onParagraphsReady }: Props) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [done, setDone] = useState(false);
  const [recent, setRecent] = useState<CachedScreen[]>([]);

  const refreshCache = useCallback(async () => {
    setRecent(await loadCache());
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
      const scale = Math.min(1800 / Math.max(w, h), 1);
      const manipulated = await ImageManipulator.manipulateAsync(
        oriented.uri,
        [{ resize: { width: Math.round(w * scale), height: Math.round(h * scale) } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      setStatus('מנתח טקסט...');
      const { paragraphs, language } = await extractParagraphs(manipulated.base64 || '');
      if (paragraphs.length === 0) {
        Alert.alert('לא נמצא טקסט', 'לא זוהה טקסט בתמונה. נסה שוב.');
        return;
      }
      setDone(true);
      await new Promise(r => setTimeout(r, 400));
      onParagraphsReady(paragraphs, manipulated.uri, language, undefined, manipulated.uri);
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
    onParagraphsReady(item.paragraphs, `data:image/jpeg;base64,${item.imageBase64}`, 'he', item.id);
  };

  const handleDelete = (item: CachedScreen) => {
    Alert.alert('מחיקה', 'למחוק תמונה זו?', [
      { text: 'ביטול', style: 'cancel' },
      { text: 'מחק', style: 'destructive', onPress: async () => {
        await deleteFromCache(item.id);
        await refreshCache();
      }},
    ]);
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <ProgressLoader status={status} done={done} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.appName}>קורא</Text>
        <Text style={styles.appSubtitle}>צלם • קרא • הבן</Text>
      </View>

      {/* Main action buttons */}
      <View style={styles.actions}>
        {/* Camera — big primary button */}
        <TouchableOpacity style={styles.cameraBtn} onPress={takePhoto} activeOpacity={0.85}>
          <LinearGradient
            colors={['#007AFF', '#0051D4']}
            style={styles.cameraBtnInner}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={styles.cameraIcon}>📷</Text>
            <Text style={styles.cameraBtnText}>צלם לוח</Text>
            <Text style={styles.cameraBtnSub}>פתח מצלמה</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Gallery picker — secondary */}
        <TouchableOpacity style={styles.galleryBtn} onPress={pickFromGallery} activeOpacity={0.85}>
          <Text style={styles.galleryIcon}>🖼</Text>
          <View>
            <Text style={styles.galleryBtnText}>בחר תמונה</Text>
            <Text style={styles.galleryBtnSub}>מהגלריה</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Recent — grid like iOS Photos */}
      {recent.length > 0 && (
        <View style={styles.recentSection}>
          <Text style={styles.recentTitle}>אחרונים</Text>
          <FlatList
            data={recent}
            numColumns={3}
            keyExtractor={i => i.id}
            scrollEnabled={false}
            columnWrapperStyle={styles.gridRow}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.gridItem}
                onPress={() => openCached(item)}
                onLongPress={() => handleDelete(item)}
                activeOpacity={0.8}
              >
                <Image
                  source={{ uri: `data:image/jpeg;base64,${item.thumbBase64}` }}
                  style={styles.gridThumb}
                />
                <View style={styles.gridOverlay}>
                  <Text style={styles.gridDate}>{formatTime(item.timestamp)}</Text>
                </View>
              </TouchableOpacity>
            )}
          />
          <Text style={styles.longPressHint}>לחץ לחיצה ארוכה למחיקה</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
  appName: {
    fontSize: 34,
    fontWeight: '700',
    color: '#1C1C1E',
    letterSpacing: -0.5,
  },
  appSubtitle: {
    fontSize: 15,
    color: '#8E8E93',
    marginTop: 2,
  },

  // Actions
  actions: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  cameraBtn: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  cameraBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 22,
    paddingHorizontal: 24,
    gap: 16,
  },
  cameraIcon: { fontSize: 40 },
  cameraBtnText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    flex: 1,
  },
  cameraBtnSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
  },
  galleryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  galleryIcon: { fontSize: 32 },
  galleryBtnText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  galleryBtnSub: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 1,
  },

  // Recent grid
  recentSection: {
    flex: 1,
    paddingHorizontal: 16,
  },
  recentTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 12,
  },
  gridRow: {
    gap: 3,
    marginBottom: 3,
  },
  gridItem: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  gridThumb: {
    width: '100%',
    height: '100%',
  },
  gridOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingVertical: 3,
    paddingHorizontal: 6,
  },
  gridDate: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '500',
  },
  longPressHint: {
    textAlign: 'center',
    fontSize: 12,
    color: '#C7C7CC',
    marginTop: 10,
  },
});
