import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';

interface Props {
  status: string;
  done?: boolean;
  onCancel?: () => void;
}

const STAGES = [
  { at: 0,  label: 'מכין תמונה...' },
  { at: 25, label: 'מנתח טקסט...' },
  { at: 65, label: 'כמעט מוכן...' },
];

export default function ProgressLoader({ status, done = false, onCancel }: Props) {
  const progress = useRef(new Animated.Value(0)).current;
  const labelAnim = useRef(new Animated.Value(1)).current;
  const labelRef = useRef(STAGES[0].label);
  const [label, setLabel] = React.useState(STAGES[0].label);

  useEffect(() => {
    const anim = Animated.timing(progress, {
      toValue: 85,
      duration: 8000,
      useNativeDriver: false,
    });
    anim.start();

    const listener = progress.addListener(({ value }) => {
      const v = Math.round(value);
      const stage = [...STAGES].reverse().find(s => v >= s.at);
      if (stage && stage.label !== labelRef.current) {
        labelRef.current = stage.label;
        setLabel(stage.label);
      }
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

      {!done && onCancel && (
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.7}>
          <Text style={styles.cancelText}>ביטול</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 16, width: '80%' },
  emoji: { fontSize: 48 },
  label: {
    fontSize: 20,
    color: '#2F628C',
    fontFamily: 'Fredoka-Medium',
    textAlign: 'center',
  },
  track: {
    width: '100%', height: 12, borderRadius: 6,
    backgroundColor: '#DEE3EB', overflow: 'hidden',
  },
  bar: {
    height: '100%', borderRadius: 6,
    backgroundColor: '#2F628C',
  },
  cancelBtn: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#2F628C',
  },
  cancelText: {
    fontSize: 16,
    fontFamily: 'Fredoka-Medium',
    color: '#2F628C',
  },
});
