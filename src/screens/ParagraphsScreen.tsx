import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  SafeAreaView,
} from 'react-native';
import { Paragraph } from '../services/claude';

interface Props {
  paragraphs: Paragraph[];
  onSelectParagraph: (paragraph: Paragraph) => void;
  onBack: () => void;
}

export default function ParagraphsScreen({ paragraphs, onSelectParagraph, onBack }: Props) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>← חזרה</Text>
        </TouchableOpacity>
        <Text style={styles.title}>בחר קטע לקריאה</Text>
      </View>

      <FlatList
        data={paragraphs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.paragraphCard}
            onPress={() => onSelectParagraph(item)}
            activeOpacity={0.7}
          >
            <View style={styles.numberBadge}>
              <Text style={styles.numberText}>{item.index + 1}</Text>
            </View>
            <Text style={styles.paragraphText} numberOfLines={3}>
              {item.text}
            </Text>
            <Text style={styles.arrow}>▶</Text>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  header: {
    padding: 20,
    paddingBottom: 10,
  },
  backButton: {
    marginBottom: 12,
  },
  backText: {
    fontSize: 18,
    color: '#4A90E2',
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2C3E50',
    textAlign: 'right',
  },
  list: {
    padding: 16,
    gap: 12,
  },
  paragraphCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  numberBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4A90E2',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  numberText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  paragraphText: {
    flex: 1,
    fontSize: 20,
    color: '#2C3E50',
    textAlign: 'right',
    lineHeight: 30,
  },
  arrow: {
    fontSize: 16,
    color: '#BDC3C7',
  },
});
