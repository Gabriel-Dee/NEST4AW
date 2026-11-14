import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';

import { getCart, getSavedRecipes, getSession, type Recipe } from '../../services/api';
import { theme } from '../theme';

export default function CheckoutScreen() {
  const [sessionId, setSessionId] = useState('session-maria');
  const [summary, setSummary] = useState('');
  const [saved, setSaved] = useState<Recipe[]>([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([getSession(), getCart(), getSavedRecipes()]).then(([home, cart, recipes]) => {
        if (!active) return;
        setSessionId(home.id);
        setSummary(`${cart.great} great choices, ${cart.limit} to limit`);
        setSaved(recipes);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Show this screen to the volunteer</Text>
        <Text style={styles.body}>{summary}</Text>
        <View style={styles.qr}>
          <QRCode value={sessionId} size={180} backgroundColor={theme.card} color={theme.ink} />
        </View>
        <Text style={styles.body}>The volunteer finishes checkout. This phone does not take the food off the shelf.</Text>
        <Text style={styles.group}>Saved recipes</Text>
        {saved.length === 0 ? <Text style={styles.body}>None saved yet.</Text> : null}
        {saved.map((recipe) => (
          <Text key={recipe.id} style={styles.recipe}>
            {recipe.title}
          </Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 32, fontWeight: '700', color: theme.ink, marginBottom: 8 },
  body: { fontSize: theme.body, color: theme.ink, marginBottom: 10 },
  qr: {
    alignSelf: 'center',
    backgroundColor: theme.card,
    padding: 16,
    borderRadius: 16,
    marginVertical: 12,
  },
  group: { fontSize: 22, fontWeight: '700', color: theme.ink, marginTop: 8, marginBottom: 6 },
  recipe: { fontSize: theme.body, color: theme.ink, marginBottom: 6 },
});
