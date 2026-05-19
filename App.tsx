import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import HomeScreen from './src/screens/HomeScreen';
import BoardScreen from './src/screens/BoardScreen';
import { Paragraph } from './src/services/claude';
import { saveToCache, deleteFromCache } from './src/services/cache';

type Screen = 'home' | 'board';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([]);
  const [imageUri, setImageUri] = useState('');
  const [currentCacheId, setCurrentCacheId] = useState<string | null>(null);
  const [unsavedUri, setUnsavedUri] = useState<string | null>(null); // new scan not yet saved

  const handleParagraphsReady = (
    p: Paragraph[], uri: string, cacheId?: string, originalUri?: string
  ) => {
    setParagraphs(p);
    setImageUri(uri);
    setCurrentCacheId(cacheId || null);
    setUnsavedUri(originalUri || null);
    setScreen('board');
  };

  const handleSaveAndExit = async () => {
    if (unsavedUri) {
      await saveToCache(unsavedUri, paragraphs);
    }
    setUnsavedUri(null);
    setScreen('home');
  };

  const handleExitWithoutSaving = () => {
    setUnsavedUri(null);
    setScreen('home');
  };

  const handleDelete = async () => {
    if (currentCacheId) await deleteFromCache(currentCacheId);
    setCurrentCacheId(null);
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
          isUnsaved={!!unsavedUri}
          onSaveAndExit={handleSaveAndExit}
          onExitWithoutSaving={handleExitWithoutSaving}
          onDelete={currentCacheId ? handleDelete : undefined}
        />
      )}
    </>
  );
}
