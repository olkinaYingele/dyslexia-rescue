import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import HomeScreen from './src/screens/HomeScreen';
import BoardScreen from './src/screens/BoardScreen';
import { Paragraph } from './src/services/claude';

type Screen = 'home' | 'board';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([]);
  const [imageUri, setImageUri] = useState('');

  const handleParagraphsReady = (p: Paragraph[], uri: string) => {
    setParagraphs(p);
    setImageUri(uri);
    setScreen('board');
  };

  return (
    <>
      <StatusBar style="light" />
      {screen === 'home' && (
        <HomeScreen onParagraphsReady={handleParagraphsReady} />
      )}
      {screen === 'board' && (
        <BoardScreen
          imageUri={imageUri}
          paragraphs={paragraphs}
          onBack={() => setScreen('home')}
        />
      )}
    </>
  );
}
