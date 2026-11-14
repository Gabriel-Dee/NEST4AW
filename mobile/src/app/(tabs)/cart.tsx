import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getCart, isInStore, removeFromCart, type CartSnapshot } from '../../../services/api';
import { Button, Card, EmptyState, Loading, PhotoPlaceholder, Screen, Section, StatusBadge, ui } from '../../components/ui';
import { theme } from '../../theme';

export default function CartScreen() {
  const router = useRouter();
  const [cart, setCart] = useState<CartSnapshot | null>(null);
  const [inStore, setInStore] = useState(isInStore());
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setInStore(isInStore());
    setCart(await getCart());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function onRemove(productId?: string) {
    if (!productId) return;
    await removeFromCart(productId).catch(() => undefined);
    void load();
  }

  if (!inStore) {
    return (
      <Screen title="Cart">
        <Card>
          <EmptyState
            icon="cart-outline"
            title="Your cart starts at the store"
            body="Check in at a store, then scan items to add them here."
            action={{ label: 'Check in at store', icon: 'qr-code-outline', onPress: () => router.navigate('/(tabs)/check-in') }}
          />
        </Card>
      </Screen>
    );
  }

  if (!cart) {
    return (
      <Screen title="Cart">
        <Loading label="Loading your cart…" />
      </Screen>
    );
  }

  const total = cart.lines.reduce((sum, l) => sum + l.qty, 0);
  const red = cart.lines.filter((l) => l.product.verdict === 'red').length;

  if (cart.lines.length === 0) {
    return (
      <Screen title="Cart">
        <Card>
          <EmptyState
            icon="basket-outline"
            title="Your cart is empty"
            body="Scan an item and tap Add to cart."
            action={{ label: 'Scan an item', icon: 'scan', onPress: () => router.navigate('/(tabs)/scan') }}
          />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title="Cart" subtitle={`${total} ${total === 1 ? 'item' : 'items'}`} refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}>
      {/* Summary */}
      <View style={styles.tiles}>
        <View style={[styles.tile, { backgroundColor: theme.verdictGreen }]}>
          <Ionicons name="checkmark-circle" size={22} color={theme.verdictGreenFg} />
          <Text style={[styles.tileNum, { color: theme.verdictGreenFg }]}>{cart.great}</Text>
          <Text style={[styles.tileLabel, { color: theme.verdictGreenFg }]}>Great choices</Text>
        </View>
        <View style={[styles.tile, { backgroundColor: theme.yellowSoft }]}>
          <Ionicons name="alert-circle" size={22} color={theme.yellow} />
          <Text style={[styles.tileNum, { color: theme.yellow }]}>{cart.limit}</Text>
          <Text style={[styles.tileLabel, { color: theme.yellow }]}>To limit</Text>
        </View>
        {red > 0 ? (
          <View style={[styles.tile, { backgroundColor: theme.redSoft }]}>
            <Ionicons name="close-circle" size={22} color={theme.red} />
            <Text style={[styles.tileNum, { color: theme.red }]}>{red}</Text>
            <Text style={[styles.tileLabel, { color: theme.red }]}>Remove</Text>
          </View>
        ) : null}
      </View>

      {/* Items */}
      <Section title="In your cart">
        <Card style={styles.list}>
          {cart.lines.map((line, i) => (
            <View key={line.product.sku}>
              {i > 0 ? <View style={styles.divider} /> : null}
              <View style={styles.item}>
                <Pressable
                  style={styles.itemMain}
                  onPress={() => router.navigate({ pathname: '/(tabs)/scan-result', params: { sku: line.product.sku } })}
                  accessibilityRole="button"
                  accessibilityLabel={`${line.product.name}, quantity ${line.qty}`}
                >
                  <PhotoPlaceholder icon={line.product.icon} size={48} />
                  <View style={ui.fill}>
                    <Text style={styles.itemName} numberOfLines={2}>
                      {line.product.name}
                    </Text>
                    <View style={styles.itemMeta}>
                      <StatusBadge verdict={line.product.verdict} suggestedQty={line.product.suggestedQty} size="sm" />
                      <Text style={ui.rowSub}>Qty {line.qty}</Text>
                    </View>
                  </View>
                </Pressable>
                <Pressable
                  onPress={() => onRemove(line.product.productId)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${line.product.name}`}
                  hitSlop={8}
                  style={styles.remove}
                >
                  <Ionicons name="trash-outline" size={22} color={theme.muted} />
                </Pressable>
              </View>
            </View>
          ))}
        </Card>
      </Section>

      {/* Next steps */}
      <Button icon="restaurant-outline" label="Recipe ideas from my cart" onPress={() => router.navigate({ pathname: '/(tabs)/recipes', params: { mode: 'cart' } })} />
      <Button variant="secondary" icon="bag-check-outline" label="I'm ready to check out" onPress={() => router.navigate('/(tabs)/checkout')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: theme.space.md },
  tile: { flex: 1, borderRadius: theme.radiusSm, padding: theme.space.md, gap: 2 },
  tileNum: { fontSize: 28, fontWeight: '800' },
  tileLabel: { fontSize: theme.type.label, fontWeight: '700' },
  list: { paddingVertical: theme.space.xs, gap: 0 },
  divider: { height: 1, backgroundColor: theme.line },
  item: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm, paddingVertical: theme.space.md },
  itemMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.space.md },
  itemName: { fontSize: theme.type.body, fontWeight: '700', color: theme.ink },
  itemMeta: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm, marginTop: 6, flexWrap: 'wrap' },
  remove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
