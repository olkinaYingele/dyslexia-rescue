import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  SafeAreaView, FlatList, Image, Dimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { extractParagraphs, Paragraph } from '../services/claude';
import { saveToCache, loadCache, deleteFromCache, CachedScreen } from '../services/cache';
import ProgressLoader from '../components/ProgressLoader';

const { width } = Dimensions.get('window');
const THUMB_SIZE = (width - 48) / 2;

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

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: '2-digit' });
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
        <Text style={styles.title}>קורא</Text>
        <Text style={styles.subtitle}>צלם • האזן • הבן</Text>
      </View>

      {/* Action buttons */}
      <View style={styles.buttons}>
        <TouchableOpacity style={styles.btn} onPress={takePhoto} activeOpacity={0.85}>
          <Feather name="camera" size={20} color="#FFFFFF" />
          <Text style={styles.btnText}>מצלמה</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={pickFromGallery} activeOpacity={0.85}>
          <Feather name="image" size={20} color="#FFFFFF" />
          <Text style={styles.btnText}>גלריה</Text>
        </TouchableOpacity>
      </View>

      {/* Recent grid */}
      {recent.length > 0 && (
        <View style={styles.recentSection}>
          <Text style={styles.recentTitle}>אחרונים</Text>
          <FlatList
            data={recent}
            numColumns={2}
            keyExtractor={i => i.id}
            scrollEnabled={true}
            columnWrapperStyle={styles.gridRow}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.gridItem}
                onPress={() => openCached(item)}
                activeOpacity={0.85}
              >
                <Image
                  source={{ uri: `data:image/jpeg;base64,${item.thumbBase64}` }}
                  style={styles.gridThumb}
                />
                <View style={styles.gridOverlay}>
                  <Text style={styles.gridDate}>{formatDate(item.timestamp)}</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F9FF',
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: '#F7F9FF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Header
  header: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 8,
    alignItems: 'flex-end',
  },
  title: {
    fontSize: 40,
    fontFamily: 'Fredoka-Bold',
    color: '#181C20',
    lineHeight: 44,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Fredoka-Regular',
    color: '#72777F',
    marginTop: 2,
  },

  // Buttons
  buttons: {
    flexDirection: 'row',
    marginHorizontal: 24,
    marginTop: 20,
    marginBottom: 24,
    gap: 12,
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2F628C',
    borderRadius: 16,
    paddingVertical: 16,
    gap: 8,
    shadowColor: '#2F628C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  btnText: {
    fontSize: 16,
    fontFamily: 'Fredoka-Medium',
    color: '#FFFFFF',
  },

  // Recent
  recentSection: {
    flex: 1,
    paddingHorizontal: 16,
  },
  recentTitle: {
    fontSize: 20,
    fontFamily: 'Fredoka-SemiBold',
    color: '#181C20',
    textAlign: 'right',
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  gridRow: {
    gap: 8,
    marginBottom: 8,
  },
  gridItem: {
    width: THUMB_SIZE,
    height: THUMB_SIZE * 1.1,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
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
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  gridDate: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'right',
  },
  hint: {
    textAlign: 'center',
    fontSize: 12,
    color: '#C7C7CC',
    marginTop: 8,
    marginBottom: 8,
  },
});
