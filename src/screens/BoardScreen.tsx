import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  Text,
  LayoutChangeEvent,
  ScrollView,
  Animated,
  PanResponder,
  Modal,
  Platform,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import { Feather } from '@expo/vector-icons';
import { Paragraph, ImageCategory } from '../services/claude';
import { ParagraphAudio } from '../services/tts';
import { UiLang, UI } from '../i18n';

interface Props {
  imageUri: string;
  paragraphs: Paragraph[];
  language: string;
  isCached: boolean;
  timestamp?: number;
  category?: ImageCategory;
  onExit: () => void;
  onDelete: () => void;
  uiLang: UiLang;
  audio?: (ParagraphAudio | undefined)[];
}

const COLORS = ['#E05A46', '#E07D3C', '#E8A828', '#3DAB5A', '#30B898', '#2F628C', '#7848A8', '#E84878'];

function parseWords(text: string): { words: string[]; lineBreaks: Set<number> } {
  const lines = text.split('\n');
  const words: string[] = [];
  const lineBreaks = new Set<number>();
  lines.forEach((line, lineIndex) => {
    if (lineIndex > 0) lineBreaks.add(words.length);
    const lineWords = line.split(/\s+/).filter(w => w.length > 0);
    words.push(...lineWords);
  });
  return { words, lineBreaks };
}

// Словарь распространённых ивритских сокращений
const HEBREW_ABBREV: Record<string, string> = {
  // כללי
  'ד״ר': 'דוקטור',
  'פרופ׳': 'פרופסור',
  'עו״ד': 'עורך דין',
  'רו״ח': 'רואה חשבון',
  'מנכ״ל': 'מנהל כללי',
  'סמנכ״ל': 'סגן מנהל כללי',
  'מזכ״ל': 'מזכיר כללי',
  'יו״ר': 'יושב ראש',
  'ח״כ': 'חבר כנסת',
  'רה״מ': 'ראש הממשלה',
  'מ״מ': 'ממלא מקום',
  // בתי ספר
  'ביה״ס': 'בית הספר',
  'בי״ס': 'בית ספר',
  'חט״ב': 'חטיבת ביניים',
  'חט״ע': 'חטיבה עליונה',
  'מל״ג': 'המועצה להשכלה גבוהה',
  // מקומות
  'ת״א': 'תל אביב',
  'י״ם': 'ירושלים',
  'ירו׳': 'ירושלים',
  'ר״ג': 'רמת גן',
  'ראשל״צ': 'ראשון לציון',
  'פ״ת': 'פתח תקווה',
  'כפ״ס': 'כפר סבא',
  'ב״ש': 'באר שבע',
  'ב״ב': 'בני ברק',
  'ק״ג': 'קריית גת',
  'ק״ש': 'קריית שמונה',
  // מוסדות ומסמכים
  'ת״ז': 'תעודת זהות',
  'מס׳': 'מספר',
  'טל׳': 'טלפון',
  'רח׳': 'רחוב',
  'דוא״ל': 'דואר אלקטרוני',
  'קופ״ח': 'קופת חולים',
  'בי״ח': 'בית חולים',
  'מד״א': 'מגן דוד אדום',
  'עו״ס': 'עובד סוציאלי',
  'בטל״א': 'ביטוח לאומי',
  'מע״מ': 'מס ערך מוסף',
  'צה״ל': 'צבא ההגנה לישראל',
  'ארה״ב': 'ארצות הברית',
  'בג״ץ': 'בית משפט גבוה לצדק',
  'שב״כ': 'שירות ביטחון כללי',
  // ימים וזמן
  'יום א׳': 'יום ראשון',
  'יום ב׳': 'יום שני',
  'יום ג׳': 'יום שלישי',
  'יום ד׳': 'יום רביעי',
  'יום ה׳': 'יום חמישי',
  'יום ו׳': 'יום שישי',
  'מוצ״ש': 'מוצאי שבת',
  'לפנה״צ': 'לפני הצהריים',
  'אחה״צ': 'אחר הצהריים',
  // התכתבות וטקסטים
  'ע״י': 'על ידי',
  'ע״פ': 'על פי',
  'אע״פ': 'אף על פי',
  'בד״כ': 'בדרך כלל',
  'אח״כ': 'אחר כך',
  'אחכ': 'אחר כך',
  'כ״כ': 'כל כך',
  'וכו׳': 'וכולי',
  'לדוג׳': 'לדוגמה',
  'כלו׳': 'כלומר',
  'עמ׳': 'עמוד',
  'נ״ב': 'נזכרתי בסוף',
  'הנ״ל': 'הנזכר לעיל',
  'מצ״ב': 'מצורף בזה',
  'בע״ה': 'בעזרת השם',
  'אי״ה': 'אם ירצה השם',
  'ז״ל': 'זכרונו לברכה',
  'זצ״ל': 'זכר צדיק לברכה',
  'שליט״א': 'שיחיה לאורך ימים טובים אמן',
  // שונות
  'א״י': 'ארץ ישראל',
  'ד״ש': 'דרישת שלום',
  'ת״ת': 'תלמוד תורה',
  'פ׳': 'פרק',
  'ח׳': 'חודש',
  'ש׳': 'שנה',
  'כ״ד': 'כבוד',
};

// Убирает символы, которые iOS TTS читает как мусор
function cleanForSpeech(text: string): string {
  // 0. Нормализуем все виды кавычек к единому символу ״ для работы со словарём
  let result = text.replace(/["""]/g, '״').replace(/[''']/g, '׳');
  // 1. Раскрываем известные сокращения
  for (const [abbrev, expansion] of Object.entries(HEBREW_ABBREV)) {
    result = result.replaceAll(abbrev, expansion);
  }
  // 2. Неизвестные сокращения с ״ — заменяем на пробел, чтобы буквы читались отдельно
  result = result.replace(/([א-ת])״([א-ת])/g, '$1 $2');
  // 3. Остальные кавычки убираем
  result = result.replace(/[״׳«»`]/g, '');
  return result.replace(/\s{2,}/g, ' ').trim();
}

// Определяет язык слова по скрипту его букв.
// prevLang — язык предыдущего слова, для наследования цифрами/пунктуацией.
function detectWordLang(word: string, prevLang: string | null, docLanguage: string): string {
  const hebrew   = (word.match(/[֐-׿]/g) || []).length;
  const cyrillic = (word.match(/[Ѐ-ӿ]/g) || []).length;
  const latin    = (word.match(/[a-zA-Z]/g) || []).length;
  const total = hebrew + cyrillic + latin;
  if (total === 0) return prevLang ?? docLanguage; // цифры/пунктуация — берём язык соседа
  if (hebrew >= cyrillic && hebrew >= latin) return 'he';
  if (latin > cyrillic) return 'en';
  return 'ru';
}

// Разбивает текст на сегменты по смене скрипта
function splitByLanguage(text: string, docLanguage: string): { text: string; lang: string }[] {
  const segments: { text: string; lang: string }[] = [];
  const parts = text.split(/(\s+)/);
  let currentLang: string | null = null;
  let currentText = '';

  for (const part of parts) {
    if (/^\s*$/.test(part)) {
      currentText += part;
      continue;
    }
    const partLang = detectWordLang(part, currentLang, docLanguage);
    if (currentLang === null) {
      currentLang = partLang;
      currentText += part;
    } else if (partLang === currentLang) {
      currentText += part;
    } else {
      if (currentText.trim()) segments.push({ text: currentText, lang: currentLang });
      currentLang = partLang;
      currentText = part;
    }
  }
  if (currentText.trim()) segments.push({ text: currentText, lang: currentLang! });
  return segments.length > 0 ? segments : [{ text, lang: docLanguage }];
}

// Определяет RTL по содержимому текста (иврит/арабский → RTL)
function isTextRTL(text: string): boolean {
  return /[֐-׿؀-ۿ܀-޿ހ-޿]/.test(text);
}

function formatTimestamp(ts?: number, uiLang: UiLang = 'en'): string {
  const d = new Date(ts || Date.now());
  const locale = uiLang === 'en' ? 'en-US' : 'he-IL';
  const date = d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}`;
}

function getDistance(touches: any[]): number {
  const dx = touches[0].pageX - touches[1].pageX;
  const dy = touches[0].pageY - touches[1].pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

export default function BoardScreen({ imageUri, paragraphs, language, isCached, timestamp, category, onExit, onDelete, uiLang, audio }: Props) {
  const t = UI[uiLang];
  const uiRTL = uiLang === 'he';
  const soundRef = useRef<Audio.Sound | null>(null);
  // Каждый раз когда начинаем/останавливаем чтение — увеличиваем session.
  // Это инвалидирует старые async-колбэки (didJustFinish от unloaded sound и т.п.),
  // чтобы не было гонок типа "новый абзац начался, но callback старого продолжает играть".
  const sessionRef = useRef(0);
  const [imageLayout, setImageLayout] = useState<{ width: number; height: number } | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [activeParagraph, setActiveParagraph] = useState<Paragraph | null>(null);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);  // звук на паузе (Android) или активный абзац остановлен (iOS)
  const [words, setWords] = useState<string[]>([]);
  const [lineBreaks, setLineBreaks] = useState<Set<number>>(new Set());
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Zoom & pan animated values
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const translateXAnim = useRef(new Animated.Value(0)).current;
  const translateYAnim = useRef(new Animated.Value(0)).current;

  // Refs to track current values (not triggering re-render)
  const currentScale = useRef(1);
  const currentTransX = useRef(0);
  const currentTransY = useRef(0);
  const lastScale = useRef(1);
  const lastTransX = useRef(0);
  const lastTransY = useRef(0);
  const initDist = useRef(0);

  // Double-tap detection
  const lastTapTime = useRef(0);
  // Flag to suppress double-tap after a pinch
  const isPinching = useRef(false);
  const boxTappedRef = useRef(false);

  // JS-driver animated values for zoom-compensated border and badge.
  // Cannot use Animated.divide(x, scaleAnim) here because scaleAnim uses
  // useNativeDriver:true, and borderWidth/width/height/fontSize are not
  // supported by the native animated module. Use addListener instead.
  const normalBorderAnim = useRef(new Animated.Value(2)).current;
  const activeBorderAnim = useRef(new Animated.Value(3.5)).current;
  const badgeSizeAnim    = useRef(new Animated.Value(20)).current;
  const badgeRadiusAnim  = useRef(new Animated.Value(10)).current;
  const badgeFontAnim    = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    const listenerId = scaleAnim.addListener(({ value }) => {
      const s = value || 1;
      normalBorderAnim.setValue(2 / s);
      activeBorderAnim.setValue(3.5 / s);
      badgeSizeAnim.setValue(20 / s);
      badgeRadiusAnim.setValue(10 / s);
      badgeFontAnim.setValue(10 / s);
    });
    return () => scaleAnim.removeListener(listenerId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Конфигурируем аудио: не играть в фоне (по умолчанию iOS может продолжать)
    Audio.setAudioModeAsync({
      staysActiveInBackground: false,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
    }).catch(() => {});

    // Прогрев аудио-движка Android — первое expo-av обращение долгое.
    // Загружаем и сразу выгружаем первое аудио, чтобы пользователь не ждал на первом тапе.
    if (Platform.OS === 'android' && audio?.[0]?.segments?.[0]) {
      const seg = audio[0].segments[0];
      Audio.Sound.createAsync({ uri: seg.audioUri }).then(({ sound }) => {
        sound.unloadAsync().catch(() => {});
      }).catch(() => {});
    }

    // Останавливаем чтение при сворачивании / блокировке экрана
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        sessionRef.current++;  // Инвалидируем колбэки
        Speech.stop();
        soundRef.current?.stopAsync().catch(() => {});
        soundRef.current?.unloadAsync().catch(() => {});
        soundRef.current = null;
        setIsPlaying(false);
        setIsPaused(false);
        setCurrentWordIndex(-1);
      }
    });

    return () => {
      sub.remove();
      Speech.stop();
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  const resetZoom = useCallback(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, damping: 20 }),
      Animated.spring(translateXAnim, { toValue: 0, useNativeDriver: true, damping: 20 }),
      Animated.spring(translateYAnim, { toValue: 0, useNativeDriver: true, damping: 20 }),
    ]).start();
    currentScale.current = 1;
    currentTransX.current = 0;
    currentTransY.current = 0;
    lastScale.current = 1;
    lastTransX.current = 0;
    lastTransY.current = 0;
  }, [scaleAnim, translateXAnim, translateYAnim]);

  const panResponder = useRef(
    PanResponder.create({
      // Immediately capture pinch (2 fingers)
      onStartShouldSetPanResponder: (evt) => evt.nativeEvent.touches.length >= 2,
      onStartShouldSetPanResponderCapture: (evt) => evt.nativeEvent.touches.length >= 2,

      // Capture pan movement when zoomed in (override child TouchableOpacity)
      onMoveShouldSetPanResponder: (evt, gs) => {
        const n = evt.nativeEvent.touches.length;
        if (n >= 2) return true;
        if (n === 1 && currentScale.current > 1 && (Math.abs(gs.dx) > 5 || Math.abs(gs.dy) > 5)) return true;
        return false;
      },
      onMoveShouldSetPanResponderCapture: (evt, gs) => {
        // Steal pan from child when zoomed
        const n = evt.nativeEvent.touches.length;
        if (n === 1 && currentScale.current > 1 && (Math.abs(gs.dx) > 5 || Math.abs(gs.dy) > 5)) return true;
        return false;
      },

      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length >= 2) {
          isPinching.current = true;
          initDist.current = getDistance(touches);
        }
        lastScale.current = currentScale.current;
        lastTransX.current = currentTransX.current;
        lastTransY.current = currentTransY.current;
      },

      onPanResponderMove: (evt, gs) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length >= 2) {
          const dist = getDistance(touches);
          const newScale = Math.max(1, Math.min(5, lastScale.current * (dist / initDist.current)));
          currentScale.current = newScale;
          scaleAnim.setValue(newScale);
        } else if (currentScale.current > 1) {
          const newX = lastTransX.current + gs.dx;
          const newY = lastTransY.current + gs.dy;
          currentTransX.current = newX;
          currentTransY.current = newY;
          translateXAnim.setValue(newX);
          translateYAnim.setValue(newY);
        }
      },

      onPanResponderRelease: () => {
        // Snap back only if barely zoomed
        if (currentScale.current < 1.05) {
          Animated.parallel([
            Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }),
            Animated.spring(translateXAnim, { toValue: 0, useNativeDriver: true }),
            Animated.spring(translateYAnim, { toValue: 0, useNativeDriver: true }),
          ]).start();
          currentScale.current = 1;
          currentTransX.current = 0;
          currentTransY.current = 0;
        }
        lastScale.current = currentScale.current;
        lastTransX.current = currentTransX.current;
        lastTransY.current = currentTransY.current;

        // Clear pinch flag after a short delay (onTouchEnd fires right after)
        setTimeout(() => { isPinching.current = false; }, 200);
      },

      onPanResponderTerminate: () => {
        lastScale.current = currentScale.current;
        lastTransX.current = currentTransX.current;
        lastTransY.current = currentTransY.current;
        setTimeout(() => { isPinching.current = false; }, 200);
      },
    })
  ).current;

  const onImageLoad = (e: any) => {
    setNaturalSize({ width: e.nativeEvent.source.width, height: e.nativeEvent.source.height });
  };

  const onContainerLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setImageLayout({ width, height });
  };

  const getRenderedRect = () => {
    if (!imageLayout || !naturalSize) return null;
    const { width: cW, height: cH } = imageLayout;
    const imgAspect = naturalSize.width / naturalSize.height;
    const containerAspect = cW / cH;
    let rW: number, rH: number, oX: number, oY: number;
    if (imgAspect > containerAspect) {
      rW = cW; rH = cW / imgAspect; oX = 0; oY = (cH - rH) / 2;
    } else {
      rH = cH; rW = cH * imgAspect; oX = (cW - rW) / 2; oY = 0;
    }
    return { rW, rH, oX, oY };
  };

  // iOS path: использует expo-speech в реальном времени
  const startReadingIos = useCallback((p: Paragraph) => {
    const session = ++sessionRef.current;
    Speech.stop();
    const { words: wordList, lineBreaks: breaks } = parseWords(p.text);
    setWords(wordList);
    setLineBreaks(breaks);
    setActiveParagraph(p);
    setCurrentWordIndex(0);
    setIsPlaying(true);
    setIsPaused(false);

    const cleanedText = cleanForSpeech(p.text);
    const segments = splitByLanguage(cleanedText, language);

    // Mapping: индекс cleaned-слова → индекс original-слова.
    // cleanForSpeech раскрывает аббревиатуры (1 слово → 2-3), поэтому
    // подсветка должна отображать оригинальное слово пока звучит раскрытие.
    const originalWords = p.text.split(/\s+/).filter(w => w.length > 0);
    const cleanedToOriginal: number[] = [];
    for (let origIdx = 0; origIdx < originalWords.length; origIdx++) {
      const expanded = cleanForSpeech(originalWords[origIdx]);
      const subWords = expanded.split(/\s+/).filter(w => w.length > 0);
      const count = subWords.length || 1;
      for (let i = 0; i < count; i++) cleanedToOriginal.push(origIdx);
    }

    const speakSegment = (index: number, offset: number) => {
      if (session !== sessionRef.current) return;
      if (index >= segments.length) {
        setIsPlaying(false);
        setCurrentWordIndex(-1);
        return;
      }
      const seg = segments[index];
      Speech.speak(seg.text, {
        language: seg.lang,
        rate: 0.85,
        onBoundary: (event) => {
          if (session !== sessionRef.current) return;
          const absChar = offset + event.charIndex;
          const upToChar = cleanedText.slice(0, absChar);
          const wordsBefore = upToChar.trim().split(/\s+/).filter(w => w.length > 0);
          // iOS отдаёт onBoundary с задержкой ~300мс из-за нативного TTS + RN bridge.
          // Подсвечиваем ОДНО слово ВПЕРЁД чтобы визуально совпадало с произношением.
          const cleanedIdx = wordsBefore.length;
          const originalIdx = cleanedToOriginal[cleanedIdx] ?? cleanedIdx;
          setCurrentWordIndex(originalIdx);
        },
        onDone: () => speakSegment(index + 1, offset + seg.text.length),
        onStopped: () => {
          if (session === sessionRef.current) { setIsPlaying(false); setCurrentWordIndex(-1); }
        },
        onError: () => {
          if (session === sessionRef.current) { setIsPlaying(false); setCurrentWordIndex(-1); }
        },
      });
    };

    setTimeout(() => speakSegment(0, 0), 150);
  }, [language]);

  // Android path: играем готовое аудио из кэша через expo-av
  const startReadingAndroid = useCallback(async (p: Paragraph) => {
    const paragraphAudio = audio?.[p.index];
    if (!paragraphAudio || paragraphAudio.segments.length === 0) {
      // Fallback на expo-speech если аудио нет (например, не сгенерировалось)
      startReadingIos(p);
      return;
    }

    // Новая сессия — инвалидирует все async-колбэки от предыдущих звуков
    const session = ++sessionRef.current;

    // Остановить предыдущее воспроизведение
    if (soundRef.current) {
      try { await soundRef.current.unloadAsync(); } catch {}
      soundRef.current = null;
    }

    // Если за время unload пришла новая команда (тап на третий абзац) — выйти
    if (session !== sessionRef.current) return;

    const { words: wordList, lineBreaks: breaks } = parseWords(p.text);
    setWords(wordList);
    setLineBreaks(breaks);
    setActiveParagraph(p);
    setCurrentWordIndex(0);
    setIsPlaying(true);
    setIsPaused(false);

    // Базовый индекс слова для каждого сегмента (сегменты идут подряд)
    const segmentBaseIdx: number[] = [0];
    for (let i = 0; i < paragraphAudio.segments.length - 1; i++) {
      segmentBaseIdx.push(segmentBaseIdx[i] + paragraphAudio.segments[i].words.length);
    }

    const playSegment = async (idx: number) => {
      if (session !== sessionRef.current) return;  // Сессия устарела — выходим
      if (idx >= paragraphAudio.segments.length) {
        setIsPlaying(false);
        setCurrentWordIndex(-1);
        soundRef.current = null;
        return;
      }
      const seg = paragraphAudio.segments[idx];
      const baseWordIdx = segmentBaseIdx[idx];

      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri: seg.audioUri },
          { progressUpdateIntervalMillis: 50 }  // короткие слова требуют частого опроса
        );
        if (session !== sessionRef.current) {
          // Пока создавали звук — пришла новая команда. Не играем.
          try { await sound.unloadAsync(); } catch {}
          return;
        }
        soundRef.current = sound;

        sound.setOnPlaybackStatusUpdate(async status => {
          if (session !== sessionRef.current) return;  // Колбэк устарел
          if (!status.isLoaded) return;
          if (status.didJustFinish) {
            try { await sound.unloadAsync(); } catch {}
            if (session !== sessionRef.current) return;
            playSegment(idx + 1);
            return;
          }
          const posSec = (status.positionMillis || 0) / 1000;
          let localIdx = 0;
          for (let i = 0; i < seg.words.length; i++) {
            if (seg.wordTimes[i] <= posSec) localIdx = i;
            else break;
          }
          setCurrentWordIndex(baseWordIdx + localIdx);
        });

        await sound.playAsync();
      } catch (e) {
        console.warn('[BoardScreen] Audio play error:', e);
        if (session === sessionRef.current) {
          setIsPlaying(false);
          setCurrentWordIndex(-1);
        }
      }
    };

    playSegment(0);
  }, [audio, startReadingIos]);

  const startReading = useCallback((p: Paragraph) => {
    if (Platform.OS === 'android' && audio) {
      startReadingAndroid(p);
    } else {
      startReadingIos(p);
    }
  }, [audio, startReadingIos, startReadingAndroid]);

  // Пауза: Android — через expo-av pauseAsync, iOS — через expo-speech Speech.pause.
  const pauseReading = async () => {
    if (Platform.OS === 'android' && soundRef.current) {
      try { await soundRef.current.pauseAsync(); } catch {}
    } else {
      Speech.pause();
    }
    setIsPlaying(false);
    setIsPaused(true);
  };

  const resumeReading = async () => {
    if (Platform.OS === 'android' && soundRef.current) {
      try { await soundRef.current.playAsync(); } catch {}
    } else {
      Speech.resume();
    }
    setIsPlaying(true);
    setIsPaused(false);
  };

  const stopReading = async () => {
    // Инвалидируем все активные колбэки, чтобы они не дёргали playSegment дальше
    sessionRef.current++;
    Speech.stop();
    if (soundRef.current) {
      try { await soundRef.current.stopAsync(); } catch {}
      try { await soundRef.current.unloadAsync(); } catch {}
      soundRef.current = null;
    }
    setIsPlaying(false);
    setIsPaused(false);
    setCurrentWordIndex(-1);
  };

  // Double-tap to reset zoom; single-tap on empty area closes bottom panel
  const handleDoubleTap = () => {
    if (isPinching.current) return;
    const now = Date.now();
    if (now - lastTapTime.current < 350) {
      resetZoom();
      lastTapTime.current = 0;
      boxTappedRef.current = false;
      return;
    }
    lastTapTime.current = now;

    // Single tap on empty area (no box was tapped) → close bottom panel
    if (!boxTappedRef.current && activeParagraph) {
      stopReading();
      setActiveParagraph(null);
    }
    boxTappedRef.current = false;
  };

  const rendered = getRenderedRect();
  // RTL направление для нижней панели — по содержимому активного абзаца, не по всему документу
  const isRTL = activeParagraph ? isTextRTL(activeParagraph.text) : false;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        {isCached ? (
          <TouchableOpacity style={styles.headerBtn} onPress={() => { stopReading(); onExit(); }}>
            <Feather name="arrow-left" size={22} color="#1C1C1E" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.saveExitBtn} onPress={() => { stopReading(); onExit(); }} activeOpacity={0.7}>
            <Feather name="arrow-left" size={18} color="#FFFFFF" />
            <Text style={styles.saveExitText}>{t.saveExit}</Text>
          </TouchableOpacity>
        )}

        <View style={styles.headerCenter}>
          <Text style={styles.dateText} numberOfLines={1}>{formatTimestamp(timestamp, uiLang)}</Text>
          {category && (
            <View style={styles.catChip}>
              <Text style={styles.catChipText}>
                {category === 'document' ? t.catDoc : category === 'menu' ? t.catMenu : category === 'whiteboard' ? t.catBoard : t.catAuto}
              </Text>
            </View>
          )}
        </View>

        <TouchableOpacity style={styles.headerBtn} onPress={() => setShowDeleteModal(true)}>
          <Feather name="trash-2" size={20} color="#72777F" />
        </TouchableOpacity>
      </View>

      {/* Image with boxes */}
      <View style={styles.imageWrapper} onLayout={onContainerLayout}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              transform: [
                { translateX: translateXAnim },
                { translateY: translateYAnim },
                { scale: scaleAnim },
              ],
            },
          ]}
          {...panResponder.panHandlers}
          onTouchEnd={handleDoubleTap}
        >
          <Image
            source={{ uri: imageUri }}
            style={styles.image}
            resizeMode="contain"
            onLoad={onImageLoad}
          />
          {rendered && paragraphs.map((p, i) => {
            const color = COLORS[i % COLORS.length];
            const isActive = activeParagraph?.id === p.id;
            const left = rendered.oX + p.box.x * rendered.rW;
            const top = rendered.oY + p.box.y * rendered.rH;
            const width = Math.max(p.box.width * rendered.rW, 40);
            const height = Math.max(p.box.height * rendered.rH, 22);

            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.box, { left, top, width, height }]}
                onPressIn={() => { boxTappedRef.current = true; }}
                onPress={() => {
                  if (isActive) {
                    if (isPlaying) pauseReading();
                    else resumeReading();
                  } else {
                    startReading(p);
                  }
                }}
                activeOpacity={0.6}
              >
                {/* Border layer — thickness stays constant regardless of zoom */}
                <Animated.View
                  pointerEvents="none"
                  style={[
                    StyleSheet.absoluteFill,
                    {
                      borderColor: color,
                      borderRadius: 10,
                      borderWidth: isActive ? activeBorderAnim : normalBorderAnim,
                      backgroundColor: isActive ? `${color}55` : 'transparent',
                    },
                  ]}
                />
                {/* Badge — size and font scale down with zoom to stay visually constant */}
                <Animated.View
                  style={[
                    styles.badge,
                    {
                      backgroundColor: color,
                      width: badgeSizeAnim,
                      height: badgeSizeAnim,
                      borderRadius: badgeRadiusAnim,
                    },
                  ]}
                >
                  <Animated.Text style={[styles.badgeText, { fontSize: badgeFontAnim }]}>
                    {isActive && isPlaying ? '⏸' : i + 1}
                  </Animated.Text>
                </Animated.View>
              </TouchableOpacity>
            );
          })}
        </Animated.View>
      </View>

      {/* Bottom panel */}
      {activeParagraph && (() => {
        const activeColor = COLORS[activeParagraph.index % COLORS.length];
        return (
          <View style={styles.bottomPanel}>
              <View style={styles.wordBoxWrapper}>
              <ScrollView style={styles.wordBox} showsVerticalScrollIndicator={false}>
              <Text style={[styles.wordLine, isRTL ? styles.textRTL : styles.textLTR]}>
                {words.map((word, i) => (
                  <Text key={i}>
                    {lineBreaks.has(i) ? '\n' : (i > 0 ? ' ' : '')}
                    <Text style={[styles.word, i === currentWordIndex && styles.activeWord]}>
                      {word}
                    </Text>
                  </Text>
                ))}
              </Text>
            </ScrollView>
              <View style={[styles.panelBadge, { backgroundColor: activeColor }]}>
                <Text style={styles.panelBadgeText}>{activeParagraph.index + 1}</Text>
              </View>
              <TouchableOpacity
                style={[styles.panelPlayBtn, { backgroundColor: activeColor }]}
                onPress={() => {
                  if (isPlaying) pauseReading();
                  else if (isPaused) resumeReading();
                  else startReading(activeParagraph);
                }}
              >
                <Feather name={isPlaying ? 'pause' : 'play'} size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        );
      })()}
      {/* Delete confirmation modal */}
      <Modal visible={showDeleteModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, uiRTL ? null : { alignItems: 'flex-start' }]}>
            <Text style={[styles.modalTitle, uiRTL ? null : { textAlign: 'left' }]}>{t.deleteImageTitle}</Text>
            <Text style={[styles.modalMessage, uiRTL ? null : { textAlign: 'left' }]}>{t.deleteImageMsg}</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setShowDeleteModal(false)}
              >
                <Text style={styles.modalBtnCancelText}>{t.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnDelete]}
                onPress={() => { setShowDeleteModal(false); stopReading(); onDelete(); }}
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

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#F7F9FF',
  },
  headerBtn: { padding: 4 },
  saveExitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2F628C',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  saveExitText: {
    fontSize: 14,
    fontFamily: 'Fredoka-Medium',
    color: '#FFFFFF',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 8,
    gap: 3,
  },
  dateText: {
    fontSize: 12,
    fontFamily: 'Fredoka-Regular',
    color: '#72777F',
    textAlign: 'center',
  },
  catChip: {
    backgroundColor: '#2F628C22',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  catChipText: {
    fontSize: 11,
    fontFamily: 'Fredoka-Medium',
    color: '#2F628C',
  },

  imageWrapper: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#F7F9FF',
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  box: {
    position: 'absolute',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  badgeText: { color: '#FFF', fontSize: 10, fontWeight: '700' },

  bottomPanel: {
    backgroundColor: '#F7F9FF',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 12,
    maxHeight: '42%',
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  wordBoxWrapper: {
    flex: 1,
    position: 'relative',
  },
  panelBadge: {
    position: 'absolute',
    top: -10,
    left: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
    zIndex: 10,
  },
  panelBadgeText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  panelPlayBtn: {
    position: 'absolute',
    top: -18,
    right: 10,
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
    zIndex: 10,
  },
  wordBox: {
    borderWidth: 1.5,
    borderColor: '#C2C7CF',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 36,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    minHeight: 80,
  },
  wordLine: {
    fontSize: 18,
    lineHeight: 28,
    fontFamily: 'Fredoka-Regular',
    color: '#181C20',
  },
  textRTL: { textAlign: 'right', writingDirection: 'rtl' },
  textLTR: { textAlign: 'left', writingDirection: 'ltr' },
  word: {
    fontSize: 18,
    lineHeight: 28,
    fontFamily: 'Fredoka-Regular',
    color: '#181C20',
  },
  activeWord: Platform.OS === 'ios' ? {
    // iOS: фон работает корректно
    backgroundColor: '#FFF0C0',
    borderRadius: 4,
    fontWeight: '700',
    color: '#8C5A00',
  } : {
    // Android: на RTL фон "растекается" по всей строке —
    // компенсируем явным жирным фонтом + ярким цветом + подчёркиванием
    fontFamily: 'Fredoka-Bold',
    color: '#c49f77',
    textDecorationLine: 'underline',
    textDecorationStyle: 'solid',
  },
  // Delete modal
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
  modalBtnCancel: {
    backgroundColor: '#DEE3EB',
  },
  modalBtnCancelText: {
    fontSize: 16,
    fontFamily: 'Fredoka-Medium',
    color: '#42474E',
  },
  modalBtnDelete: {
    backgroundColor: '#2F628C',
  },
  modalBtnDeleteText: {
    fontSize: 16,
    fontFamily: 'Fredoka-Medium',
    color: '#FFFFFF',
  },

  playBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#2F628C',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
});
