import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getSafetyAdvice, type SafetyNote } from '../../../services/api';
import { ScreenTitle } from '../../components/ui';
import { theme } from '../../theme';

const toneColor = {
  green: theme.green,
  yellow: theme.yellow,
  red: theme.red,
  plain: theme.ink,
} as const;

export default function SafetyScreen() {
  const [planBadge, setPlanBadge] = useState('');
  const [planLine, setPlanLine] = useState('');
  const [notes, setNotes] = useState<SafetyNote[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      getSafetyAdvice().then((next) => {
        if (!alive) return;
        setPlanBadge(next.planBadge);
        setPlanLine(next.planLine);
        setNotes(next.notes);
      });
      return () => {
        alive = false;
      };
    }, []),
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenTitle>Dietary safety</ScreenTitle>
        <Text style={styles.body}>
          Recipes suggest meals. This page tells you what is safe. The same green, yellow, and red words are on every food card.
        </Text>
        <View style={styles.plan}>
          <Text style={styles.planText}>{planBadge || 'Your plan'}</Text>
        </View>
        <Text style={styles.body}>{planLine}</Text>
        {(notes ?? []).map((note) => (
          <View key={note.title} style={styles.card}>
            <Text style={[styles.cardTitle, { color: toneColor[note.tone] }]}>{note.title}</Text>
            <Text style={styles.body}>{note.body}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 20, paddingBottom: 40 },
  body: { fontSize: theme.body, color: theme.ink, marginBottom: 8, lineHeight: 24 },
  plan: {
    alignSelf: 'flex-start',
    backgroundColor: theme.greenSoft,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginVertical: 12,
  },
  planText: { fontSize: theme.body, fontWeight: '700', color: theme.green },
  card: {
    backgroundColor: theme.card,
    borderRadius: theme.radius,
    padding: 14,
    marginTop: 10,
    ...theme.shadow,
  },
  cardTitle: { fontSize: 20, fontWeight: '700', marginBottom: 6 },
});
