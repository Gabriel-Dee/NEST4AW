import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { addToCart, locationLabel, scanItem, type Product } from '../../../services/api';
import { Banner, Button, Card, EmptyState, Loading, NutrientBars, PhotoPlaceholder, Screen, Section, StatusBadge, ui } from '../../components/ui';
import { theme, verdictPalette } from '../../theme';

export default function ScanResultScreen() {
  const router = useRouter();
  const { sku } = useLocalSearchParams<{ sku?: string }>();
  const key = sku ? String(sku) : '';
  const [result, setResult] = useState<{ sku: string; product: Product | null } | null>(null);
  const [view, setView] = useState<{ sku: string; showWhy: boolean; added: 'no' | 'yes' | 'failed' }>({ sku: '', showWhy: false, added: 'no' });
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  // Everything is keyed by sku, so scanning a new item starts fresh without resetting state in an effect.
  const product: Product | null | undefined = !key ? null : result?.sku === key ? result.product : undefined;
  const current = view.sku === key ? view : { sku: key, showWhy: false, added: 'no' as const };
  const showWhy = current.showWhy;
  const added = current.added;
  const setShowWhy = (fn: (v: boolean) => boolean) => setView({ ...current, showWhy: fn(current.showWhy) });
  const setAdded = (value: 'no' | 'yes' | 'failed') => setView({ ...current, added: value });

  // Tab screens stay mounted, so re-check the item every time this screen comes into focus
  // (the same barcode scanned twice must hit the server again, not reuse the last answer).
  useFocusEffect(
    useCallback(() => {
      if (!key) return;
      let alive = true;
      setResult(null);
      setView({ sku: key, showWhy: false, added: 'no' });
      scanItem(key).then((p) => alive && setResult({ sku: key, product: p }));
      return () => {
        alive = false;
      };
    }, [key]),
  );

  async function onAdd() {
    if (!product) return;
    setAdding(true);
    const result = await addToCart(product.sku);
    setAdding(false);
    setAddError(result.message ?? '');
    setAdded(result.added ? 'yes' : 'failed');
  }

  if (product === undefined) {
    return (
      <Screen back title="Checking item">
        <Loading label="Checking this item against your plan…" />
      </Screen>
    );
  }

  if (product === null) {
    return (
      <Screen back title="Item not found">
        <Card>
          <EmptyState
            icon="help-circle-outline"
            title="We couldn't find this item"
            body={`No product matches "${sku ?? ''}". Check the numbers, or ask a volunteer to look it up.`}
            action={{ label: 'Scan again', icon: 'scan', onPress: () => router.replace('/(tabs)/scan') }}
          />
        </Card>
      </Screen>
    );
  }

  const tone = verdictPalette[product.verdict];
  return (
    <Screen back title="Scan result">
      {/* Verdict hero */}
      <Card style={[styles.hero, { borderColor: tone.bg }]}>
        <View style={styles.heroTop}>
          <PhotoPlaceholder icon={product.icon} size={64} />
          <View style={ui.fill}>
            <Text style={styles.name}>{product.name}</Text>
            {product.aisle ? (
              <View style={styles.inline}>
                <Ionicons name="location-outline" size={16} color={theme.muted} />
                <Text style={ui.rowSub}>{locationLabel(product)}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <StatusBadge verdict={product.verdict} suggestedQty={product.suggestedQty} size="lg" />
        <Text style={[styles.reason, { color: tone.fg }]}>{product.reasonText}</Text>
        {product.reasonDetail ? (
          <Pressable onPress={() => setShowWhy((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: showWhy }} style={styles.whyBtn}>
            <Text style={ui.sectionAction}>{showWhy ? 'Hide details' : 'Why?'}</Text>
            <Ionicons name={showWhy ? 'chevron-up' : 'chevron-down'} size={18} color={theme.green} />
          </Pressable>
        ) : null}
        {showWhy ? <Text style={styles.why}>{product.reasonDetail}</Text> : null}
      </Card>

      {/* Action */}
      {added === 'yes' ? (
        <>
          <Banner tone="success" text="Added to your cart." />
          <View style={styles.actions}>
            <Button icon="scan" label="Scan next item" onPress={() => router.replace('/(tabs)/scan')} style={ui.fill} />
            <Button variant="secondary" icon="cart-outline" label="View cart" onPress={() => router.navigate('/(tabs)/cart')} style={ui.fill} />
          </View>
        </>
      ) : product.verdict === 'red' ? (
        <>
          <Banner tone="error" text="This one isn't right for your plan today. Please leave it on the shelf." />
          <Button icon="scan" label="Scan another item" onPress={() => router.replace('/(tabs)/scan')} />
          <Button variant="secondary" icon="sparkles-outline" label="See items picked for you" onPress={() => router.navigate('/(tabs)/list')} />
        </>
      ) : (
        <>
          {product.verdict === 'yellow' ? (
            <Banner tone="warn" text={`OK in a small amount. Take up to ${product.suggestedQty || 1}.`} />
          ) : null}
          {added === 'failed' ? <Banner tone="error" text={addError || "Couldn't add this item. Please try again."} /> : null}
          <Button icon="add-circle-outline" label="Add to cart" onPress={onAdd} loading={adding} />
          <Button variant="secondary" icon="scan" label="Scan another item" onPress={() => router.replace('/(tabs)/scan')} />
        </>
      )}

      {/* Nutrition */}
      <Section title="Nutrition per serving">
        <Card>
          <NutrientBars product={product} />
        </Card>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderWidth: 2 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md },
  name: { fontSize: theme.type.h2, fontWeight: '800', color: theme.ink },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  reason: { fontSize: theme.type.h3, fontWeight: '700' },
  whyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minHeight: 44 },
  why: { fontSize: theme.type.label, color: theme.muted, lineHeight: 22 },
  actions: { flexDirection: 'row', gap: theme.space.md },
});
