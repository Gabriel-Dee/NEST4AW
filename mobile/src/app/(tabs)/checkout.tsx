import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { getCart, getSavedRecipes, getSession, type CartSnapshot, type RecipeCard } from '../../../services/api';
import { Banner, Button, Card, EmptyState, ListRow, Screen, Section, ui } from '../../components/ui';
import { theme } from '../../theme';

export default function CheckoutScreen() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState('');
  const [cart, setCart] = useState<CartSnapshot | null>(null);
  const [saved, setSaved] = useState<RecipeCard[]>([]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      Promise.all([getSession(), getCart(), getSavedRecipes().catch(() => [] as RecipeCard[])]).then(([home, c, s]) => {
        if (!alive) return;
        setSessionId(home.id);
        setCart(c);
        setSaved(s);
      });
      return () => {
        alive = false;
      };
    }, []),
  );

  if (!sessionId) {
    return (
      <Screen back title="Check out">
        <Card>
          <EmptyState icon="bag-check-outline" title="You're not checked in" body="Check in at a store to shop and check out." action={{ label: 'Check in at store', onPress: () => router.navigate('/(tabs)/check-in') }} />
        </Card>
      </Screen>
    );
  }

  const items = cart?.lines.reduce((n, l) => n + l.qty, 0) ?? 0;
  const red = cart?.lines.filter((l) => l.product.verdict === 'red').length ?? 0;

  return (
    <Screen back title="Check out" subtitle="Show this screen to the volunteer at the exit.">
      <Card style={styles.qrCard}>
        <QRCode value={sessionId} size={220} backgroundColor={theme.card} color={theme.ink} />
        <Text style={styles.qrHint}>The volunteer scans this to see your cart.</Text>
      </Card>

      {red > 0 ? <Banner tone="error" text={`${red} item${red > 1 ? 's' : ''} in your cart ${red > 1 ? 'are' : 'is'} not right for your plan. The volunteer will help you swap ${red > 1 ? 'them' : 'it'}.`} /> : null}

      <Section title="Your cart">
        <Card style={styles.summary}>
          <View style={styles.stat}>
            <Text style={styles.statNum}>{items}</Text>
            <Text style={ui.rowSub}>Items</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statNum, { color: theme.verdictGreenFg }]}>{cart?.great ?? 0}</Text>
            <Text style={ui.rowSub}>Great choices</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statNum, { color: theme.yellow }]}>{cart?.limit ?? 0}</Text>
            <Text style={ui.rowSub}>To limit</Text>
          </View>
        </Card>
        <Button variant="secondary" icon="cart-outline" label="Review cart" onPress={() => router.navigate('/(tabs)/cart')} />
      </Section>

      {saved.length > 0 ? (
        <Section title="Recipes to take home">
          <Card style={styles.list}>
            {saved.map((r, i) => (
              <View key={r.id}>
                {i > 0 ? <View style={styles.divider} /> : null}
                <ListRow icon="restaurant-outline" title={r.title} subtitle={`${r.minutes} min`} onPress={() => router.navigate({ pathname: '/(tabs)/recipe/[id]', params: { id: r.id } })} />
              </View>
            ))}
          </Card>
        </Section>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  qrCard: { alignItems: 'center', paddingVertical: theme.space.xl },
  qrHint: { fontSize: theme.type.body, color: theme.muted, textAlign: 'center' },
  summary: { flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center', gap: 2 },
  statNum: { fontSize: 28, fontWeight: '800', color: theme.ink },
  list: { paddingVertical: theme.space.xs, gap: 0 },
  divider: { height: 1, backgroundColor: theme.line, marginLeft: 52 },
});
