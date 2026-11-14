import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { addToCart, getRecommendations, getSession, scanItem, type Product, type Session } from '../../services/api';
import { NutrientBars, PhotoPlaceholder, PrimaryButton, ProductCard, ScreenTitle, StatusBadge } from '../components/ui';
import { theme } from '../theme';

export default function ScanResultScreen() {
  const router = useRouter();
  const { sku } = useLocalSearchParams<{ sku?: string }>();
  const [product, setProduct] = useState<Product | null | undefined>(undefined);
  const [session, setSession] = useState<Session | null>(null);
  const [alternatives, setAlternatives] = useState<Product[]>([]);
  const [showAlts, setShowAlts] = useState(false);
  const [note, setNote] = useState('');

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const code = typeof sku === 'string' ? sku : '';
      Promise.all([scanItem(code), getSession(), getRecommendations()]).then(([found, home, all]) => {
        if (!active) return;
        setProduct(found);
        setSession(home);
        if (found) {
          setAlternatives(all.filter((item) => found.alternativeSkus.includes(item.sku)));
          setShowAlts(found.verdict === 'red');
        }
      });
      return () => {
        active = false;
      };
    }, [sku]),
  );

  async function onAdd() {
    if (!product || product.verdict === 'red') {
      setNote('Not for you today. A better option is below.');
      setShowAlts(true);
      return;
    }
    const result = await addToCart(product.sku);
    setNote(result.added ? 'Added to your cart.' : 'This one stays off the cart.');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenTitle>Scan Result</ScreenTitle>
        {product === undefined ? <Text style={styles.body}>Checking that code…</Text> : null}
        {product === null ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>We don't know that code</Text>
            <Text style={styles.body}>Try the barcode again, or type a code such as BEANS, RICE, or SOUP.</Text>
            <PrimaryButton label="Type item code instead" onPress={() => router.push('/(tabs)/scan')} />
          </View>
        ) : null}
        {product ? (
          <View style={styles.card}>
            <PhotoPlaceholder icon={product.icon} />
            <Text style={styles.cardTitle}>{product.name}</Text>
            <StatusBadge verdict={product.verdict} suggestedQty={product.suggestedQty} />
            <Text style={styles.body}>{product.reason}</Text>
            {session ? <NutrientBars product={product} guides={session.guides} /> : null}
            <PrimaryButton label="Add to Cart" onPress={onAdd} disabled={product.verdict === 'red'} />
            <PrimaryButton label="Show me a better option" tone="quiet" onPress={() => setShowAlts(true)} />
            {note ? <Text style={styles.body}>{note}</Text> : null}
          </View>
        ) : null}
        {showAlts && alternatives.length > 0 ? (
          <View>
            <Text style={styles.group}>A better option</Text>
            {alternatives.map((item) => (
              <ProductCard
                key={item.sku}
                product={item}
                onPress={() => router.replace({ pathname: '/scan-result', params: { sku: item.sku } })}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 20, paddingBottom: 40 },
  card: { backgroundColor: theme.card, borderRadius: theme.radius, padding: 16, gap: 10, ...theme.shadow },
  cardTitle: { fontSize: 26, fontWeight: '700', color: theme.ink },
  body: { fontSize: theme.body, color: theme.ink },
  group: { fontSize: 22, fontWeight: '700', color: theme.ink, marginTop: 16, marginBottom: 8 },
});
