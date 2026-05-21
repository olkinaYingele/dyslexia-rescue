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
} from 'react-native';
import * as Speech from 'expo-speech';
import { Paragraph } from '../services/claude';

interface Props {
  imageUri: string;
  paragraphs: Paragraph[];
  isCached: boolean;
  onExit: () => void;
  onDelete: () => void;
}

const COLORS = ['#E74C3C', '#2980B9', '#27AE60', '#8E44AD', '#F39C12', '#16A085', '#D35400', '#2C3E50'];

export default function BoardScreen({ imageUri, paragraphs, isCached, onExit, onDelete }: Props) {
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
        <TouchableOpacity onPress={() => { stopReading(); onExit(); }}>
          <Text style={styles.backText}>← יציאה</Text>
        </TouchableOpacity>
        <Text style={styles.hint}>
          {isPlaying ? '⏸ מקריא...' : 'בחר קטע לקריאה'}
        </Text>
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
                isActive && { backgroundColor: `${color}33`, borderWidth: 3 },
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

      {/* Bottom panel */}
      <View style={styles.bottomPanel}>
        {activeParagraph && (
          <>
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
            <TouchableOpacity
              style={[styles.controlBtn, isPlaying ? styles.pauseBtn : styles.playBtn]}
              onPress={() => isPlaying ? stopReading() : startReading(activeParagraph)}
            >
              <Text style={styles.controlBtnText}>{isPlaying ? '⏸ עצור' : '▶ המשך'}</Text>
            </TouchableOpacity>
          </>
        )}
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => { stopReading(); onDelete(); }}
        >
          <Text style={styles.deleteBtnText}>
            {isCached ? '🗑  מחק מהאחרונים' : '✕  צא ללא שמירה'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  header: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#000000',
  },
  backText: { fontSize: 17, color: '#007AFF', fontWeight: '600' },
  hint: { fontSize: 15, color: 'rgba(255,255,255,0.7)', fontWeight: '500' },
  imageWrapper: { flex: 1, position: 'relative', backgroundColor: '#111' },
  image: { width: '100%', height: '100%' },
  box: {
    position: 'absolute',
    borderWidth: 2.5,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  badge: {
    position: 'absolute',
    top: -13,
    right: -13,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  badgeText: { color: '#FFF', fontSize: 13, fontWeight: '700' },

  bottomPanel: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  wordScroll: { maxHeight: 100 },
  wordLine: {
    fontSize: 24,
    lineHeight: 38,
    color: '#FFFFFF',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  word: {
    fontSize: 24,
    lineHeight: 38,
    color: '#EBEBF5',
  },
  activeWord: {
    backgroundColor: '#FFD60A',
    borderRadius: 6,
    fontWeight: '700',
    color: '#000000',
  },
  controlBtn: {
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  playBtn: { backgroundColor: '#4A90E2' },
  pauseBtn: { backgroundColor: '#E74C3C' },
  controlBtnText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  deleteBtn: {
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#3A3A3C',
  },
  deleteBtnText: { color: '#FF453A', fontSize: 16, fontWeight: '600' },
});
