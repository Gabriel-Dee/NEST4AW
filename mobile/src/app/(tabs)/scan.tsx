import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { isInStore } from '../../../services/api';
import { Button, Card, EmptyState, Screen, ui } from '../../components/ui';
import { theme } from '../../theme';

export default function ScanScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [code, setCode] = useState(typeof params.code === 'string' ? params.code : '');
  const [focused, setFocused] = useState(true);
  const [inStore, setInStore] = useState(isInStore());
  // The camera reports one barcode many times per second; a ref locks synchronously.
  const lock = useRef(false);

  // Tabs stay mounted: only run the camera while this tab is on screen.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      setInStore(isInStore());
      lock.current = false;
      return () => setFocused(false);
    }, []),
  );

  function openResult(raw: string) {
    const next = raw.trim();
    if (!next || lock.current) return;
    lock.current = true;
    router.navigate({ pathname: '/(tabs)/scan-result', params: { sku: next } });
  }

  if (!inStore) {
    return (
      <Screen title="Scan">
        <Card>
          <EmptyState
            icon="storefront-outline"
            title="Check in to start scanning"
            body="Scanning checks each item against your health plan and today's stock at the store you're in."
            action={{ label: 'Check in at store', icon: 'qr-code-outline', onPress: () => router.navigate('/(tabs)/check-in') }}
          />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title="Scan an item" subtitle="Point the camera at the barcode on the package.">
      <View style={styles.viewport}>
        {permission?.granted && focused ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'qr'] }}
            onBarcodeScanned={({ data }) => openResult(data)}
          />
        ) : (
          <View style={styles.cameraOff}>
            <Ionicons name="camera-outline" size={40} color={theme.white} />
            <Text style={styles.cameraOffText}>
              {permission?.granted ? 'Camera paused' : 'Allow the camera to scan barcodes.'}
            </Text>
            {!permission?.granted ? <Button variant="onBrand" icon="camera" label="Allow camera" onPress={() => requestPermission()} /> : null}
          </View>
        )}
        {/* Corner guides, inside the viewport so they never cover text. */}
        <View pointerEvents="none" style={styles.guides}>
          <View style={[styles.corner, styles.tl]} />
          <View style={[styles.corner, styles.tr]} />
          <View style={[styles.corner, styles.bl]} />
          <View style={[styles.corner, styles.br]} />
        </View>
      </View>

      <Card>
        <Text style={ui.rowTitle}>No camera? Type the barcode</Text>
        <Text style={ui.rowSub}>The numbers under the barcode, or the item code on the shelf tag.</Text>
        <TextInput
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          keyboardType="default"
          returnKeyType="search"
          onSubmitEditing={() => openResult(code)}
          placeholder="e.g. 051000012517"
          placeholderTextColor={theme.muted}
          style={styles.input}
          accessibilityLabel="Barcode or item code"
        />
        <Button icon="search" label="Look up item" onPress={() => openResult(code)} disabled={!code.trim()} />
      </Card>

      {__DEV__ ? (
        <Pressable onPress={() => router.navigate('/(tabs)/scan-test-log')} accessibilityRole="button" style={styles.devLink}>
          <Text style={ui.sectionAction}>Scan test log (dev)</Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}

const C = 34;
const styles = StyleSheet.create({
  viewport: { height: 300, borderRadius: theme.radius, overflow: 'hidden', backgroundColor: '#14201a' },
  cameraOff: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.space.md, padding: theme.space.xl },
  cameraOffText: { color: theme.white, fontSize: theme.type.body, fontWeight: '600', textAlign: 'center' },
  guides: { position: 'absolute', top: 36, left: 36, right: 36, bottom: 36 },
  corner: { position: 'absolute', width: C, height: C, borderColor: theme.white },
  tl: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 14 },
  tr: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 14 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 14 },
  br: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 14 },
  input: {
    minHeight: 52,
    borderRadius: theme.radiusSm,
    borderWidth: 1,
    borderColor: theme.line,
    paddingHorizontal: theme.space.lg,
    fontSize: 18,
    color: theme.ink,
    backgroundColor: theme.bg,
  },
  devLink: { alignSelf: 'center', minHeight: 44, justifyContent: 'center' },
});
