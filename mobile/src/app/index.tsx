import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { isLoggedIn, restoreSession } from '../../services/api';
import { PrimaryButton } from '../components/ui';
import { theme } from '../theme';

/** Welcome — login or register. Not the old name/code check-in. */
export default function WelcomeScreen() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      await restoreSession();
      if (!alive) return;
      if (isLoggedIn()) {
        router.replace('/(tabs)/list');
        return;
      }
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [router]);

  if (!ready) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.body}>Loading…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <Text style={styles.kicker}>Epic Cure</Text>
        <Text style={styles.title}>Welcome</Text>
        <Text style={styles.body}>
          Sign in with your account. After that you can check in at the store by scanning the kiosk QR.
        </Text>
        <PrimaryButton label="Log in" onPress={() => router.push('/login')} />
        <PrimaryButton label="Create account" tone="quiet" onPress={() => router.push('/register')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  content: { flex: 1, padding: 24, justifyContent: 'center', gap: 14 },
  kicker: { fontSize: 16, fontWeight: '700', color: theme.green },
  title: { fontSize: 40, fontWeight: '700', color: theme.ink },
  body: { fontSize: 18, color: theme.ink, opacity: 0.85, lineHeight: 26, marginBottom: 8 },
});
