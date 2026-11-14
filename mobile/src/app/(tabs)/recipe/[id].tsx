import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ApiError, getCachedRecipe, saveRecipe, type Verdict } from '../../../../services/api';
import { Banner, Button, Card, Chip, EmptyState, Screen, Section, ui } from '../../../components/ui';
import { theme, verdictPalette } from '../../../theme';

function Dot({ verdict }: { verdict: Verdict | null }) {
  if (!verdict) return null;
  const p = verdictPalette[verdict];
  return <Ionicons name={p.icon} size={18} color={p.fg} accessibilityLabel={verdict} />;
}

export default function RecipeDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const recipe = id ? getCachedRecipe(String(id)) : null;
  const [saved, setSaved] = useState(recipe?.saved ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!recipe) {
    return (
      <Screen back title="Recipe">
        <Card>
          <EmptyState icon="restaurant-outline" title="Recipe not available" body="Open it again from the Recipes tab." action={{ label: 'Go to Recipes', onPress: () => router.replace('/(tabs)/recipes') }} />
        </Card>
      </Screen>
    );
  }

  async function onSave() {
    setSaving(true);
    setError('');
    try {
      await saveRecipe(recipe!.id);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  }

  const pantry = recipe.ingredients.filter((i) => !i.location && !i.inCart);
  const fromStore = recipe.ingredients.filter((i) => i.location || i.inCart);

  return (
    <Screen back title={recipe.title} subtitle={recipe.description || undefined}>
      <View style={styles.chips}>
        <Chip icon="time-outline" tone="neutral" label={`${recipe.minutes} min`} />
        <Chip icon="people-outline" tone="neutral" label={`Serves ${recipe.servings}`} />
        {recipe.source === 'ai' ? <Chip icon="sparkles-outline" label="AI suggested" /> : null}
      </View>

      {recipe.why ? (
        <Card tone="green">
          <View style={styles.why}>
            <Ionicons name="heart-outline" size={22} color={theme.green} />
            <Text style={styles.whyText}>{recipe.why}</Text>
          </View>
        </Card>
      ) : null}

      {saved ? (
        <Banner tone="success" text="Saved to your profile." />
      ) : (
        <Button icon="bookmark-outline" label="Save recipe" onPress={onSave} loading={saving} />
      )}
      {error ? <Banner tone="error" text={error} /> : null}

      <Section title="Ingredients">
        <Card style={styles.list}>
          {fromStore.map((ing, i) => (
            <View key={`${ing.name}-${i}`} style={[styles.ing, i > 0 && styles.ingBorder]}>
              <Dot verdict={ing.verdict} />
              <View style={ui.fill}>
                <Text style={styles.ingName}>{ing.name}</Text>
                <Text style={ui.rowSub}>
                  {[ing.amount, ing.inCart ? 'In your cart' : ing.location].filter(Boolean).join(' · ')}
                </Text>
              </View>
              {ing.inCart ? <Ionicons name="checkmark-circle" size={22} color={theme.green} accessibilityLabel="In your cart" /> : null}
            </View>
          ))}
          {pantry.map((ing, i) => (
            <View key={`p-${ing.name}-${i}`} style={[styles.ing, styles.ingBorder]}>
              <Ionicons name="home-outline" size={18} color={theme.muted} />
              <Text style={[styles.ingName, ui.fill]}>{ing.name}</Text>
            </View>
          ))}
        </Card>
      </Section>

      {recipe.missing.length > 0 ? (
        <Section title="Still to pick up">
          <Card style={styles.list}>
            {recipe.missing.map((m, i) => (
              <View key={`${m.name}-${i}`} style={[styles.ing, i > 0 && styles.ingBorder]}>
                <Dot verdict={m.verdict} />
                <View style={ui.fill}>
                  <Text style={styles.ingName}>{m.name}</Text>
                  {m.location ? <Text style={ui.rowSub}>{m.location}</Text> : null}
                </View>
              </View>
            ))}
          </Card>
        </Section>
      ) : null}

      {recipe.steps.length > 0 ? (
        <Section title="Steps">
          {recipe.steps.map((step, i) => (
            <Card key={i} style={styles.step}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>{i + 1}</Text>
              </View>
              <Text style={[styles.stepText, ui.fill]}>{step}</Text>
            </Card>
          ))}
        </Section>
      ) : null}

      <Section title="Per serving">
        <Card style={styles.nutri}>
          {[
            ['Sodium', `${Math.round(recipe.sodiumMg)} mg`],
            ['Sugar', `${recipe.sugarG.toFixed(1)} g`],
            ['Potassium', `${Math.round(recipe.potassiumMg)} mg`],
            ['Carbs', `${recipe.carbsG.toFixed(1)} g`],
          ].map(([label, value]) => (
            <View key={label} style={styles.nutriCell}>
              <Text style={styles.nutriValue}>{value}</Text>
              <Text style={ui.rowSub}>{label}</Text>
            </View>
          ))}
        </Card>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  why: { flexDirection: 'row', gap: theme.space.md, alignItems: 'flex-start' },
  whyText: { flex: 1, fontSize: theme.type.body, color: theme.ink, lineHeight: 24, fontWeight: '600' },
  list: { paddingVertical: theme.space.xs, gap: 0 },
  ing: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md, paddingVertical: theme.space.md },
  ingBorder: { borderTopWidth: 1, borderTopColor: theme.line },
  ingName: { fontSize: theme.type.body, fontWeight: '600', color: theme.ink },
  step: { flexDirection: 'row', gap: theme.space.md, alignItems: 'flex-start' },
  stepNum: { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.green, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: theme.white, fontWeight: '800', fontSize: 16 },
  stepText: { fontSize: theme.type.body, color: theme.ink, lineHeight: 25 },
  nutri: { flexDirection: 'row', flexWrap: 'wrap', gap: 0, padding: theme.space.sm },
  nutriCell: { width: '50%', padding: theme.space.md, gap: 2 },
  nutriValue: { fontSize: theme.type.h3, fontWeight: '800', color: theme.ink },
});
