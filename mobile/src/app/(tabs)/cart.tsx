import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getCart, locationLabel, type CartSnapshot } from '../../../services/api';
import { OfflineBanner, PrimaryButton, StatusBadge } from '../../components/ui';
import { theme } from '../../theme';

export default function CartScreen() {
  const router = useRouter();
  const [cart, setCart] = useState<CartSnapshot | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getCart().then((next) => {
        if (active) setCart(next);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  const lines = cart?.lines ?? [];

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={lines}
        keyExtractor={(line) => line.product.sku}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            <Text style={styles.title}>My Cart</Text>
            <OfflineBanner />
            <Text style={styles.summary}>
              {cart ? `${cart.greensInCart} of ${cart.greenGoal} healthy picks today` : 'Loading your cart…'}
            </Text>
            {cart ? (
              <Text style={styles.body}>
                {cart.great} great choices, {cart.limit} to limit
              </Text>
            ) : null}
            {cart?.listComplete ? (
              <Text style={styles.celebrate}>Nice. You found the healthy picks on today's list.</Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          cart ? (
            <View style={styles.empty}>
              <Text style={styles.cardTitle}>Your cart is empty</Text>
              <Text style={styles.body}>Scan an item when you are ready. Nothing here is a problem.</Text>
              <PrimaryButton label="Scan an item" onPress={() => router.push('/(tabs)/scan')} />
            </View>
          ) : undefined
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.product.name}</Text>
            <StatusBadge verdict={item.product.verdict} suggestedQty={item.product.suggestedQty} />
            <Text style={styles.body}>Qty {item.qty}</Text>
            <Text style={styles.body}>{locationLabel(item.product)}</Text>
          </View>
        )}
        ListFooterComponent={
          lines.length > 0 ? (
            <View>
              <PrimaryButton label="Get Recipe Ideas" onPress={() => router.push('/(tabs)/recipes')} />
              <PrimaryButton label="Head to Checkout" tone="ink" onPress={() => router.push('/checkout')} />
            </View>
          ) : undefined
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: theme.title, fontWeight: '700', color: theme.ink, marginBottom: 8 },
  summary: { fontSize: 20, fontWeight: '700', color: theme.green, marginBottom: 4 },
  body: { fontSize: theme.body, color: theme.ink, marginBottom: 8 },
  celebrate: {
    fontSize: theme.body,
    fontWeight: '700',
    color: theme.green,
    backgroundColor: theme.greenSoft,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  card: {
    backgroundColor: theme.card,
    borderRadius: theme.radius,
    padding: 14,
    marginBottom: 12,
    gap: 6,
    ...theme.shadow,
  },
  cardTitle: { fontSize: 20, fontWeight: '700', color: theme.ink },
  empty: { backgroundColor: theme.card, borderRadius: theme.radius, padding: 16, ...theme.shadow },
});
