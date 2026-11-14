import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError, login } from '../../services/api';
import { PrimaryButton } from '../components/ui';
import { theme } from '../theme';

/** Callers: Expo route /login from welcome. User: start at login then home. */
export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setBusy(true);
    setMessage('');
    try {
      await login(email.trim(), password);
      router.replace('/(tabs)/list');
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.kicker}>Epic Cure</Text>
        <Text style={styles.title}>Log in</Text>
        <Text style={styles.label}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          style={styles.input}
          placeholder="you@example.com"
          placeholderTextColor={theme.muted}
        />
        <Text style={styles.label}>Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={styles.input}
          placeholder="••••••••"
          placeholderTextColor={theme.muted}
        />
        {message ? <Text style={styles.error}>{message}</Text> : null}
        <PrimaryButton label={busy ? 'Signing in…' : 'Log in'} onPress={onSubmit} disabled={busy} />
        <PrimaryButton label="Create account" tone="quiet" onPress={() => router.push('/register')} />
        <PrimaryButton label="Back" tone="quiet" onPress={() => router.back()} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 20, paddingBottom: 40, gap: 4 },
  kicker: { fontSize: 16, fontWeight: '700', color: theme.green, marginBottom: 8 },
  title: { fontSize: 36, fontWeight: '700', color: theme.ink, marginBottom: 12 },
  label: { fontSize: theme.body, fontWeight: '700', color: theme.ink, marginBottom: 6, marginTop: 10 },
  input: {
    minHeight: theme.tap,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.line,
    backgroundColor: theme.card,
    paddingHorizontal: 14,
    fontSize: theme.body,
    color: theme.ink,
  },
  error: { fontSize: theme.body, color: theme.red, marginTop: 12, fontWeight: '600' },
});
