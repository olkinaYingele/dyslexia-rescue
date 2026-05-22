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

// All colors from the Material palette
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
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function BoardScreen({ imageUri, paragraphs, language, isCached, timestamp, onExit, onDelete }: Props) {
  const [imageLayout, setImageLayout] = useState<{ width: number; height: number } | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [activeParagraph, setActiveParagraph] = useState<Paragraph | null>(null);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [words, setWords] = useState<string[]>([]);
  const [lineBreaks, setLineBreaks] = useState<Set<number>>(new Set());

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

        <TouchableOpacity style={styles.headerBtn} onPress={() => { stopReading(); onDelete(); }}>
          <Feather name="trash-2" size={20} color="#72777F" />
        </TouchableOpacity>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FF' },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#F7F9FF',
  },
  headerBtn: {
    padding: 4,
  },
  dateText: {
    fontSize: 13,
    fontFamily: 'Fredoka-Regular',
    color: '#72777F',
  },

  // Image
  imageWrapper: { flex: 1, position: 'relative', backgroundColor: '#F7F9FF' },
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

  // Bottom panel
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
  wordScroll: {},
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
