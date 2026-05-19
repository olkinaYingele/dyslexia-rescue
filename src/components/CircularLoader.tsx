import React, { useEffect, useRef } from 'react';
import { Animated, View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

interface Props {
  size?: number;
  status?: string;
}

export default function CircularLoader({ size = 80, status = '' }: Props) {
  const rotation = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0.1)).current;

  useEffect(() => {
    // Spinning animation
    Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      })
    ).start();

    // Fake progress: grows from 10% to 85% over ~20 seconds
    Animated.timing(progress, {
      toValue: 0.85,
      duration: 20000,
      useNativeDriver: false,
    }).start();
  }, []);

  const spin = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const radius = (size - 10) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <View style={styles.container}>
      <Animated.View style={{ transform: [{ rotate: spin }] }}>
        <Svg width={size} height={size}>
          {/* Background circle */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#E0E7FF"
            strokeWidth={6}
            fill="none"
          />
          {/* Progress arc */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#4A90E2"
            strokeWidth={6}
            fill="none"
            strokeDasharray={`${circumference * 0.7} ${circumference * 0.3}`}
            strokeLinecap="round"
          />
        </Svg>
      </Animated.View>
      {status ? <Text style={styles.status}>{status}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 16 },
  status: { fontSize: 18, color: '#4A90E2', textAlign: 'center' },
});
