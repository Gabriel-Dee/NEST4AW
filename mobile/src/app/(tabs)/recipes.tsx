import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getRecipes, locationLabel, saveRecipe, type RecipeCard } from '../../../services/api';
import { OfflineBanner, PhotoPlaceholder, PrimaryButton, ScreenTitle } from '../../components/ui';
import { theme } from '../../theme';

function Skeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.bone} />
      <View style={styles.boneShort} />
      <View style={styles.boneShort} />
    </View>
  );
}

export default function RecipesScreen() {
  const router = useRouter();
  const [cards, setCards] = useState<RecipeCard[] | null>(null);
  const [toast, setToast] = useState('');
  const [fade] = useState(() => new Animated.Value(0));

  const load = useCallback(() => {
    setCards(null);
    getRecipes().then(setCards);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function onSave(id: string) {
    const result = await saveRecipe(id);
    setToast(result.firstSave ? 'Saved to your profile. That is a healthy pick.' : 'Saved to your profile.');
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 280, useNativeDriver: true }).start();
    load();
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenTitle>Recipe Ideas</ScreenTitle>
        <OfflineBanner />
        <Text style={styles.label}>AI-suggested – reviewed against your health plan</Text>
        {toast ? <Animated.Text style={[styles.toast, { opacity: fade }]}>{toast}</Animated.Text> : null}
        {cards === null ? (
          <>
            <Text style={styles.body}>Thinking of meals from your cart…</Text>
            <Skeleton />
            <Skeleton />
            <Skeleton />
          </>
        ) : (
          cards.map((card) => (
            <View key={card.id} style={styles.card}>
              <PhotoPlaceholder icon={card.icon} />
              <Text style={styles.cardTitle}>{card.title}</Text>
              <Text style={styles.body}>{card.minutes} min</Text>
              <Text style={styles.body}>Uses {card.usesFromCart} items from your cart</Text>
              <Text style={styles.missing}>Missing ingredients</Text>
              {card.missing ? (
                <>
                  <Text style={styles.body}>
                    {card.missing.name}. {locationLabel(card.missing)}
                  </Text>
                  <PrimaryButton
                    label="Find it"
                    tone="quiet"
                    onPress={() =>
                      router.push({ pathname: '/(tabs)/scan', params: { code: card.missing?.sku ?? '' } })
                    }
                  />
                </>
              ) : null}
              <PrimaryButton
                label={card.saved ? 'Saved to my profile' : 'Save to my profile'}
                onPress={() => onSave(card.id)}
              />
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 20, paddingBottom: 40 },
  label: { fontSize: 14, color: theme.muted, marginBottom: 12 },
  body: { fontSize: theme.body, color: theme.ink, marginBottom: 6 },
  card: {
    backgroundColor: theme.card,
    borderRadius: theme.radius,
    padding: 16,
    marginBottom: 14,
    gap: 6,
    ...theme.shadow,
  },
  cardTitle: { fontSize: 22, fontWeight: '700', color: theme.ink },
  missing: { fontSize: theme.body, fontWeight: '700', color: theme.ink, marginTop: 6 },
  toast: { fontSize: theme.body, fontWeight: '700', color: theme.green, marginBottom: 8 },
  bone: { height: 22, width: '70%', borderRadius: 8, backgroundColor: theme.line },
  boneShort: { height: 16, width: '45%', borderRadius: 8, backgroundColor: theme.line, marginTop: 8 },
});
