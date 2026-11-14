import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';

import {
  ApiError,
  geofenceCheckIn,
  getCheckinQr,
  leaveStore,
  listStores,
  type StoreRow,
} from '../../services/api';
import { PrimaryButton } from '../components/ui';
import { theme } from '../theme';

const ST_AUG = { lat: 29.8947, lng: -81.3145 };

/**
 * Phone check-in:
 * 1) Geofence button when at the store (GPS).
 * 2) Live QR from GET /auth/me/checkin-qr — kiosk scans this (not the old card token).
 */
export default function StoresScreen() {
  const router = useRouter();
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pretend, setPretend] = useState(__DEV__);
  const [qr, setQr] = useState('');
  const [expiresIn, setExpiresIn] = useState(60);
  const [message, setMessage] = useState('');

  useEffect(() => {
    listStores(ST_AUG.lat, ST_AUG.lng)
      .then(setStores)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load stores'));
  }, []);

  useEffect(() => {
    let alive = true;
    async function tick() {
      try {
        const row = await getCheckinQr();
        if (!alive) return;
        setQr(row.token);
        setExpiresIn(row.expires_in || 60);
      } catch {
        if (alive) setQr('');
      }
    }
    tick();
    // QR expires in ~60s — refresh before that
    const id = setInterval(tick, 45_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  async function onCheckIn(store: StoreRow) {
    setBusy(true);
    setMessage('');
    try {
      const lat = pretend ? store.lat : ST_AUG.lat;
      const lng = pretend ? store.lng : ST_AUG.lng;
      const row = await geofenceCheckIn(store.id, lat, lng, 5);
      setMessage(`Checked in: ${String(row.status)}`);
      router.replace('/(tabs)/list');
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Check-in failed');
    } finally {
      setBusy(false);
    }
  }

  async function onLeave() {
    try {
      await leaveStore();
      setMessage('Left the store');
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Could not leave');
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Check in</Text>
        <Text style={styles.body}>
          Show the QR below to the store kiosk, or use geofence when you are at the warehouse.
        </Text>

        <View style={styles.qrCard}>
          <Text style={styles.kicker}>Kiosk QR</Text>
          <Text style={styles.body}>Auto-refreshes ~every 45s (token lasts ~{expiresIn}s)</Text>
          <View style={styles.qrWrap}>
            {qr ? (
              <QRCode value={qr} size={220} backgroundColor="#fff" color={theme.ink} />
            ) : (
              <Text style={styles.body}>Sign in to load your check-in QR</Text>
            )}
          </View>
          {qr ? (
            <Text style={styles.mono} selectable numberOfLines={2}>
              {qr.slice(0, 48)}…
            </Text>
          ) : null}
        </View>

        {__DEV__ ? (
          <View style={styles.row}>
            <Text style={styles.body}>DEV: pretend I am at the store</Text>
            <Switch value={pretend} onValueChange={setPretend} />
          </View>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {message ? <Text style={styles.note}>{message}</Text> : null}

        <Text style={styles.kicker}>Or check in by location</Text>
        {stores.map((store) => (
          <View key={store.id} style={styles.card}>
            <Text style={styles.cardTitle}>{store.name}</Text>
            <Text style={styles.body}>{store.address}</Text>
            <Text style={styles.body}>
              {store.is_open ? 'Open' : 'Closed'} · floor {store.on_floor}/{store.max_capacity} · waiting{' '}
              {store.waiting}
            </Text>
            <PrimaryButton
              label={busy ? 'Checking in…' : 'Geofence check-in'}
              onPress={() => onCheckIn(store)}
              disabled={busy}
            />
          </View>
        ))}
        <PrimaryButton label="Leave store" tone="quiet" onPress={onLeave} />
        {__DEV__ ? (
          <PrimaryButton label="Scan test log" tone="quiet" onPress={() => router.push('/scan-test-log')} />
        ) : null}
        <Pressable onPress={() => router.back()}>
          <Text style={styles.link}>Back</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 20, gap: 12, paddingBottom: 40 },
  title: { fontSize: 32, fontWeight: '700', color: theme.ink },
  kicker: { fontSize: 16, fontWeight: '700', color: theme.green, marginTop: 8 },
  body: { fontSize: 16, color: theme.ink, opacity: 0.85 },
  error: { color: '#b42318', fontSize: 16 },
  note: { color: theme.green, fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  qrCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: '#e8e0d5',
    alignItems: 'center',
  },
  qrWrap: {
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    minHeight: 244,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: '#e8e0d5',
  },
  cardTitle: { fontSize: 20, fontWeight: '700', color: theme.ink },
  mono: { fontFamily: 'Courier', fontSize: 10, color: theme.ink, opacity: 0.6 },
  link: { color: theme.green, fontSize: 16, marginTop: 8 },
});
