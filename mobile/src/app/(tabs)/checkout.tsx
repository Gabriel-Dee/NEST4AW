import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import {
  ApiError,
  getCart,
  getCheckoutCode,
  getSavedRecipes,
  getSession,
  type CartSnapshot,
  type RecipeCard,
} from '../../../services/api';
import { Banner, Button, Card, EmptyState, ListRow, Screen, Section, ui } from '../../components/ui';
import { theme } from '../../theme';

export default function CheckoutScreen() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState('');
  const [firstName, setFirstName] = useState('');
  const [cart, setCart] = useState<CartSnapshot | null>(null);
  const [saved, setSaved] = useState<RecipeCard[]>([]);
  const [code, setCode] = useState<{ code: string; qr: string; expiresAt: string } | null>(null);
  const [codeError, setCodeError] = useState('');
  const [done, setDone] = useState(false);

  const loadCode = useCallback(async () => {
    try {
      setCode(await getCheckoutCode());
      setCodeError('');
      setCart(await getCart());
    } catch (err) {
      // Once the volunteer completes checkout the visit closes, so the code is no longer issued.
      if (err instanceof ApiError && err.code === 'SESSION_INVALID') {
        setDone(true);
        return;
      }
      setCodeError(err instanceof ApiError ? err.message : 'Could not get a checkout code. Try again.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      Promise.all([getSession(), getCart(), getSavedRecipes().catch(() => [] as RecipeCard[])]).then(([home, c, s]) => {
        if (!alive) return;
        setSessionId(home.id);
        setFirstName(home.firstName === 'there' ? '' : home.firstName);
        setCart(c);
        setSaved(s);
        if (home.id) void loadCode();
      });
      // The server keeps the same code until it expires, so polling just picks up a fresh one.
      const timer = setInterval(() => void loadCode(), 60_000);
      return () => {
        alive = false;
        clearInterval(timer);
      };
    }, [loadCode]),
  );

  if (done) {
    return (
      <Screen back title="Check out">
        <Card>
          <EmptyState
            icon="checkmark-circle-outline"
            title={firstName ? `You're all checked out, ${firstName}!` : "You're all checked out!"}
            body={
              'Thank you for shopping with Epic Cure today. We hope you enjoy your meals.\n\n' +
              "Welcome back again anytime. We're always happy to see you!"
            }
            action={{ label: 'Back to home', onPress: () => router.navigate('/') }}
          />
        </Card>
      </Screen>
    );
  }

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
        {code ? (
          <>
            <QRCode value={code.qr} size={220} backgroundColor={theme.card} color={theme.ink} />
            <Text style={styles.qrHint}>The volunteer scans this, or types your checkout code:</Text>
            <Text style={styles.code} accessibilityLabel={`Checkout code ${code.code.split('').join(' ')}`}>
              {code.code}
            </Text>
            <Text style={ui.rowSub}>
              Good until {new Date(code.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </Text>
          </>
        ) : codeError ? (
          <>
            <Banner tone="error" text={codeError} />
            <Button icon="refresh-outline" label="Try again" variant="secondary" onPress={() => void loadCode()} />
          </>
        ) : (
          <Text style={styles.qrHint}>Getting your checkout code…</Text>
        )}
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
  code: { fontSize: 48, fontWeight: '800', letterSpacing: 12, color: theme.ink, fontVariant: ['tabular-nums'] },
  summary: { flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center', gap: 2 },
  statNum: { fontSize: 28, fontWeight: '800', color: theme.ink },
  list: { paddingVertical: theme.space.xs, gap: 0 },
  divider: { height: 1, backgroundColor: theme.line, marginLeft: 52 },
});
