import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  Text,
  SafeAreaView,
  ScrollView,
  FlatList,
  Dimensions,
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
const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const IMAGE_HEIGHT = SCREEN_HEIGHT * 0.38;

export default function BoardScreen({ imageUri, paragraphs, isCached, onExit, onDelete }: Props) {
  const [activeParagraph, setActiveParagraph] = useState<Paragraph | null>(null);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [words, setWords] = useState<string[]>([]);

  useEffect(() => {
    return () => { Speech.stop(); };
  }, []);

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

  const handleParagraphPress = (p: Paragraph) => {
    if (activeParagraph?.id === p.id && isPlaying) {
      stopReading();
    } else {
      startReading(p);
    }
  };

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

      {/* Image */}
      <View style={styles.imageWrapper}>
        <Image
          source={{ uri: imageUri }}
          style={styles.image}
          resizeMode="contain"
        />
      </View>

      {/* Word highlight strip — shown when playing */}
      {activeParagraph && (
        <View style={styles.wordStrip}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.wordScrollContent}
          >
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
        </View>
      )}

      {/* Paragraph list */}
      <FlatList
        data={paragraphs}
        keyExtractor={p => p.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        renderItem={({ item: p, index: i }) => {
          const color = COLORS[i % COLORS.length];
          const isActive = activeParagraph?.id === p.id;
          return (
            <TouchableOpacity
              style={[styles.paragraphRow, isActive && { borderColor: color, borderWidth: 2 }]}
              onPress={() => handleParagraphPress(p)}
              activeOpacity={0.7}
            >
              <View style={[styles.numberBadge, { backgroundColor: color }]}>
                <Text style={styles.numberText}>
                  {isActive && isPlaying ? '⏸' : i + 1}
                </Text>
              </View>
              <Text style={styles.paragraphText} numberOfLines={isActive ? 0 : 2}>
                {p.text}
              </Text>
            </TouchableOpacity>
          );
        }}
        ListFooterComponent={
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => { stopReading(); onDelete(); }}
          >
            <Text style={styles.deleteBtnText}>
              {isCached ? '🗑  מחק מהאחרונים' : '✕  צא ללא שמירה'}
            </Text>
          </TouchableOpacity>
        }
      />
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
    paddingVertical: 10,
  },
  backText: { fontSize: 17, color: '#007AFF', fontWeight: '600' },
  hint: { fontSize: 14, color: 'rgba(255,255,255,0.6)' },

  imageWrapper: {
    height: IMAGE_HEIGHT,
    backgroundColor: '#111',
  },
  image: { width: '100%', height: '100%' },

  wordStrip: {
    backgroundColor: '#1C1C1E',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  wordScrollContent: { flexDirection: 'row-reverse', alignItems: 'center' },
  wordLine: { writingDirection: 'rtl' },
  word: { fontSize: 20, color: '#EBEBF5', lineHeight: 30 },
  activeWord: {
    backgroundColor: '#FFD60A',
    borderRadius: 5,
    fontWeight: '700',
    color: '#000',
  },

  list: { flex: 1 },
  listContent: { padding: 12, gap: 8 },

  paragraphRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    padding: 12,
    gap: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  numberBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  numberText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  paragraphText: {
    flex: 1,
    fontSize: 18,
    color: '#FFFFFF',
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 28,
  },

  deleteBtn: {
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#3A3A3C',
  },
  deleteBtnText: { color: '#FF453A', fontSize: 16, fontWeight: '600' },
});
