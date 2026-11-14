import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  getRecommendations,
  getSession,
  isInStore,
  logout,
  type Group,
  type Product,
} from '../../../services/api';
import { OfflineBanner, PrimaryButton, ProductCard, ScreenTitle } from '../../components/ui';
import { theme } from '../../theme';

const groups: Group[] = ['Produce', 'Proteins', 'Dairy', 'Grains', 'Pantry'];

export default function ListScreen() {
  const router = useRouter();
  const [items, setItems] = useState<Product[] | null>(null);
  const [home, setHome] = useState<Awaited<ReturnType<typeof getSession>> | null>(null);
  const [inStore, setInStore] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setInStore(isInStore());
      Promise.all([getRecommendations(), getSession()]).then(([next, session]) => {
        if (!active) return;
        setItems(next);
        setHome(session);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.hello}>Hi {home?.firstName ?? 'there'}</Text>
        <View style={styles.plan}>
          <Text style={styles.planText}>{home?.planBadge ?? 'Your plan'}</Text>
        </View>
        <Text style={styles.body}>{home?.planLine}</Text>
        <Text style={styles.body}>Household of {home?.householdSize ?? ''}</Text>
        {home && home.allergies.length > 0 ? <Text style={styles.body}>Allergies: {home.allergies.join(', ')}</Text> : null}
        {home && home.preferences.length > 0 ? <Text style={styles.body}>Also: {home.preferences.join(', ')}</Text> : null}

        {inStore ? (
          <View style={styles.pill}>
            <Text style={styles.pillText}>You are checked in at the store</Text>
          </View>
        ) : (
          <PrimaryButton
            label="Check in at store"
            onPress={() => router.push('/check-in')}
          />
        )}
        <Text style={styles.body}>
          Scan the QR on the staff kiosk screen to start shopping. Then use Scan for product barcodes.
        </Text>

        <PrimaryButton label="Dietary safety" tone="quiet" onPress={() => router.push('/(tabs)/safety')} />
        <PrimaryButton
          label="Log out"
          tone="quiet"
          onPress={() => {
            logout();
            router.replace('/');
          }}
        />
        <ScreenTitle>Picked for you</ScreenTitle>
        <OfflineBanner />
        <View style={styles.note}>
          <Text style={styles.noteText}>Picked for you based on what's in stock today.</Text>
        </View>
        {items === null ? <Text style={styles.body}>Gathering today's list…</Text> : null}
        {groups.map((group) => {
          const rows = (items ?? []).filter((item) => item.group === group);
          if (rows.length === 0) return null;
          return (
            <View key={group}>
              <Text style={styles.group}>{group}</Text>
              {rows.map((item) => (
                <ProductCard
                  key={item.sku}
                  product={item}
                  onPress={() => router.push({ pathname: '/scan-result', params: { sku: item.sku } })}
                />
              ))}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 20, paddingBottom: 32 },
  note: { backgroundColor: theme.greenSoft, borderRadius: 12, padding: 12, marginBottom: 16 },
  noteText: { fontSize: theme.body, color: theme.ink, fontWeight: '600' },
  group: { fontSize: 22, fontWeight: '700', color: theme.ink, marginBottom: 8, marginTop: 8 },
  hello: { fontSize: 32, fontWeight: '700', color: theme.ink },
  plan: {
    alignSelf: 'flex-start',
    backgroundColor: theme.greenSoft,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginVertical: 10,
  },
  planText: { fontSize: theme.body, fontWeight: '700', color: theme.green },
  body: { fontSize: theme.body, color: theme.ink, marginBottom: 4 },
  pill: {
    alignSelf: 'flex-start',
    backgroundColor: theme.green,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginVertical: 8,
  },
  pillText: { color: '#fff', fontWeight: '700', fontSize: theme.body },
});
