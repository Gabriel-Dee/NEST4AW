import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ApiError, getRecipes, getSavedRecipes, isInStore, type RecipeCard } from '../../../services/api';
import { Banner, Card, Chip, EmptyState, Loading, Screen, ui } from '../../components/ui';
import { theme } from '../../theme';

type Tab = 'plan' | 'cart' | 'saved';
const TABS: { key: Tab; label: string }[] = [
  { key: 'plan', label: 'For my plan' },
  { key: 'cart', label: 'From my cart' },
  { key: 'saved', label: 'Saved' },
];

export default function RecipesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const [tab, setTab] = useState<Tab>(params.mode === 'cart' || params.mode === 'saved' ? params.mode : 'plan');
  const [recipes, setRecipes] = useState<RecipeCard[] | null>(null);
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const [inStore, setInStore] = useState(isInStore());

  const load = useCallback(async (which: Tab) => {
    setRecipes(null);
    setError('');
    setInStore(isInStore());
    if (!isInStore()) {
      setRecipes([]);
      return;
    }
    try {
      if (which === 'saved') {
        setRecipes(await getSavedRecipes());
        setSource('');
      } else {
        const res = await getRecipes(which);
        setRecipes(res.recipes);
        setSource(res.source);
      }
    } catch (err) {
      setRecipes([]);
      setError(err instanceof ApiError ? err.message : 'Could not load recipes. Pull down to try again.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      const which: Tab = params.mode === 'cart' || params.mode === 'saved' ? params.mode : tab;
      setTab(which);
      void load(which);
      // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on focus / deep link only
    }, [load, params.mode]),
  );

  function select(next: Tab) {
    setTab(next);
    void load(next);
  }

  return (
    <Screen title="Recipes" subtitle="Meals that fit your health plan, from today's stock." refreshing={false} onRefresh={() => load(tab)}>
      {/* Segmented control */}
      <View style={styles.segment} accessibilityRole="tablist">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Pressable
              key={t.key}
              onPress={() => select(t.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={[styles.segItem, active && styles.segActive]}
            >
              <Text style={[styles.segText, active && styles.segTextActive]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {!inStore ? (
        <Card>
          <EmptyState
            icon="restaurant-outline"
            title="Check in to see recipes"
            body="Recipes are built from what's in stock at the store you're visiting."
            action={{ label: 'Check in at store', icon: 'qr-code-outline', onPress: () => router.navigate('/(tabs)/check-in') }}
          />
        </Card>
      ) : recipes === null ? (
        <Loading label={tab === 'saved' ? 'Loading saved recipes…' : 'Finding meals that fit your plan…'} />
      ) : error ? (
        <Banner tone="error" text={error} action={{ label: 'Retry', onPress: () => load(tab) }} />
      ) : recipes.length === 0 ? (
        <Card>
          <EmptyState
            icon={tab === 'saved' ? 'bookmark-outline' : tab === 'cart' ? 'basket-outline' : 'restaurant-outline'}
            title={tab === 'saved' ? 'No saved recipes yet' : tab === 'cart' ? 'Add items to get ideas' : 'No recipes right now'}
            body={
              tab === 'saved'
                ? 'Tap Save on a recipe and it will be here next visit.'
                : tab === 'cart'
                  ? 'Scan a few items and we will suggest meals you can make with them.'
                  : 'Try again in a moment.'
            }
            action={tab === 'cart' ? { label: 'Scan an item', icon: 'scan', onPress: () => router.navigate('/(tabs)/scan') } : undefined}
          />
        </Card>
      ) : (
        <>
          {source === 'fallback' ? (
            <Banner tone="info" text="Showing recipes from Epic Cure's collection, checked against your plan." />
          ) : source === 'ai' ? (
            <Text style={styles.note}>
              <Ionicons name="sparkles-outline" size={14} color={theme.muted} /> Suggested by our open-source AI and checked against your health plan.
            </Text>
          ) : null}
          {recipes.map((r) => (
            <Card key={r.id} onPress={() => router.navigate({ pathname: '/(tabs)/recipe/[id]', params: { id: r.id } })} accessibilityLabel={`${r.title}, ${r.minutes} minutes`}>
              <View style={styles.cardHead}>
                <View style={styles.recipeIcon}>
                  <Ionicons name="restaurant" size={24} color={theme.green} />
                </View>
                <View style={ui.fill}>
                  <Text style={styles.title}>{r.title}</Text>
                  <Text style={ui.rowSub}>
                    {r.minutes} min · Serves {r.servings}
                    {r.saved ? ' · Saved' : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={theme.muted} />
              </View>
              <View style={styles.chips}>
                {tab === 'cart' && r.usesFromCart > 0 ? <Chip icon="basket-outline" label={`Uses ${r.usesFromCart} from your cart`} /> : null}
                {r.missing.length > 0 ? <Chip tone="neutral" icon="add-circle-outline" label={`${r.missing.length} more to pick up`} /> : null}
              </View>
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', backgroundColor: theme.line, borderRadius: 14, padding: 4, gap: 4 },
  segItem: { flex: 1, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  segActive: { backgroundColor: theme.card, ...theme.shadow },
  segText: { fontSize: theme.type.label, fontWeight: '700', color: theme.muted, textAlign: 'center' },
  segTextActive: { color: theme.green },
  note: { fontSize: theme.type.caption, color: theme.muted },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md },
  recipeIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: theme.greenSoft, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: theme.type.h3, fontWeight: '700', color: theme.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
});
