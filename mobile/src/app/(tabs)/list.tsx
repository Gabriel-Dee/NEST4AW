import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from '../../components/maps';

import {
  getRecommendations,
  getSession,
  getVisitHistory,
  leaveStore,
  listStores,
  refreshCurrentVisit,
  type Product,
  type StoreRow,
  type VisitRow,
} from '../../../services/api';
import { Banner, Button, Card, Chip, ListRow, Loading, ProductCard, Screen, Section, ui } from '../../components/ui';
import { theme } from '../../theme';

// Used when location is off or denied: Epic Cure main warehouse, St. Augustine.
const ST_AUG = { latitude: 29.8947, longitude: -81.3145 };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function distanceText(m?: number) {
  if (m == null) return '';
  const miles = m / 1609.34;
  return miles < 0.1 ? 'Here' : `${miles.toFixed(1)} mi`;
}

function visitDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function HomeScreen() {
  const router = useRouter();
  const [home, setHome] = useState<Awaited<ReturnType<typeof getSession>> | null>(null);
  const [visit, setVisit] = useState<Awaited<ReturnType<typeof refreshCurrentVisit>>>(null);
  const [stores, setStores] = useState<StoreRow[] | null>(null);
  const [history, setHistory] = useState<VisitRow[]>([]);
  const [picks, setPicks] = useState<Product[]>([]);
  const [here, setHere] = useState(ST_AUG);
  const [usingFallback, setUsingFallback] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const load = useCallback(async () => {
    let coords = ST_AUG;
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      const granted = perm.granted || (perm.canAskAgain && (await Location.requestForegroundPermissionsAsync()).granted);
      if (granted) {
        const pos = await Location.getLastKnownPositionAsync();
        if (pos) coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      }
    } catch {
      /* location is optional */
    }
    setUsingFallback(coords === ST_AUG);
    setHere(coords);
    const [session, current] = await Promise.all([getSession(), refreshCurrentVisit()]);
    setHome(session);
    setVisit(current);
    const [nearby, past, recs] = await Promise.all([
      listStores(coords.latitude, coords.longitude).catch(() => [] as StoreRow[]),
      getVisitHistory().catch(() => [] as VisitRow[]),
      current ? getRecommendations().catch(() => [] as Product[]) : Promise.resolve([] as Product[]),
    ]);
    setStores(nearby);
    setHistory(past);
    setPicks(recs.filter((p) => p.verdict === 'green').slice(0, 4));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function onLeave() {
    setLeaving(true);
    try {
      await leaveStore();
    } finally {
      setLeaving(false);
      void load();
    }
  }

  const name = home?.firstName && home.firstName !== 'there' ? home.firstName : '';

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      {/* Greeting + plan */}
      <View style={styles.hero}>
        <View style={ui.fill}>
          <Text style={styles.greet}>{greeting()}</Text>
          <Text style={ui.h1} accessibilityRole="header">
            {name ? `${name}` : 'Welcome'}
          </Text>
        </View>
        <Pressable onPress={() => router.navigate('/(tabs)/profile')} accessibilityRole="button" accessibilityLabel="Open profile" style={styles.avatar}>
          <Text style={styles.avatarText}>{(name || '?').slice(0, 1).toUpperCase()}</Text>
        </Pressable>
      </View>
      <View style={styles.chips}>
        {home?.planBadge ? <Chip icon="medkit-outline" label={home.planBadge} /> : null}
        {home ? <Chip tone="neutral" icon="people-outline" label={`Household of ${home.householdSize}`} /> : null}
      </View>

      {/* Visit status — the one primary action on this screen */}
      {visit ? (
        <Card tone="brand">
          <View style={styles.visitHead}>
            <Ionicons name="storefront" size={26} color={theme.white} />
            <View style={ui.fill}>
              <Text style={styles.visitKicker}>You’re checked in</Text>
              <Text style={styles.visitStore}>{visit.storeName || 'Epic Cure'}</Text>
            </View>
          </View>
          <Button variant="onBrand" icon="scan" label="Scan an item" onPress={() => router.navigate('/(tabs)/scan')} />
          <Pressable onPress={onLeave} disabled={leaving} accessibilityRole="button" style={styles.leave}>
            <Text style={styles.leaveText}>{leaving ? 'Leaving…' : 'Leave store'}</Text>
          </Pressable>
        </Card>
      ) : (
        <Card>
          <View style={styles.visitHead}>
            <View style={styles.visitIcon}>
              <Ionicons name="qr-code-outline" size={24} color={theme.green} />
            </View>
            <View style={ui.fill}>
              <Text style={ui.rowTitle}>Ready to shop?</Text>
              <Text style={ui.rowSub}>At the store, scan the QR code on the kiosk screen to check in.</Text>
            </View>
          </View>
          <Button icon="scan" label="Check in at store" onPress={() => router.navigate('/(tabs)/check-in')} />
        </Card>
      )}

      {/* Picked for you (only while in a store — it is based on that store's stock) */}
      {visit && picks.length > 0 ? (
        <Section title="Picked for you" action={{ label: 'Scan', onPress: () => router.navigate('/(tabs)/scan') }}>
          {picks.map((item) => (
            <ProductCard key={item.sku} product={item} onPress={() => router.navigate({ pathname: '/(tabs)/scan-result', params: { sku: item.sku } })} />
          ))}
        </Section>
      ) : null}

      {/* Nearby stores */}
      <Section title="Stores near you">
        {usingFallback ? <Banner tone="info" icon="location-outline" text="Showing stores near St. Augustine. Turn on location for stores near you." /> : null}
        <View style={styles.mapWrap}>
          <MapView
            style={styles.map}
            initialRegion={{ ...here, latitudeDelta: 0.12, longitudeDelta: 0.12 }}
            region={{ ...here, latitudeDelta: 0.12, longitudeDelta: 0.12 }}
            showsUserLocation={!usingFallback}
            accessibilityLabel="Map of nearby Epic Cure stores"
          >
            {(stores ?? []).map((s) => (
              <Marker
                key={s.id}
                coordinate={{ latitude: s.lat, longitude: s.lng }}
                title={s.name}
                description={s.is_open ? `Open · ${s.on_floor}/${s.max_capacity} shopping` : 'Closed'}
                pinColor={s.is_open ? theme.green : theme.muted}
                onCalloutPress={() => router.navigate({ pathname: '/(tabs)/stores', params: { id: s.id } })}
              />
            ))}
          </MapView>
        </View>
        {stores === null ? <Loading label="Finding stores…" /> : null}
        <Card style={styles.listCard}>
          {(stores ?? []).map((s, i) => (
            <View key={s.id}>
              {i > 0 ? <View style={styles.divider} /> : null}
              <ListRow
                icon="storefront-outline"
                title={s.name}
                subtitle={[distanceText(s.distance_m), s.is_open ? `Open · ${s.on_floor}/${s.max_capacity} shopping` : 'Closed'].filter(Boolean).join(' · ')}
                onPress={() => router.navigate({ pathname: '/(tabs)/stores', params: { id: s.id } })}
              />
            </View>
          ))}
          {stores && stores.length === 0 ? <Text style={ui.rowSub}>No stores found nearby.</Text> : null}
        </Card>
      </Section>

      {/* Visit history — which store, when */}
      <Section title="Your recent visits">
        {history.length === 0 ? (
          <Text style={ui.rowSub}>Your store visits will show up here.</Text>
        ) : (
          <Card style={styles.listCard}>
            {history.slice(0, 4).map((v, i) => (
              <View key={v.id}>
                {i > 0 ? <View style={styles.divider} /> : null}
                <ListRow
                  icon={v.method === 'geofence' ? 'navigate-outline' : v.method === 'kiosk' ? 'qr-code-outline' : 'person-outline'}
                  title={v.storeName}
                  subtitle={`${visitDate(v.startedAt)} · ${['active', 'queue_waiting', 'checking_out'].includes(v.status) ? 'Now' : 'Visited'}`}
                />
              </View>
            ))}
          </Card>
        )}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md, marginTop: theme.space.sm },
  greet: { fontSize: theme.type.body, color: theme.muted, fontWeight: '600' },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: theme.green, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: theme.white, fontSize: 22, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  visitHead: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md },
  visitIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: theme.greenSoft, alignItems: 'center', justifyContent: 'center' },
  visitKicker: { color: theme.white, opacity: 0.85, fontSize: theme.type.label, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  visitStore: { color: theme.white, fontSize: theme.type.h2, fontWeight: '800' },
  leave: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: theme.space.lg },
  leaveText: { color: theme.white, fontSize: theme.type.body, fontWeight: '700', textDecorationLine: 'underline' },
  mapWrap: { borderRadius: theme.radius, overflow: 'hidden', ...theme.shadow },
  map: { height: 220, width: '100%' },
  listCard: { paddingVertical: theme.space.xs, gap: 0 },
  divider: { height: 1, backgroundColor: theme.line, marginLeft: 52 },
});
