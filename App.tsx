import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import HomeScreen from './src/screens/HomeScreen';
import ParagraphsScreen from './src/screens/ParagraphsScreen';
import ReadingScreen from './src/screens/ReadingScreen';
import { Paragraph } from './src/services/claude';

type Screen = 'home' | 'paragraphs' | 'reading';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([]);
  const [selectedParagraph, setSelectedParagraph] = useState<Paragraph | null>(null);

  const handleParagraphsReady = (p: Paragraph[], uri: string) => {
    setParagraphs(p);
    setScreen('paragraphs');
  };

  const handleSelectParagraph = (p: Paragraph) => {
    setSelectedParagraph(p);
    setScreen('reading');
  };

  return (
    <>
      <StatusBar style="dark" />
      {screen === 'home' && (
        <HomeScreen onParagraphsReady={handleParagraphsReady} />
      )}
      {screen === 'paragraphs' && (
        <ParagraphsScreen
          paragraphs={paragraphs}
          onSelectParagraph={handleSelectParagraph}
          onBack={() => setScreen('home')}
        />
      )}
      {screen === 'reading' && selectedParagraph && (
        <ReadingScreen
          paragraph={selectedParagraph}
          onBack={() => setScreen('paragraphs')}
        />
      )}
    </>
  );
}
