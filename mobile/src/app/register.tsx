import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ALLERGIES, ApiError, CONDITIONS, register } from '../../services/api';
import { PrimaryButton } from '../components/ui';
import { theme } from '../theme';

/** Callers: /register from welcome. User: register then land on home. */
export default function RegisterScreen() {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [householdSize, setHouseholdSize] = useState('3');
  const [conditions, setConditions] = useState<string[]>([]);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  function toggle(list: string[], value: string, set: (next: string[]) => void) {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  async function onSubmit() {
    setBusy(true);
    setMessage('');
    try {
      await register({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        password,
        householdSize: Math.max(1, Number(householdSize) || 1),
        conditions,
        allergies,
      });
      router.replace('/(tabs)/list');
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Could not create account');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.kicker}>Epic Cure</Text>
        <Text style={styles.title}>Create account</Text>
        <Field label="First name" value={firstName} onChange={setFirstName} />
        <Field label="Last name" value={lastName} onChange={setLastName} />
        <Field label="Email" value={email} onChange={setEmail} autoCapitalize="none" />
        <Field label="Password" value={password} onChange={setPassword} secureTextEntry />
        <Field
          label="Household size"
          value={householdSize}
          onChange={setHouseholdSize}
          keyboardType="number-pad"
        />
        <Text style={styles.label}>Conditions</Text>
        <View style={styles.chips}>
          {CONDITIONS.filter((c) => c !== 'Other').map((c) => (
            <Chip
              key={c}
              label={c}
              on={conditions.includes(c)}
              onPress={() => toggle(conditions, c, setConditions)}
            />
          ))}
        </View>
        <Text style={styles.label}>Allergies</Text>
        <View style={styles.chips}>
          {ALLERGIES.map((a) => (
            <Chip
              key={a}
              label={a}
              on={allergies.includes(a)}
              onPress={() => toggle(allergies, a, setAllergies)}
            />
          ))}
        </View>
        {message ? <Text style={styles.error}>{message}</Text> : null}
        <PrimaryButton label={busy ? 'Creating…' : 'Create account'} onPress={onSubmit} disabled={busy} />
        <PrimaryButton label="Back to log in" tone="quiet" onPress={() => router.push('/login')} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'words';
  keyboardType?: 'default' | 'number-pad' | 'email-address';
}) {
  return (
    <>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChange}
        secureTextEntry={props.secureTextEntry}
        autoCapitalize={props.autoCapitalize ?? 'words'}
        keyboardType={props.keyboardType}
        style={styles.input}
        placeholderTextColor={theme.muted}
      />
    </>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 20, paddingBottom: 40 },
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.line,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: theme.card,
  },
  chipOn: { backgroundColor: theme.green, borderColor: theme.green },
  chipText: { color: theme.ink, fontWeight: '600' },
  chipTextOn: { color: '#fff' },
  error: { fontSize: theme.body, color: theme.red, marginTop: 12, fontWeight: '600' },
});
