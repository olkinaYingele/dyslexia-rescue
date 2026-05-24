import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

interface Props {
  status: string;
  done?: boolean;
}

const STAGES = [
  { at: 0,  label: 'מכין תמונה...' },
  { at: 25, label: 'מנתח טקסט...' },
  { at: 65, label: 'כמעט מוכן...' },
];

export default function ProgressLoader({ status, done = false }: Props) {
  const progress = useRef(new Animated.Value(0)).current;
  const [pct, setPct] = useState(0);
  const [label, setLabel] = useState(STAGES[0].label);

  useEffect(() => {
    // Animate to 85% over 8 seconds
    const anim = Animated.timing(progress, {
      toValue: 85,
      duration: 8000,
      useNativeDriver: false,
    });
    anim.start();

    const listener = progress.addListener(({ value }) => {
      const v = Math.round(value);
      setPct(v);
      // Pick the most recent stage label
      const stage = [...STAGES].reverse().find(s => v >= s.at);
      if (stage) setLabel(stage.label);
    });

    return () => progress.removeListener(listener);
  }, []);

  useEffect(() => {
    if (done) {
      Animated.timing(progress, {
        toValue: 100,
        duration: 300,
        useNativeDriver: false,
      }).start();
      setLabel('מוכן! ✓');
    }
  }, [done]);

  const barWidth = progress.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>🔍</Text>
      <Text style={styles.label}>{label}</Text>

      <View style={styles.track}>
        <Animated.View style={[styles.bar, { width: barWidth }]} />
      </View>

      <Text style={styles.pct}>{pct}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 12, width: '80%' },
  emoji: { fontSize: 48 },
  label: { fontSize: 20, color: '#4A90E2', fontWeight: '600', textAlign: 'center' },
  track: {
    width: '100%', height: 12, borderRadius: 6,
    backgroundColor: '#E0E7FF', overflow: 'hidden',
  },
  bar: {
    height: '100%', borderRadius: 6,
    backgroundColor: '#4A90E2',
  },
  pct: { fontSize: 16, color: '#7F8C8D', fontWeight: '500' },
});
