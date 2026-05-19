import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  Text,
  SafeAreaView,
  LayoutChangeEvent,
  ScrollView,
  Alert,
} from 'react-native';
import * as Speech from 'expo-speech';
import { Paragraph } from '../services/claude';

interface Props {
  imageUri: string;
  paragraphs: Paragraph[];
  onBack: () => void;
  onDelete?: () => void;
}

const COLORS = ['#E74C3C', '#2980B9', '#27AE60', '#8E44AD', '#F39C12', '#16A085', '#D35400', '#2C3E50'];

export default function BoardScreen({ imageUri, paragraphs, onBack, onDelete }: Props) {
  const [imageLayout, setImageLayout] = useState<{ width: number; height: number } | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [activeParagraph, setActiveParagraph] = useState<Paragraph | null>(null);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [words, setWords] = useState<string[]>([]);

  useEffect(() => {
    return () => { Speech.stop(); };
  }, []);

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
    const wordList = p.text.split(/\s+/).filter(w => w.length > 0);
    setWords(wordList);
    setActiveParagraph(p);
    setCurrentWordIndex(0);
    setIsPlaying(true);

    // Small delay so iOS audio session initializes after touch event
    setTimeout(() => {
      Speech.speak(p.text, {
        language: 'he-IL',
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
  }, []);

  const stopReading = () => {
    Speech.stop();
    setIsPlaying(false);
    setCurrentWordIndex(-1);
  };

  const rendered = getRenderedRect();

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { stopReading(); onBack(); }}>
          <Text style={styles.backText}>← צלם שוב</Text>
        </TouchableOpacity>
        <Text style={styles.hint}>
          {isPlaying ? '⏸ מקריא...' : 'בחר קטע לקריאה'}
        </Text>
        {onDelete && (
          <TouchableOpacity onPress={() => {
            Alert.alert('מחיקה', 'למחוק תמונה זו מהאחרונים?', [
              { text: 'ביטול', style: 'cancel' },
              { text: 'מחק', style: 'destructive', onPress: () => { stopReading(); onDelete(); } },
            ]);
          }}>
            <Text style={styles.deleteText}>🗑</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Image with boxes */}
      <View style={styles.imageWrapper} onLayout={onContainerLayout}>
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
          const width = p.box.width * rendered.rW;
          const height = p.box.height * rendered.rH;

          return (
            <TouchableOpacity
              key={p.id}
              style={[
                styles.box,
                { left, top, width, height, borderColor: color },
                isActive && styles.activeBox,
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
      </View>

      {/* Bottom reading panel */}
      {activeParagraph && (
        <View style={styles.readingPanel}>
          <ScrollView style={styles.wordScroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.wordLine}>
              {words.map((word, i) => (
                <Text
                  key={i}
                  style={[styles.word, i === currentWordIndex && styles.activeWord]}
                >
                  {i > 0 ? ' ' : ''}{word}
                </Text>
              ))}
            </Text>
          </ScrollView>
          <View style={styles.panelControls}>
            <TouchableOpacity
              style={[styles.controlBtn, isPlaying ? styles.pauseBtn : styles.playBtn]}
              onPress={() => isPlaying ? stopReading() : startReading(activeParagraph)}
            >
              <Text style={styles.controlBtnText}>{isPlaying ? '⏸ עצור' : '▶ המשך'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1A1A2E' },
  header: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  backText: { fontSize: 17, color: '#4A90E2', fontWeight: '600' },
  hint: { fontSize: 16, color: '#FFFFFF', fontWeight: '600' },
  deleteText: { fontSize: 20 },
  imageWrapper: { flex: 1, position: 'relative' },
  image: { width: '100%', height: '100%' },
  box: {
    position: 'absolute',
    borderWidth: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  activeBox: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 4,
  },
  badge: {
    position: 'absolute',
    top: -14,
    right: -14,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#FFF', fontSize: 13, fontWeight: 'bold' },

  // Reading panel at bottom
  readingPanel: {
    backgroundColor: '#FFFEF5',
    maxHeight: 160,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  wordScroll: { maxHeight: 90 },
  wordLine: {
    fontSize: 22,
    lineHeight: 36,
    color: '#2C3E50',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  word: {
    fontSize: 22,
    lineHeight: 36,
    color: '#2C3E50',
  },
  activeWord: {
    backgroundColor: '#FFE066',
    borderRadius: 5,
    fontWeight: 'bold',
    color: '#1A1A1A',
  },
  panelControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 8,
  },
  controlBtn: {
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 40,
  },
  playBtn: { backgroundColor: '#4A90E2' },
  pauseBtn: { backgroundColor: '#E74C3C' },
  controlBtnText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
});
