import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import HomeScreen from './src/screens/HomeScreen';
import BoardScreen from './src/screens/BoardScreen';
import { Paragraph } from './src/services/claude';
import { deleteFromCache } from './src/services/cache';

type Screen = 'home' | 'board';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([]);
  const [imageUri, setImageUri] = useState('');
  const [currentCacheId, setCurrentCacheId] = useState<string | null>(null);

  const handleParagraphsReady = (p: Paragraph[], uri: string, cacheId?: string) => {
    setParagraphs(p);
    setImageUri(uri);
    setCurrentCacheId(cacheId || null);
    setScreen('board');
  };

  const handleDelete = async () => {
    if (currentCacheId) await deleteFromCache(currentCacheId);
    setScreen('home');
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
          onDelete={currentCacheId ? handleDelete : undefined}
        />
      )}
    </>
  );
}
