import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import * as Speech from 'expo-speech';
import { Paragraph } from '../services/claude';

interface Props {
  paragraph: Paragraph;
  onBack: () => void;
}

export default function ReadingScreen({ paragraph, onBack }: Props) {
  const [words, setWords] = useState<string[]>([]);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    // Split text into words (handle Hebrew RTL)
    const wordList = paragraph.text
      .split(/\s+/)
      .filter((w) => w.length > 0);
    setWords(wordList);
    return () => {
      Speech.stop();
    };
  }, [paragraph]);

  const speak = useCallback(() => {
    setIsPlaying(true);
    setIsDone(false);
    setCurrentWordIndex(0);

    Speech.speak(paragraph.text, {
      language: 'he-IL',
      rate: 0.85,
      onBoundary: (event) => {
        // Find which word index corresponds to charIndex
        const upToChar = paragraph.text.slice(0, event.charIndex);
        const wordsBefore = upToChar.trim().split(/\s+/).filter((w) => w.length > 0);
        setCurrentWordIndex(wordsBefore.length);
      },
      onDone: () => {
        setIsPlaying(false);
        setIsDone(true);
        setCurrentWordIndex(-1);
      },
      onStopped: () => {
        setIsPlaying(false);
        setCurrentWordIndex(-1);
      },
      onError: () => {
        setIsPlaying(false);
        setCurrentWordIndex(-1);
      },
    });
  }, [paragraph.text]);

  const pause = () => {
    Speech.stop();
    setIsPlaying(false);
  };

  const stop = () => {
    Speech.stop();
    setIsPlaying(false);
    setCurrentWordIndex(-1);
    setIsDone(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { stop(); onBack(); }} style={styles.backButton}>
          <Text style={styles.backText}>← חזרה</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>קטע {paragraph.index + 1}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.textContainer}>
        <View style={styles.wordsContainer}>
          {words.map((word, index) => (
            <Text
              key={`${index}-${word}`}
              style={[
                styles.word,
                index === currentWordIndex && styles.activeWord,
              ]}
            >
              {word}{' '}
            </Text>
          ))}
        </View>
      </ScrollView>

      <View style={styles.controls}>
        {!isPlaying ? (
          <TouchableOpacity style={styles.playButton} onPress={speak}>
            <Text style={styles.playIcon}>{isDone ? '🔄' : '▶'}</Text>
            <Text style={styles.playText}>{isDone ? 'קרא שוב' : 'קרא'}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.playingControls}>
            <TouchableOpacity style={styles.controlButton} onPress={pause}>
              <Text style={styles.controlIcon}>⏸</Text>
              <Text style={styles.controlText}>עצור</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.controlButton, styles.stopButton]} onPress={stop}>
              <Text style={styles.controlIcon}>⏹</Text>
              <Text style={styles.controlText}>בטל</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFEF5',
  },
  header: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 10,
  },
  backButton: {},
  backText: {
    fontSize: 18,
    color: '#4A90E2',
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#2C3E50',
  },
  textContainer: {
    padding: 24,
    flexGrow: 1,
  },
  wordsContainer: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  word: {
    fontSize: 34,
    lineHeight: 54,
    color: '#2C3E50',
    textAlign: 'right',
  },
  activeWord: {
    backgroundColor: '#FFE066',
    borderRadius: 6,
    color: '#1A1A1A',
    fontWeight: 'bold',
  },
  controls: {
    padding: 24,
    paddingBottom: 36,
    alignItems: 'center',
  },
  playButton: {
    backgroundColor: '#4A90E2',
    borderRadius: 50,
    paddingVertical: 22,
    paddingHorizontal: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#4A90E2',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  playIcon: {
    fontSize: 30,
    color: '#FFFFFF',
  },
  playText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  playingControls: {
    flexDirection: 'row',
    gap: 16,
  },
  controlButton: {
    backgroundColor: '#F39C12',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 36,
    alignItems: 'center',
    gap: 6,
  },
  stopButton: {
    backgroundColor: '#E74C3C',
  },
  controlIcon: {
    fontSize: 28,
  },
  controlText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
