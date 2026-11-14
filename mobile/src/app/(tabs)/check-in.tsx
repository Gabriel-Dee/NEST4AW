import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError, checkInViaStoreQr } from '../../../services/api';
import { Banner, Button, Card, Screen, ui } from '../../components/ui';
import { theme } from '../../theme';

/**
 * Scan the kiosk QR (NEST4AW:CHECKIN:<store_id>) shown on the staff screen at the entrance.
 */
export default function CheckInScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [focused, setFocused] = useState(true);
  // The camera reports the same QR many times per second; a ref locks synchronously,
  // React state would only lock on the next render and let duplicate requests through.
  const lockRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  async function handlePayload(raw: string) {
    const value = raw.trim();
    if (!value || lockRef.current) return;
    lockRef.current = true;
    setLocked(true);
    setBusy(true);
    setMessage('');
    try {
      await checkInViaStoreQr(value, { pretendAtStore: true });
      lockRef.current = false;
      setLocked(false);
      router.replace('/(tabs)/list');
    } catch (err) {
      // Stay locked so the camera doesn't rescan in a loop; the user taps "Try again".
      setMessage(err instanceof ApiError ? err.message : 'Check-in failed');
    } finally {
      setBusy(false);
    }
  }

  function retry() {
    lockRef.current = false;
    setLocked(false);
    setMessage('');
  }

  return (
    <Screen back title="Check in" subtitle="Scan the QR code on the kiosk screen at the store entrance.">
      <View style={styles.viewport}>
        {permission?.granted && focused ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={locked ? undefined : ({ data }) => void handlePayload(data)}
          />
        ) : (
          <View style={styles.cameraOff}>
            <Ionicons name="qr-code-outline" size={44} color={theme.white} />
            <Text style={styles.cameraOffText}>{permission?.granted ? 'Camera paused' : 'Allow the camera to scan the kiosk QR.'}</Text>
            {!permission?.granted ? <Button variant="onBrand" icon="camera" label="Allow camera" onPress={() => requestPermission()} /> : null}
          </View>
        )}
        {busy ? (
          <View style={styles.busy}>
            <Text style={styles.busyText}>Checking you in…</Text>
          </View>
        ) : null}
      </View>

      {message ? (
        <>
          <Banner tone="error" text={message} />
          <Button icon="refresh" label="Try again" onPress={retry} />
        </>
      ) : null}

      <Card>
        <Text style={ui.rowTitle}>Can’t scan? Enter the code</Text>
        <Text style={ui.rowSub}>It’s printed under the QR on the kiosk screen.</Text>
        <TextInput
          value={manual}
          onChangeText={setManual}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          placeholder="NEST4AW:CHECKIN:…"
          placeholderTextColor={theme.muted}
          accessibilityLabel="Kiosk check-in code"
        />
        <Button variant="secondary" icon="log-in-outline" label="Check in with code" onPress={() => void handlePayload(manual)} disabled={locked || !manual.trim()} loading={busy && !!manual} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  viewport: { height: 300, borderRadius: theme.radius, overflow: 'hidden', backgroundColor: '#14201a' },
  cameraOff: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.space.md, padding: theme.space.xl },
  cameraOffText: { color: theme.white, fontSize: theme.type.body, fontWeight: '600', textAlign: 'center' },
  busy: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,85,50,0.75)', alignItems: 'center', justifyContent: 'center' },
  busyText: { color: theme.white, fontSize: theme.type.h3, fontWeight: '800' },
  input: {
    minHeight: 52,
    borderRadius: theme.radiusSm,
    borderWidth: 1,
    borderColor: theme.line,
    paddingHorizontal: theme.space.lg,
    fontSize: 16,
    color: theme.ink,
    backgroundColor: theme.bg,
  },
});
