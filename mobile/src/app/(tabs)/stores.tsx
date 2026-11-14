import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet, Switch, Text, View } from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';
import QRCode from 'react-native-qrcode-svg';

import { ApiError, geofenceCheckIn, getCheckinQr, getStore, type StoreRow } from '../../../services/api';
import { Banner, Button, Card, Chip, EmptyState, Loading, Screen, Section, ui } from '../../components/ui';
import { theme } from '../../theme';

export default function StoreScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [loaded, setLoaded] = useState<{ id: string; store: StoreRow | null } | null>(null);
  const store: StoreRow | null | undefined = !id ? null : loaded?.id === String(id) ? loaded.store : undefined;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pretend, setPretend] = useState(false);
  const [qr, setQr] = useState('');
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    if (!id) return;
    const key = String(id);
    getStore(key)
      .then((s) => setLoaded({ id: key, store: s }))
      .catch(() => setLoaded({ id: key, store: null }));
  }, [id]);

  useEffect(() => {
    if (!showQr) return;
    let alive = true;
    const tick = () =>
      getCheckinQr()
        .then((row) => alive && setQr(row.token))
        .catch(() => alive && setQr(''));
    tick();
    const t = setInterval(tick, 45_000); // token lives ~60s
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [showQr]);

  async function onCheckInHere() {
    if (!store) return;
    setBusy(true);
    setError('');
    try {
      let lat = store.lat;
      let lng = store.lng;
      let accuracy = 5;
      if (!pretend) {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (!perm.granted) throw new ApiError(403, 'location_denied', 'Location is off. Scan the kiosk QR instead.');
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
        accuracy = pos.coords.accuracy ?? 50;
      }
      await geofenceCheckIn(store.id, lat, lng, accuracy);
      router.replace('/(tabs)/list');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Check-in failed. Try the kiosk QR.';
      setError(msg.includes('outside') ? "You don't seem to be at this store yet. Check in when you arrive, or scan the kiosk QR." : msg);
    } finally {
      setBusy(false);
    }
  }

  function openDirections() {
    if (!store) return;
    const q = encodeURIComponent(`${store.name} ${store.address}`);
    const url = Platform.OS === 'ios' ? `http://maps.apple.com/?daddr=${q}` : `https://www.google.com/maps/dir/?api=1&destination=${q}`;
    void Linking.openURL(url);
  }

  if (store === undefined) {
    return (
      <Screen back title="Store">
        <Loading label="Loading store…" />
      </Screen>
    );
  }

  if (store === null) {
    return (
      <Screen back title="Store">
        <Card>
          <EmptyState icon="storefront-outline" title="Store not found" action={{ label: 'Back to Home', onPress: () => router.replace('/(tabs)/list') }} />
        </Card>
      </Screen>
    );
  }

  const region = { latitude: store.lat, longitude: store.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 };
  return (
    <Screen back title={store.name} subtitle={store.address}>
      <View style={styles.chips}>
        <Chip icon={store.is_open ? 'time-outline' : 'moon-outline'} tone={store.is_open ? 'green' : 'neutral'} label={store.is_open ? 'Open now' : 'Closed'} />
        <Chip icon="people-outline" tone="neutral" label={`${store.on_floor}/${store.max_capacity} shopping`} />
        {store.waiting > 0 ? <Chip icon="hourglass-outline" tone="warn" label={`${store.waiting} waiting`} /> : null}
      </View>

      <View style={styles.mapWrap}>
        <MapView style={styles.map} initialRegion={region} region={region} accessibilityLabel={`Map showing ${store.name}`}>
          <Marker coordinate={{ latitude: store.lat, longitude: store.lng }} title={store.name} pinColor={theme.green} />
          {store.geofence_radius_m ? (
            <Circle center={{ latitude: store.lat, longitude: store.lng }} radius={store.geofence_radius_m} strokeColor={theme.green} fillColor="rgba(21,111,65,0.12)" />
          ) : null}
        </MapView>
      </View>
      <Button variant="secondary" icon="navigate-outline" label="Get directions" onPress={openDirections} />

      <Section title="Check in">
        <Card>
          <Text style={ui.rowTitle}>Easiest: scan the kiosk QR</Text>
          <Text style={ui.rowSub}>When you arrive, scan the QR code on the screen by the entrance.</Text>
          <Button icon="qr-code-outline" label="Scan kiosk QR" onPress={() => router.navigate('/(tabs)/check-in')} />
        </Card>
        <Card>
          <Text style={ui.rowTitle}>Or check in by location</Text>
          <Text style={ui.rowSub}>Works when you’re inside the store (the green circle on the map).</Text>
          {error ? <Banner tone="warn" text={error} /> : null}
          <Button variant="secondary" icon="location-outline" label="I’m here — check me in" onPress={onCheckInHere} loading={busy} disabled={!store.is_open} />
          {__DEV__ ? (
            <View style={styles.devRow}>
              <Text style={[ui.rowSub, ui.fill]}>Demo: pretend I’m at this store</Text>
              <Switch value={pretend} onValueChange={setPretend} accessibilityLabel="Pretend I am at this store" />
            </View>
          ) : null}
        </Card>
        <Card>
          <Text style={ui.rowTitle}>Or let staff scan your code</Text>
          {showQr ? (
            <View style={styles.qr}>
              {qr ? <QRCode value={qr} size={200} backgroundColor="#fff" color={theme.ink} /> : <Loading label="Loading your code…" />}
              <Text style={ui.rowSub}>Refreshes automatically.</Text>
            </View>
          ) : (
            <Button variant="secondary" icon="person-circle-outline" label="Show my check-in code" onPress={() => setShowQr(true)} />
          )}
        </Card>
      </Section>
      {!store.is_open ? (
        <View style={styles.closed}>
          <Ionicons name="moon-outline" size={18} color={theme.muted} />
          <Text style={ui.rowSub}>This store is closed right now.</Text>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  mapWrap: { borderRadius: theme.radius, overflow: 'hidden', ...theme.shadow },
  map: { height: 200, width: '100%' },
  devRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md },
  qr: { alignItems: 'center', gap: theme.space.sm, paddingVertical: theme.space.sm },
  closed: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm, justifyContent: 'center' },
});
