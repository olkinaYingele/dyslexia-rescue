import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider, MD3LightTheme } from 'react-native-paper';
import { useFonts } from 'expo-font';
import HomeScreen from './src/screens/HomeScreen';
import BoardScreen from './src/screens/BoardScreen';
import { Paragraph } from './src/services/claude';
import { saveToCache, deleteFromCache } from './src/services/cache';

type Screen = 'home' | 'board';

const theme = {
  ...MD3LightTheme,
  fonts: {
    ...MD3LightTheme.fonts,
    regular:      { ...MD3LightTheme.fonts.bodyMedium,  fontFamily: 'Fredoka-Regular' },
    medium:       { ...MD3LightTheme.fonts.bodyMedium,  fontFamily: 'Fredoka-Medium' },
    bold:         { ...MD3LightTheme.fonts.bodyMedium,  fontFamily: 'Fredoka-Bold' },
    heavy:        { ...MD3LightTheme.fonts.bodyMedium,  fontFamily: 'Fredoka-Bold' },
  },
  colors: {
    ...MD3LightTheme.colors,
    primary:              '#2F628C',
    onPrimary:            '#FFFFFF',
    primaryContainer:     '#CEE5FF',
    onPrimaryContainer:   '#0F4A73',
    secondary:            '#51606F',
    onSecondary:          '#FFFFFF',
    secondaryContainer:   '#D5E4F7',
    onSecondaryContainer: '#3A4857',
    background:           '#F7F9FF',
    onBackground:         '#181C20',
    surface:              '#F7F9FF',
    onSurface:            '#181C20',
    surfaceVariant:       '#DEE3EB',
    onSurfaceVariant:     '#42474E',
    outline:              '#72777F',
    error:                '#BA1A1A',
    onError:              '#FFFFFF',
  },
};

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [paragraphs, setParagraphs] = useState<Paragraph[]>([]);
  const [imageUri, setImageUri] = useState('');
  const [language, setLanguage] = useState('he');
  const [timestamp, setTimestamp] = useState<number>(Date.now());
  const [currentCacheId, setCurrentCacheId] = useState<string | null>(null);
  const [unsavedUri, setUnsavedUri] = useState<string | null>(null);

  const [fontsLoaded] = useFonts({
    'Fredoka-Regular':  require('./assets/fonts/Fredoka-Regular.ttf'),
    'Fredoka-Medium':   require('./assets/fonts/Fredoka-Medium.ttf'),
    'Fredoka-SemiBold': require('./assets/fonts/Fredoka-SemiBold.ttf'),
    'Fredoka-Bold':     require('./assets/fonts/Fredoka-Bold.ttf'),
  });

  const handleParagraphsReady = (
    p: Paragraph[], uri: string, lang: string, cacheId?: string, originalUri?: string
  ) => {
    setParagraphs(p);
    setImageUri(uri);
    setLanguage(lang);
    setTimestamp(Date.now());
    setCurrentCacheId(cacheId || null);
    setUnsavedUri(originalUri || null);
    setScreen('board');
  };

  const handleExit = async () => {
    if (unsavedUri) await saveToCache(unsavedUri, paragraphs);
    setUnsavedUri(null);
    setCurrentCacheId(null);
    setScreen('home');
  };

  const handleDelete = async () => {
    if (currentCacheId) await deleteFromCache(currentCacheId);
    setUnsavedUri(null);
    setCurrentCacheId(null);
    setScreen('home');
  };

  if (!fontsLoaded) return null;

  return (
    <PaperProvider theme={theme}>
      <StatusBar style="dark" />
      {screen === 'home' && (
        <HomeScreen onParagraphsReady={handleParagraphsReady} />
      )}
      {screen === 'board' && (
        <BoardScreen
          imageUri={imageUri}
          paragraphs={paragraphs}
          language={language}
          isCached={!!currentCacheId}
          timestamp={timestamp}
          onExit={handleExit}
          onDelete={handleDelete}
        />
      )}
    </PaperProvider>
  );
}
