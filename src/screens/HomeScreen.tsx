import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { extractParagraphs, Paragraph } from '../services/claude';

interface Props {
  onParagraphsReady: (paragraphs: Paragraph[], imageUri: string) => void;
}

export default function HomeScreen({ onParagraphsReady }: Props) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  const processImage = async (uri: string, base64: string) => {
    setLoading(true);
    setStatus('מנתח את התמונה...');
    try {
      const paragraphs = await extractParagraphs(base64);
      if (paragraphs.length === 0) {
        Alert.alert('לא נמצא טקסט', 'לא זוהה טקסט עברי בתמונה. נסה שוב.');
        return;
      }
      onParagraphsReady(paragraphs, uri);
    } catch (e: any) {
      Alert.alert('שגיאה', e.message || 'אירעה שגיאה. נסה שוב.');
    } finally {
      setLoading(false);
      setStatus('');
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('נדרשת הרשאה', 'יש לאפשר גישה למצלמה');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.9,
      base64: true,
    });
    if (!result.canceled) {
      await processImage(result.assets[0].uri, result.assets[0].base64 || '');
    }
  };

  const pickFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('נדרשת הרשאה', 'יש לאפשר גישה לגלריה');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.9,
      base64: true,
    });
    if (!result.canceled) {
      await processImage(result.assets[0].uri, result.assets[0].base64 || '');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>קורא</Text>
      <Text style={styles.subtitle}>צלם את הלוח או הספר</Text>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4A90E2" />
          <Text style={styles.loadingText}>{status}</Text>
        </View>
      ) : (
        <View style={styles.buttons}>
          <TouchableOpacity style={styles.mainButton} onPress={takePhoto}>
            <Text style={styles.buttonIcon}>📷</Text>
            <Text style={styles.buttonText}>צלם תמונה</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={pickFromGallery}>
            <Text style={styles.buttonIcon}>🖼️</Text>
            <Text style={styles.buttonText}>בחר מהגלריה</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 64,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 22,
    color: '#7F8C8D',
    marginBottom: 60,
    textAlign: 'center',
  },
  buttons: {
    width: '80%',
    gap: 20,
  },
  mainButton: {
    backgroundColor: '#4A90E2',
    borderRadius: 20,
    paddingVertical: 30,
    alignItems: 'center',
    shadowColor: '#4A90E2',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 25,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#4A90E2',
  },
  buttonIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  buttonText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#2C3E50',
  },
  loadingContainer: {
    alignItems: 'center',
    gap: 20,
  },
  loadingText: {
    fontSize: 20,
    color: '#4A90E2',
    textAlign: 'center',
  },
});
