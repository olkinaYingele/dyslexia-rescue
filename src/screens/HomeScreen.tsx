import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert,
  SafeAreaView, ScrollView, Image, Dimensions, Modal,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { extractParagraphs, Paragraph } from '../services/claude';
import { saveToCache, loadCache, deleteFromCache, deleteDayFromCache, getDayKey, CachedScreen } from '../services/cache';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ProgressLoader from '../components/ProgressLoader';

const { width } = Dimensions.get('window');
const THUMB_SIZE = (width - 48) / 2;

interface DayGroup {
  dateKey: string;
  label: string;
  items: CachedScreen[];
}

interface Props {
  onParagraphsReady: (paragraphs: Paragraph[], imageUri: string, language: string, cacheId?: string, originalUri?: string) => void;
}

function getDayLabel(dateKey: string): string {
  const today = getDayKey(Date.now());
  const yesterday = getDayKey(Date.now() - 86400000);
  if (dateKey === today) return 'היום';
  if (dateKey === yesterday) return 'אתמול';
  const d = new Date(dateKey);
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' });
}

function groupByDay(items: CachedScreen[]): DayGroup[] {
  const map = new Map<string, CachedScreen[]>();
  for (const item of items) {
    const key = getDayKey(item.timestamp);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return Array.from(map.entries()).map(([dateKey, dayItems]) => ({
    dateKey,
    label: getDayLabel(dateKey),
    items: dayItems,
  }));
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

export default function HomeScreen({ onParagraphsReady }: Props) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [done, setDone] = useState(false);
  const [recent, setRecent] = useState<CachedScreen[]>([]);
  const [deleteDayModal, setDeleteDayModal] = useState<DayGroup | null>(null);

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
    onParagraphsReady(item.paragraphs, `data:image/jpeg;base64,${item.imageBase64}`, item.language || 'he', item.id);
  };

  const seedTestDates = async () => {
    const items = await loadCache();
    if (items.length < 2) { Alert.alert('אין מספיק תמונות', 'צריך לפחות 2 תמונות'); return; }
    const now = Date.now();
    const DAY = 86400000;
    const buckets = [0, 1, 3, 7].map(d => now - d * DAY); // сегодня, вчера, 3 дня, неделю назад
    const updated = items.map((item, i) => ({
      ...item,
      timestamp: buckets[i % buckets.length] - i * 60000,
    }));
    await AsyncStorage.setItem('recent_screens_v6', JSON.stringify(updated));
    await refreshCache();
    Alert.alert('✓', 'תאריכים עודכנו לבדיקה');
  };

  const confirmDeleteDay = async (group: DayGroup) => {
    await deleteDayFromCache(group.dateKey);
    await refreshCache();
    setDeleteDayModal(null);
  };

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <ProgressLoader status={status} done={done} />
      </SafeAreaView>
    );
  }

  const dayGroups = groupByDay(recent);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>מקריא</Text>
        <Text style={styles.subtitle}>צלם • האזן • הבן</Text>
        {/* DEV ONLY — раскомментировать для теста группировки по дням
        {__DEV__ && (
          <TouchableOpacity onPress={seedTestDates} style={styles.devBtn}>
            <Text style={styles.devBtnText}>🧪 seed dates</Text>
          </TouchableOpacity>
        )}
        */}
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

      {/* Archive grouped by day */}
      {dayGroups.length > 0 && (
        <ScrollView style={styles.recentSection} showsVerticalScrollIndicator={false}>
          {dayGroups.map(group => (
            <View key={group.dateKey}>
              {/* Day header */}
              <View style={styles.dayHeader}>
                <TouchableOpacity
                  style={styles.dayDeleteBtn}
                  onPress={() => setDeleteDayModal(group)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Feather name="trash-2" size={15} color="#72777F" />
                </TouchableOpacity>
                <Text style={styles.dayLabel}>{group.label}</Text>
              </View>

              {/* Grid rows of 2 */}
              {chunkArray(group.items, 2).map((row, rowIdx) => (
                <View key={rowIdx} style={styles.gridRow}>
                  {row.map(item => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.gridItem}
                      onPress={() => openCached(item)}
                      activeOpacity={0.85}
                    >
                      <Image
                        source={{ uri: `data:image/jpeg;base64,${item.thumbBase64}` }}
                        style={styles.gridThumb}
                      />
                      <View style={styles.gridFooter}>
                        {item.title ? (
                          <Text style={styles.gridTitle} numberOfLines={1}>{item.title}</Text>
                        ) : null}
                        <Text style={styles.gridDate}>{formatTime(item.timestamp)}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                  {/* Placeholder if odd number of items in row */}
                  {row.length === 1 && <View style={{ width: THUMB_SIZE }} />}
                </View>
              ))}
            </View>
          ))}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      {/* Delete day confirmation modal */}
      <Modal visible={!!deleteDayModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>מחיקת יום</Text>
            <Text style={styles.modalMessage}>
              למחוק את כל התמונות מ{deleteDayModal?.label}?{'\n'}({deleteDayModal?.items.length} תמונות)
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setDeleteDayModal(null)}
              >
                <Text style={styles.modalBtnCancelText}>ביטול</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnDelete]}
                onPress={() => deleteDayModal && confirmDeleteDay(deleteDayModal)}
              >
                <Text style={styles.modalBtnDeleteText}>מחק</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FF' },
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

  // Archive
  recentSection: {
    flex: 1,
    paddingHorizontal: 16,
  },

  // Dev button
  devBtn: {
    marginTop: 6,
    alignSelf: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#FFE08A',
    borderRadius: 8,
  },
  devBtnText: {
    fontSize: 12,
    fontFamily: 'Fredoka-Regular',
    color: '#42474E',
  },

  // Day section
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  dayLabel: {
    fontSize: 17,
    fontFamily: 'Fredoka-SemiBold',
    color: '#181C20',
    textAlign: 'right',
  },
  dayDeleteBtn: {
    padding: 4,
  },

  // Grid
  gridRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  gridItem: {
    width: THUMB_SIZE,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#DEE3EB',
    shadowColor: '#2F628C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 8,
    elevation: 3,
  },
  gridThumb: {
    width: '100%',
    height: THUMB_SIZE,
  },
  gridFooter: {
    backgroundColor: '#EAF1FC',
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  gridTitle: {
    color: '#181C20',
    fontSize: 13,
    fontFamily: 'Fredoka-Medium',
    textAlign: 'right',
  },
  gridDate: {
    color: '#51606F',
    fontSize: 11,
    fontFamily: 'Fredoka-Regular',
    textAlign: 'right',
    marginTop: 1,
  },

  // Delete day modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: {
    width: 300,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 20,
    alignItems: 'flex-end',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: 'Fredoka-SemiBold',
    color: '#181C20',
    marginBottom: 6,
    textAlign: 'right',
  },
  modalMessage: {
    fontSize: 15,
    fontFamily: 'Fredoka-Regular',
    color: '#51606F',
    textAlign: 'right',
    marginBottom: 24,
    lineHeight: 22,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    alignSelf: 'stretch',
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnCancel: { backgroundColor: '#DEE3EB' },
  modalBtnCancelText: {
    fontSize: 16,
    fontFamily: 'Fredoka-Medium',
    color: '#42474E',
  },
  modalBtnDelete: { backgroundColor: '#2F628C' },
  modalBtnDeleteText: {
    fontSize: 16,
    fontFamily: 'Fredoka-Medium',
    color: '#FFFFFF',
  },
});
