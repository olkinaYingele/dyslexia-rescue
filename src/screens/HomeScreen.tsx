import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, Linking, Platform,
  ScrollView, Image, Dimensions, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { extractParagraphs, Paragraph, ImageCategory } from '../services/claude';
import { saveToCache, prepareFullImage, prepareThumb, loadCache, deleteFromCache, deleteDayFromCache, getDayKey, CachedScreen } from '../services/cache';
import { generateAllAudio, ParagraphAudio } from '../services/tts';
import ProgressLoader from '../components/ProgressLoader';
import { UiLang, UI } from '../i18n';

const ONBOARDING_KEY = 'onboarding_seen_v1';

const { width } = Dimensions.get('window');
const THUMB_SIZE = (width - 48) / 2;

interface DayGroup {
  dateKey: string;
  label: string;
  items: CachedScreen[];
}

const CATEGORY_KEY = 'scan_category_v1';

interface Props {
  onParagraphsReady: (paragraphs: Paragraph[], imageUri: string, language: string, cacheId?: string, fromArchive?: boolean, audio?: (ParagraphAudio | undefined)[]) => void;
  onAudioReady: (audio: (ParagraphAudio | undefined)[]) => void;
  uiLang: UiLang;
  setUiLang: (lang: UiLang) => void;
  category: ImageCategory;
  setCategory: (c: ImageCategory) => void;
}

function getDayLabel(dateKey: string, uiLang: UiLang): string {
  const today = getDayKey(Date.now());
  const yesterday = getDayKey(Date.now() - 86400000);
  const t = UI[uiLang];
  const d = new Date(dateKey);
  const locale = uiLang === 'en' ? 'en-US' : 'he-IL';
  const shortDate = d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
  const weekday = d.toLocaleDateString(locale, { weekday: 'long' });
  if (dateKey === today) return `${t.today}, ${shortDate}, ${weekday}`;
  if (dateKey === yesterday) return `${t.yesterday}, ${shortDate}, ${weekday}`;
  return `${shortDate}, ${weekday}`;
}

function groupByDay(items: CachedScreen[], uiLang: UiLang): DayGroup[] {
  const map = new Map<string, CachedScreen[]>();
  for (const item of items) {
    const key = getDayKey(item.timestamp);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return Array.from(map.entries()).map(([dateKey, dayItems]) => ({
    dateKey,
    label: getDayLabel(dateKey, uiLang),
    items: dayItems,
  }));
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

export default function HomeScreen({ onParagraphsReady, onAudioReady, uiLang, setUiLang, category, setCategory }: Props) {
  const t = UI[uiLang];
  const uiRTL = uiLang === 'he';
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [done, setDone] = useState(false);
  const [recent, setRecent] = useState<CachedScreen[]>([]);
  const [deleteDayModal, setDeleteDayModal] = useState<DayGroup | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const handleSetCategory = (c: ImageCategory) => {
    setCategory(c);
    AsyncStorage.setItem(CATEGORY_KEY, c);
  };

  const showError = (title: string, message: string) => Alert.alert(title, message);

  const handleCancel = () => {
    abortRef.current?.abort();
  };

  const refreshCache = useCallback(async () => {
    setRecent(await loadCache());
  }, []);

  useEffect(() => { refreshCache(); }, []);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then(v => { if (!v) setShowOnboarding(true); });
  }, []);

  const closeOnboarding = async () => {
    setShowOnboarding(false);
    await AsyncStorage.setItem(ONBOARDING_KEY, '1');
  };

  const processImage = async (uri: string) => {
    const t0 = Date.now();
    const ts0 = new Date().toLocaleTimeString('he-IL', { hour12: false });
    console.log(`[${ts0}] === START processImage ===`);
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setDone(false);
    setStatus(t.loaderPrep);
    try {
      // Проход 1: фиксируем EXIF-ориентацию (запекаем поворот в пиксели)
      const oriented = await ImageManipulator.manipulateAsync(
        uri, [], { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
      );
      const { width: w, height: h } = oriented;
      const scale = Math.min(1200 / Math.max(w, h), 1);
      // Проход 2: resize + base64 для Gemini
      const manipulated = await ImageManipulator.manipulateAsync(
        oriented.uri,
        [{ resize: { width: Math.round(w * scale), height: Math.round(h * scale) } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      console.log(`⏱ resize: ${Date.now() - t0}ms`);

      setStatus(t.loaderAnalyze);
      const t1 = Date.now();
      const tsGemini = new Date().toLocaleTimeString('he-IL', { hour12: false });
      console.log(`[${tsGemini}] → Gemini OCR request`);
      const { paragraphs, language } = await extractParagraphs(manipulated.base64 || '', controller.signal, category);
      const tsGeminiDone = new Date().toLocaleTimeString('he-IL', { hour12: false });
      console.log(`[${tsGeminiDone}] ← Gemini OCR reply: ${Date.now() - t1}ms (${paragraphs.length} paragraphs)`);
      console.log(`⏱ total to board: ${Date.now() - t0}ms`);

      if (paragraphs.length === 0) {
        showError(...t.errNoText);
        return;
      }
      const cacheId = Date.now().toString();

      // Открываем борд сразу — TTS и кэш готовим в фоне
      setDone(true);
      await new Promise(r => setTimeout(r, 400));
      onParagraphsReady(paragraphs, manipulated.uri, language, cacheId, false, undefined);

      if (Platform.OS === 'android') {
        // Генерируем TTS в фоне; как только готово — передаём в BoardScreen и сохраняем кэш
        const tsTts = new Date().toLocaleTimeString('he-IL', { hour12: false });
        console.log(`[${tsTts}] → TTS batch start (${paragraphs.length} paragraphs) [background]`);
        generateAllAudio(paragraphs, cacheId)
          .then(async (audio) => {
            const tsTtsDone = new Date().toLocaleTimeString('he-IL', { hour12: false });
            console.log(`[${tsTtsDone}] ← TTS batch done [background]`);
            onAudioReady(audio);
            const [thumbUri, imageUri] = await Promise.all([
              prepareThumb(manipulated.uri, cacheId),
              prepareFullImage(manipulated.uri, cacheId),
            ]);
            await saveToCache(cacheId, { thumbUri, imageUri }, paragraphs, language, audio, category);
          })
          .catch(async (e) => {
            console.warn('[TTS] Failed:', e);
            try {
              const [thumbUri, imageUri] = await Promise.all([
                prepareThumb(manipulated.uri, cacheId),
                prepareFullImage(manipulated.uri, cacheId),
              ]);
              await saveToCache(cacheId, { thumbUri, imageUri }, paragraphs, language, undefined, category);
            } catch (e2) { console.warn('[Cache] Save failed:', e2); }
          });
      } else {
        Promise.all([
          prepareThumb(manipulated.uri, cacheId),
          prepareFullImage(manipulated.uri, cacheId),
        ]).then(([thumbUri, imageUri]) =>
          saveToCache(cacheId, { thumbUri, imageUri }, paragraphs, language, undefined, category)
        ).catch(e => console.warn('[Cache] Save failed:', e));
      }
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      console.warn('[processImage] Error:', e);
      if (e.message === 'NO_INTERNET') {
        showError(...t.errNoInternet);
      } else if (e.message === 'EMPTY_RESPONSE') {
        showError(...t.errNoText);
      } else {
        showError(...t.errGeneral);
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
      setStatus('');
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      showError(...t.errNoCamera);
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 1 });
    if (!result.canceled) await processImage(result.assets[0].uri);
  };

  const pickFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showError(...t.errNoGallery);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 1 });
    if (!result.canceled) await processImage(result.assets[0].uri);
  };

  const sendFeedback = () => {
    const phone = '972544525954';
    const text = encodeURIComponent(t.feedbackMsg);
    Linking.openURL(`whatsapp://send?phone=${phone}&text=${text}`);
  };

  const openCached = (item: CachedScreen) => {
    onParagraphsReady(item.paragraphs, item.imageUri, item.language || 'he', item.id, true, item.audio);
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
        <ProgressLoader
          status={status}
          done={done}
          onCancel={handleCancel}
          labels={{
            prep: t.loaderPrep,
            analyze: t.loaderAnalyze,
            almost: t.loaderAlmost,
            audio: t.loaderAudio,
            doneLabel: t.loaderDone,
            cancel: t.cancel,
          }}
        />
      </SafeAreaView>
    );
  }

  const dayGroups = groupByDay(recent, uiLang);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        {uiRTL ? (
          <>
            <TouchableOpacity style={styles.langBtn} onPress={() => setUiLang('en')}>
              <Text style={styles.langBtnText}>{t.langToggle}</Text>
            </TouchableOpacity>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.title}>{t.appTitle}</Text>
              <Text style={styles.subtitle}>{t.appSubtitle}</Text>
            </View>
          </>
        ) : (
          <>
            <View style={{ alignItems: 'flex-start' }}>
              <Text style={styles.title}>{t.appTitle}</Text>
              <Text style={styles.subtitle}>{t.appSubtitle}</Text>
            </View>
            <TouchableOpacity style={styles.langBtn} onPress={() => setUiLang('he')}>
              <Text style={styles.langBtnText}>{t.langToggle}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Action buttons */}
      <View style={styles.buttons}>
        <TouchableOpacity style={styles.btn} onPress={takePhoto} activeOpacity={0.85}>
          <Feather name="camera" size={20} color="#FFFFFF" />
          <Text style={styles.btnText}>{t.camera}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={pickFromGallery} activeOpacity={0.85}>
          <Feather name="image" size={20} color="#FFFFFF" />
          <Text style={styles.btnText}>{t.gallery}</Text>
        </TouchableOpacity>
      </View>

      {/* Category selector */}
      <View style={styles.catRow}>
        {(['auto', 'document', 'menu', 'whiteboard'] as ImageCategory[]).map(cat => {
          const label = cat === 'auto' ? t.catAuto : cat === 'document' ? t.catDoc : cat === 'menu' ? t.catMenu : t.catBoard;
          const active = category === cat;
          return (
            <TouchableOpacity
              key={cat}
              style={[styles.catBtn, active && styles.catBtnActive]}
              onPress={() => handleSetCategory(cat)}
              activeOpacity={0.7}
            >
              <Text style={[styles.catBtnText, active && styles.catBtnTextActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Feedback */}
      <TouchableOpacity style={styles.feedbackBtn} onPress={sendFeedback} activeOpacity={0.7}>
        <Feather name="message-circle" size={14} color="#72777F" />
        <Text style={styles.feedbackText}>{t.feedback}</Text>
      </TouchableOpacity>

      {/* Empty state */}
      {dayGroups.length === 0 && (
        <View style={styles.emptyState}>
          <Feather name="camera" size={48} color="#C2C7CF" />
          <Text style={styles.emptyText}>{t.emptyHint}</Text>
        </View>
      )}

      {/* Archive grouped by day */}
      {dayGroups.length > 0 && (
        <ScrollView style={styles.recentSection} showsVerticalScrollIndicator={false}>
          {dayGroups.map(group => (
            <View key={group.dateKey}>
              {/* Day header */}
              <View style={styles.dayHeader}>
                {uiRTL ? (
                  <>
                    <TouchableOpacity style={styles.dayDeleteBtn} onPress={() => setDeleteDayModal(group)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Feather name="trash-2" size={15} color="#72777F" />
                    </TouchableOpacity>
                    <Text style={[styles.dayLabel, { textAlign: 'right' }]}>{group.label}</Text>
                  </>
                ) : (
                  <>
                    <Text style={[styles.dayLabel, { textAlign: 'left' }]}>{group.label}</Text>
                    <TouchableOpacity style={styles.dayDeleteBtn} onPress={() => setDeleteDayModal(group)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Feather name="trash-2" size={15} color="#72777F" />
                    </TouchableOpacity>
                  </>
                )}
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
                        source={{ uri: item.thumbUri }}
                        style={styles.gridThumb}
                      />
                      <View style={styles.gridFooter}>
                        {item.title ? (
                          <Text style={[styles.gridTitle, uiRTL ? null : { textAlign: 'left' }]} numberOfLines={1}>{item.title}</Text>
                        ) : null}
                        <View style={styles.gridMeta}>
                          <Text style={[styles.gridDate, uiRTL ? null : { textAlign: 'left' }]}>{formatTime(item.timestamp)}</Text>
                          {item.category && item.category !== 'auto' && (
                            <Text style={styles.gridCat}>
                              {item.category === 'document' ? t.catDoc : item.category === 'menu' ? t.catMenu : t.catBoard}
                            </Text>
                          )}
                        </View>
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

      {/* Onboarding modal */}
      <Modal visible={showOnboarding} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { alignItems: 'center', width: 320 }]}>
            <Text style={[styles.modalTitle, { textAlign: 'center', fontSize: 24, marginBottom: 20 }]}>
              {t.onboardingTitle}
            </Text>

            <View style={styles.onbStep}>
              <Text style={styles.onbEmoji}>📸</Text>
              <Text style={styles.onbText}>{t.onboardingStep1}</Text>
            </View>
            <View style={styles.onbStep}>
              <Text style={styles.onbEmoji}>👆</Text>
              <Text style={styles.onbText}>{t.onboardingStep2}</Text>
            </View>
            <View style={styles.onbStep}>
              <Text style={styles.onbEmoji}>🔊</Text>
              <Text style={styles.onbText}>{t.onboardingStep3}</Text>
            </View>

            <TouchableOpacity
              style={styles.onbBtn}
              onPress={closeOnboarding}
              activeOpacity={0.85}
            >
              <Text style={styles.onbBtnText}>{t.onboardingBtn}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Delete day confirmation modal */}
      <Modal visible={!!deleteDayModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, uiRTL ? null : { alignItems: 'flex-start' }]}>
            <Text style={[styles.modalTitle, uiRTL ? null : { textAlign: 'left' }]}>{t.deleteDayTitle}</Text>
            <Text style={[styles.modalMessage, uiRTL ? null : { textAlign: 'left' }]}>
              {t.deleteDayMsg(deleteDayModal?.label || '', deleteDayModal?.items.length || 0)}
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setDeleteDayModal(null)}
              >
                <Text style={styles.modalBtnCancelText}>{t.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnDelete]}
                onPress={() => deleteDayModal && confirmDeleteDay(deleteDayModal)}
              >
                <Text style={styles.modalBtnDeleteText}>{t.delete}</Text>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 8,
  },
  langBtn: {
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#C2C7CF',
  },
  langBtnText: {
    fontSize: 13,
    fontFamily: 'Fredoka-Medium',
    color: '#51606F',
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

  // Feedback
  catRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 4,
    backgroundColor: '#E8EDF5',
    borderRadius: 12,
    padding: 3,
    gap: 2,
  },
  catBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 10,
    alignItems: 'center',
  },
  catBtnActive: {
    backgroundColor: '#2F628C',
  },
  catBtnText: {
    fontSize: 13,
    fontFamily: 'Fredoka-Regular',
    color: '#72777F',
  },
  catBtnTextActive: {
    color: '#FFFFFF',
    fontFamily: 'Fredoka-Medium',
  },

  feedbackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    marginBottom: 8,
  },
  feedbackText: {
    fontSize: 13,
    fontFamily: 'Fredoka-Regular',
    color: '#72777F',
  },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 16,
    marginTop: -60,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'Fredoka-Regular',
    color: '#72777F',
    textAlign: 'center',
    lineHeight: 22,
  },

  // Onboarding
  onbStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 10,
    alignSelf: 'stretch',
  },
  onbEmoji: { fontSize: 28 },
  onbText: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Fredoka-Regular',
    color: '#181C20',
    lineHeight: 22,
  },
  onbBtn: {
    alignSelf: 'stretch',
    marginTop: 16,
    backgroundColor: '#2F628C',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onbBtnText: {
    fontSize: 17,
    fontFamily: 'Fredoka-Medium',
    color: '#FFFFFF',
  },

  // Archive
  recentSection: {
    flex: 1,
    paddingHorizontal: 16,
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
    backgroundColor: '#E0F4FF',
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  gridTitle: {
    color: '#181C20',
    fontSize: 13,
    fontFamily: 'Fredoka-Medium',
    textAlign: 'right',
  },
  gridMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 1,
  },
  gridDate: {
    color: '#51606F',
    fontSize: 11,
    fontFamily: 'Fredoka-Regular',
  },
  gridCat: {
    color: '#2F628C',
    fontSize: 10,
    fontFamily: 'Fredoka-Medium',
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
