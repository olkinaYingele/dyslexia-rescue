import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  Text,
  SafeAreaView,
  LayoutChangeEvent,
  ScrollView,
  Animated,
  PanResponder,
  Modal,
} from 'react-native';
import * as Speech from 'expo-speech';
import { Feather } from '@expo/vector-icons';
import { Paragraph } from '../services/claude';

interface Props {
  imageUri: string;
  paragraphs: Paragraph[];
  language: string;
  isCached: boolean;
  timestamp?: number;
  onExit: () => void;
  onDelete: () => void;
}

const COLORS = ['#2F628C', '#51606F', '#68587A', '#0F4A73', '#3A4857', '#504061', '#245882', '#42474E'];

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

function formatTimestamp(ts?: number): string {
  const d = new Date(ts || Date.now());
  const date = d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
  const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}`;
}

function getDistance(touches: any[]): number {
  const dx = touches[0].pageX - touches[1].pageX;
  const dy = touches[0].pageY - touches[1].pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

export default function BoardScreen({ imageUri, paragraphs, language, isCached, timestamp, onExit, onDelete }: Props) {
  const [imageLayout, setImageLayout] = useState<{ width: number; height: number } | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [activeParagraph, setActiveParagraph] = useState<Paragraph | null>(null);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
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

  useEffect(() => {
    return () => { Speech.stop(); };
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

  const startReading = useCallback((p: Paragraph) => {
    Speech.stop();
    const { words: wordList, lineBreaks: breaks } = parseWords(p.text);
    setWords(wordList);
    setLineBreaks(breaks);
    setActiveParagraph(p);
    setCurrentWordIndex(0);
    setIsPlaying(true);

    setTimeout(() => {
      Speech.speak(p.text, {
        language: language,
        rate: 0.85,
        onBoundary: (event) => {
          const upToChar = p.text.slice(0, event.charIndex);
          const wordsBefore = upToChar.trim().split(/\s+/).filter(w => w.length > 0);
          setCurrentWordIndex(wordsBefore.length);
        },
        onDone: () => { setIsPlaying(false); setCurrentWordIndex(-1); },
        onStopped: () => { setIsPlaying(false); setCurrentWordIndex(-1); },
        onError: () => { setIsPlaying(false); setCurrentWordIndex(-1); },
      });
    }, 150);
  }, [language]);

  const stopReading = () => {
    Speech.stop();
    setIsPlaying(false);
    setCurrentWordIndex(-1);
  };

  // Double-tap to reset zoom — but not after a pinch
  const handleDoubleTap = () => {
    if (isPinching.current) return;
    const now = Date.now();
    if (now - lastTapTime.current < 350) {
      resetZoom();
      lastTapTime.current = 0;
    } else {
      lastTapTime.current = now;
    }
  };

  const rendered = getRenderedRect();
  const isRTL = ['he', 'ar', 'fa', 'ur'].includes(language);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => { stopReading(); onExit(); }}>
          <Feather name="arrow-left" size={22} color="#1C1C1E" />
        </TouchableOpacity>

        <Text style={styles.dateText}>{formatTimestamp(timestamp)}</Text>

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
            const width = Math.max(p.box.width * rendered.rW, 80);
            const height = Math.max(p.box.height * rendered.rH, 44);

            return (
              <TouchableOpacity
                key={p.id}
                style={[
                  styles.box,
                  { left, top, width, height, borderColor: color },
                  isActive && { backgroundColor: `${color}22`, borderWidth: 3 },
                ]}
                onPress={() => isActive && isPlaying ? stopReading() : startReading(p)}
                activeOpacity={0.6}
              >
                <View style={[styles.badge, { backgroundColor: color }]}>
                  <Text style={styles.badgeText}>{isActive && isPlaying ? '⏸' : i + 1}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </Animated.View>
      </View>

      {/* Bottom panel */}
      {activeParagraph && (
        <View style={styles.bottomPanel}>
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

          <TouchableOpacity
            style={styles.playBtn}
            onPress={() => isPlaying ? stopReading() : startReading(activeParagraph)}
          >
            <Feather name={isPlaying ? 'pause' : 'play'} size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      )}
      {/* Delete confirmation modal */}
      <Modal visible={showDeleteModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>מחיקה</Text>
            <Text style={styles.modalMessage}>למחוק תמונה זו?</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setShowDeleteModal(false)}
              >
                <Text style={styles.modalBtnCancelText}>ביטול</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnDelete]}
                onPress={() => { setShowDeleteModal(false); stopReading(); onDelete(); }}
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

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#F7F9FF',
  },
  headerBtn: { padding: 4 },
  dateText: {
    fontSize: 13,
    fontFamily: 'Fredoka-Regular',
    color: '#72777F',
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
    borderWidth: 2,
    borderRadius: 10,
    backgroundColor: 'transparent',
  },
  badge: {
    position: 'absolute',
    top: -13,
    right: -13,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  badgeText: { color: '#FFF', fontSize: 12, fontWeight: '700' },

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
  wordBox: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#C2C7CF',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
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
  activeWord: {
    backgroundColor: '#EFDBFF',
    borderRadius: 4,
    fontWeight: '700',
    color: '#504061',
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
