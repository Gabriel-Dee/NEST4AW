import { CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '../../components/ui';
import { theme } from '../../theme';

export default function ScanScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [code, setCode] = useState(typeof params.code === 'string' ? params.code : '');
  const [locked, setLocked] = useState(false);

  function openResult(sku: string) {
    const next = sku.trim();
    if (!next || locked) return;
    setLocked(true);
    router.push({ pathname: '/scan-result', params: { sku: next } });
    setTimeout(() => setLocked(false), 800);
  }

  return (
    <View style={styles.fill}>
      {permission?.granted ? (
        <CameraView
          style={styles.fill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'qr'] }}
          onBarcodeScanned={({ data }) => openResult(data)}
        />
      ) : (
        <View style={styles.permission}>
          <Text style={styles.permissionText}>The camera reads the barcode. You can also type the code.</Text>
          <PrimaryButton label="Allow camera" onPress={() => requestPermission()} />
        </View>
      )}
      <View style={styles.frame} pointerEvents="none" />
      <SafeAreaView style={styles.sheet}>
        <Text style={styles.sheetTitle}>Type item code instead</Text>
        <TextInput
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          placeholder="BEANS, RICE, or SOUP"
          placeholderTextColor={theme.muted}
          style={styles.input}
          accessibilityLabel="Item code"
        />
        <Pressable style={styles.go} onPress={() => openResult(code)} accessibilityRole="button">
          <Text style={styles.goText}>Look up this code</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#111' },
  frame: {
    position: 'absolute',
    top: '22%',
    left: '12%',
    right: '12%',
    height: 180,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    borderRadius: 16,
  },
  permission: { flex: 1, backgroundColor: theme.bg, justifyContent: 'center', padding: 24 },
  permissionText: { fontSize: theme.body, color: theme.ink, marginBottom: 12 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: theme.ink },
  input: {
    minHeight: theme.tap,
    borderWidth: 1,
    borderColor: theme.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: theme.body,
    color: theme.ink,
    marginTop: 8,
    backgroundColor: theme.bg,
  },
  go: {
    minHeight: theme.tap,
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: theme.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goText: { color: theme.white, fontSize: 18, fontWeight: '700' },
});
