import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  addProductToCart,
  ApiError,
  getAvailability,
  getCachedRecipe,
  isInStore,
  saveRecipe,
  type Availability,
  type RecipeIngredient,
  type Verdict,
} from '../../../../services/api';
import { Banner, Button, Card, Chip, EmptyState, Loading, Screen, Section, ui } from '../../../components/ui';
import { theme, verdictPalette } from '../../../theme';

function Dot({ verdict }: { verdict: Verdict | null }) {
  if (!verdict) return null;
  const p = verdictPalette[verdict];
  return <Ionicons name={p.icon} size={18} color={p.fg} accessibilityLabel={verdict} />;
}

/** A recipe ingredient you still need: tap to see if it's here (and add it) or which store has it. */
function PickUpRow({ ing, first }: { ing: RecipeIngredient; first: boolean }) {
  const [open, setOpen] = useState(false);
  const [avail, setAvail] = useState<Availability | null>(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [addError, setAddError] = useState('');

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next || avail || !ing.productId) return;
    if (!isInStore()) {
      setError('Check in at a store to see if it is in stock and add it.');
      return;
    }
    setError('');
    try {
      setAvail(await getAvailability(ing.productId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not check stock. Try again.');
    }
  }

  async function onAdd() {
    if (!ing.productId) return;
    setAdding(true);
    const result = await addProductToCart(ing.productId, avail?.verdict);
    setAdding(false);
    setAdded(result.added);
    setAddError(result.added ? '' : result.message || "Couldn't add this item. Please try again.");
  }

  return (
    <View style={[styles.pick, !first && styles.ingBorder]}>
      <Pressable
        onPress={toggle}
        style={styles.ing}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${ing.name}. ${added ? 'In your cart' : 'Find in store'}`}
      >
        <Dot verdict={ing.verdict} />
        <View style={ui.fill}>
          <Text style={styles.ingName}>{ing.name}</Text>
          <Text style={styles.findText}>{added ? 'In your cart' : 'Tap to find it and add to cart'}</Text>
        </View>
        <Ionicons
          name={added ? 'checkmark-circle' : open ? 'chevron-up' : 'chevron-down'}
          size={22}
          color={added ? theme.green : theme.muted}
        />
      </Pressable>
      {open && !added ? (
        <View style={styles.pickBody}>
          {error ? <Text style={ui.rowSub}>{error}</Text> : null}
          {!error && !avail ? <Loading label="Checking stock…" /> : null}
          {avail && avail.verdict === 'red' ? (
            <Banner tone="error" text={`Not on your plan today: ${avail.reasonText}`} />
          ) : null}
          {avail && avail.verdict !== 'red' && avail.hereInStock ? (
            <>
              <Text style={styles.stockHere}>
                In stock here{avail.location ? ` · ${avail.location}` : ''}
              </Text>
              <Button icon="add-circle-outline" label="Add to cart" onPress={onAdd} loading={adding} />
              {addError ? <Banner tone="error" text={addError} /> : null}
            </>
          ) : null}
          {avail && avail.verdict !== 'red' && !avail.hereInStock ? (
            avail.elsewhere.length > 0 ? (
              <>
                <Text style={styles.stockOut}>Not in stock at this store.</Text>
                {avail.elsewhere.map((st) => (
                  <View key={st.storeId} style={styles.otherStore}>
                    <Ionicons name="storefront-outline" size={18} color={theme.green} />
                    <View style={ui.fill}>
                      <Text style={styles.ingName}>Available at {st.name}</Text>
                      {st.address ? <Text style={ui.rowSub}>{st.address}</Text> : null}
                    </View>
                  </View>
                ))}
              </>
            ) : (
              <Text style={styles.stockOut}>Not in stock at any store right now. Ask a volunteer for a swap.</Text>
            )
          ) : null}
        </View>
      ) : null}
    </View>
  );
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
  // Each ingredient is listed once: still-needed store items live under "Still to pick up".
  const toPickUp = recipe.ingredients.filter((i) => !i.inCart && i.productId && i.verdict !== 'red');
  const fromStore = recipe.ingredients.filter((i) => (i.location || i.inCart) && !toPickUp.includes(i));

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

      {fromStore.length + pantry.length > 0 ? (
      <Section title={toPickUp.length > 0 ? 'Already have' : 'Ingredients'}>
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
            <View key={`p-${ing.name}-${i}`} style={[styles.ing, (i > 0 || fromStore.length > 0) && styles.ingBorder]}>
              <Ionicons name="home-outline" size={18} color={theme.muted} />
              <Text style={[styles.ingName, ui.fill]}>{ing.name}</Text>
            </View>
          ))}
        </Card>
      </Section>
      ) : null}

      {toPickUp.length > 0 ? (
        <Section title="Still to pick up">
          <Card style={styles.list}>
            {toPickUp.map((ing, i) => (
              <PickUpRow key={`${ing.productId}-${i}`} ing={ing} first={i === 0} />
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
  pick: { paddingVertical: 0 },
  pickBody: { gap: theme.space.sm, paddingBottom: theme.space.md },
  findText: { fontSize: theme.type.label, color: theme.green, fontWeight: '600' },
  stockHere: { fontSize: theme.type.body, color: theme.green, fontWeight: '700' },
  stockOut: { fontSize: theme.type.body, color: theme.ink, fontWeight: '700' },
  otherStore: { flexDirection: 'row', gap: theme.space.sm, alignItems: 'flex-start' },
  step: { flexDirection: 'row', gap: theme.space.md, alignItems: 'flex-start' },
  stepNum: { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.green, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: theme.white, fontWeight: '800', fontSize: 16 },
  stepText: { fontSize: theme.type.body, color: theme.ink, lineHeight: 25 },
  nutri: { flexDirection: 'row', flexWrap: 'wrap', gap: 0, padding: theme.space.sm },
  nutriCell: { width: '50%', padding: theme.space.md, gap: 2 },
  nutriValue: { fontSize: theme.type.h3, fontWeight: '800', color: theme.ink },
});
