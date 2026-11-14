import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError, checkInViaStoreQr } from '../../services/api';
import { PrimaryButton } from '../components/ui';
import { theme } from '../theme';

/**
 * Callers: home Check-in button → /check-in.
 * Scans staff kiosk QR (NEST4AW:CHECKIN:<store_id>) then POST /stores/:id/check-in.
 * User: "check-in button which prompts me to scan the qr code at the store"
 */
export default function CheckInScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);

  async function handlePayload(raw: string) {
    const value = raw.trim();
    if (!value || busy || locked) return;
    setLocked(true);
    setBusy(true);
    setMessage('');
    try {
      const row = await checkInViaStoreQr(value, { pretendAtStore: true });
      setMessage(`Checked in: ${String(row.status ?? 'ok')}`);
      router.replace('/(tabs)/list');
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Check-in failed');
      setLocked(false);
    } finally {
      setBusy(false);
      setTimeout(() => setLocked(false), 1200);
    }
  }

  return (
    <View style={styles.fill}>
      {permission?.granted ? (
        <CameraView
          style={styles.fill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => {
            void handlePayload(data);
          }}
        />
      ) : (
        <SafeAreaView style={styles.permission}>
          <Text style={styles.title}>Check in at the store</Text>
          <Text style={styles.body}>Allow the camera to scan the kiosk QR on the staff screen.</Text>
          <PrimaryButton label="Allow camera" onPress={() => requestPermission()} />
        </SafeAreaView>
      )}

      <SafeAreaView style={styles.sheet}>
        <Text style={styles.sheetTitle}>{busy ? 'Checking in…' : 'Scan the store kiosk QR'}</Text>
        <Text style={styles.hint}>Or paste the code from the staff display:</Text>
        <TextInput
          value={manual}
          onChangeText={setManual}
          autoCapitalize="none"
          style={styles.input}
          placeholder="NEST4AW:CHECKIN:…"
          placeholderTextColor={theme.muted}
        />
        {message ? <Text style={styles.error}>{message}</Text> : null}
        <PrimaryButton label="Check in with code" onPress={() => void handlePayload(manual)} disabled={busy} />
        <PrimaryButton label="Cancel" tone="quiet" onPress={() => router.back()} />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#111' },
  permission: { flex: 1, backgroundColor: theme.bg, padding: 24, justifyContent: 'center', gap: 12 },
  title: { fontSize: 28, fontWeight: '700', color: theme.ink },
  body: { fontSize: 16, color: theme.ink, marginBottom: 8 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    gap: 8,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: theme.ink },
  hint: { fontSize: 14, color: theme.muted },
  input: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.line,
    paddingHorizontal: 12,
    fontSize: 14,
    color: theme.ink,
    backgroundColor: theme.bg,
  },
  error: { color: theme.red, fontWeight: '600' },
});
