import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { checkIn, isCheckedIn, restoreSession } from '../../services/api';
import { PrimaryButton } from '../components/ui';
import { theme } from '../theme';

export default function CheckInScreen() {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [clientCode, setClientCode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    restoreSession();
    if (isCheckedIn()) router.replace('/(tabs)/list');
  }, [router]);

  async function onCheckIn() {
    setBusy(true);
    setMessage('');
    const result = await checkIn({ firstName, lastName, clientCode });
    setBusy(false);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    router.replace('/(tabs)/list');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.kicker}>Epic Cure</Text>
        <Text style={styles.title}>Check in</Text>
        <Text style={styles.body}>
          Enter your name and the card token from your card. After that you will see foods picked for you.
        </Text>
        <Text style={styles.label}>First name</Text>
        <TextInput
          value={firstName}
          onChangeText={setFirstName}
          autoCapitalize="words"
          accessibilityLabel="First name"
          style={styles.input}
          placeholder="Maria"
          placeholderTextColor={theme.muted}
        />
        <Text style={styles.label}>Last name</Text>
        <TextInput
          value={lastName}
          onChangeText={setLastName}
          autoCapitalize="words"
          accessibilityLabel="Last name"
          style={styles.input}
          placeholder="Optional"
          placeholderTextColor={theme.muted}
        />
        <Text style={styles.label}>Client code</Text>
        <TextInput
          value={clientCode}
          onChangeText={setClientCode}
          autoCapitalize="none"
          accessibilityLabel="Client code"
          style={styles.input}
          placeholder="Card token from enrollment"
          placeholderTextColor={theme.muted}
        />
        {message ? <Text style={styles.error}>{message}</Text> : null}
        <PrimaryButton label={busy ? 'Checking…' : 'Check in'} onPress={onCheckIn} disabled={busy} />
        <Text style={styles.hint}>
          Use the card token from enrollment. For a client login without a card, put the email in Client
          code and the password in Last name.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 20, paddingBottom: 40 },
  kicker: { fontSize: 16, fontWeight: '700', color: theme.green, marginBottom: 8 },
  title: { fontSize: 36, fontWeight: '700', color: theme.ink, marginBottom: 8 },
  body: { fontSize: theme.body, color: theme.ink, marginBottom: 16, lineHeight: 24 },
  label: { fontSize: theme.body, fontWeight: '700', color: theme.ink, marginBottom: 6, marginTop: 8 },
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
  hint: { fontSize: theme.body, color: theme.muted, marginTop: 16 },
});
