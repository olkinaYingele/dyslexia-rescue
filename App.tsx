import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider, MD3LightTheme } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import AsyncStorage from '@react-native-async-storage/async-storage';
import HomeScreen from './src/screens/HomeScreen';
import BoardScreen from './src/screens/BoardScreen';
import { Paragraph, ImageCategory } from './src/services/claude';
import { deleteFromCache } from './src/services/cache';
import { ParagraphAudio } from './src/services/tts';
import { UiLang } from './src/i18n';

const CATEGORY_KEY = 'scan_category_v1';

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
  const [isFromArchive, setIsFromArchive] = useState(false);
  const [audio, setAudio] = useState<(ParagraphAudio | undefined)[] | undefined>(undefined);
  const [uiLang, setUiLang] = useState<UiLang>('en');
  const [category, setCategory] = useState<ImageCategory>('auto');
  const [boardCategory, setBoardCategory] = useState<ImageCategory>('auto');

  useEffect(() => {
    AsyncStorage.getItem(CATEGORY_KEY).then(v => { if (v) setCategory(v as ImageCategory); });
  }, []);

  const [fontsLoaded] = useFonts({
    'Fredoka-Regular':  require('./assets/fonts/Fredoka-Regular.ttf'),
    'Fredoka-Medium':   require('./assets/fonts/Fredoka-Medium.ttf'),
    'Fredoka-SemiBold': require('./assets/fonts/Fredoka-SemiBold.ttf'),
    'Fredoka-Bold':     require('./assets/fonts/Fredoka-Bold.ttf'),
  });

  const handleParagraphsReady = (
    p: Paragraph[], uri: string, lang: string, cacheId?: string, fromArchive: boolean = false,
    audioData?: (ParagraphAudio | undefined)[]
  ) => {
    setParagraphs(p);
    setImageUri(uri);
    setLanguage(lang);
    setTimestamp(cacheId ? parseInt(cacheId) : Date.now());
    setCurrentCacheId(cacheId || null);
    setIsFromArchive(fromArchive);
    setBoardCategory(fromArchive ? 'auto' : category);
    setAudio(audioData);
    setScreen('board');
  };

  const handleAudioReady = (audioData: (ParagraphAudio | undefined)[]) => {
    setAudio(audioData);
  };

  const handleExit = () => {
    setCurrentCacheId(null);
    setScreen('home');
  };

  const handleDelete = async () => {
    if (currentCacheId) await deleteFromCache(currentCacheId);
    setCurrentCacheId(null);
    setScreen('home');
  };

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <StatusBar style="dark" />
        {screen === 'home' && (
          <HomeScreen onParagraphsReady={handleParagraphsReady} onAudioReady={handleAudioReady} uiLang={uiLang} setUiLang={setUiLang} category={category} setCategory={setCategory} />
        )}
        {screen === 'board' && (
          <BoardScreen
            imageUri={imageUri}
            paragraphs={paragraphs}
            language={language}
            isCached={isFromArchive}
            timestamp={timestamp}
            category={boardCategory}
            onExit={handleExit}
            onDelete={handleDelete}
            uiLang={uiLang}
            audio={audio}
          />
        )}
      </PaperProvider>
    </SafeAreaProvider>
  );
}
