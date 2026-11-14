import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PREFERENCES, getProfile, getSafetyAdvice, logout, saveProfile, type ClientProfile, type SafetyNote } from '../../../services/api';
import { Banner, Button, Card, Chip, ListRow, Loading, Screen, Section, ui } from '../../components/ui';
import { theme, verdictPalette } from '../../theme';

function toggle(list: string[], value: string) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [notes, setNotes] = useState<SafetyNote[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([getProfile(), getSafetyAdvice()]).then(([p, advice]) => {
        if (!active) return;
        setProfile(p);
        setNotes(advice.notes.filter((n) => n.tone !== 'plain'));
        setDirty(false);
        setSaved(false);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  function update(next: ClientProfile) {
    setProfile(next);
    setDirty(true);
    setSaved(false);
  }

  async function onSave() {
    if (!profile) return;
    const result = await saveProfile(profile);
    if (result.ok) {
      setProfile(result.profile);
      setDirty(false);
      setSaved(true);
    }
  }

  if (!profile) {
    return (
      <Screen title="Profile">
        <Loading label="Loading your profile…" />
      </Screen>
    );
  }

  const fullName = `${profile.firstName} ${profile.lastName}`.trim();

  return (
    <Screen>
      {/* Identity */}
      <View style={styles.identity}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(profile.firstName || '?').slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={ui.fill}>
          <Text style={ui.h1} accessibilityRole="header">
            {fullName || 'My profile'}
          </Text>
          <Chip icon="medkit-outline" label={profile.planBadge} />
        </View>
      </View>

      {/* Health plan */}
      <Section title="My health plan">
        <Card>
          {profile.planLine ? <Text style={styles.planLine}>{profile.planLine}</Text> : null}
          <Text style={ui.rowSub}>Conditions on file</Text>
          <View style={styles.chips}>
            {profile.conditions.length ? profile.conditions.map((c) => <Chip key={c} tone="neutral" label={c} />) : <Text style={ui.rowSub}>None</Text>}
          </View>
          <Text style={ui.rowSub}>Allergies</Text>
          <View style={styles.chips}>
            {profile.allergies.length ? profile.allergies.map((a) => <Chip key={a} tone="warn" icon="warning-outline" label={a} />) : <Text style={ui.rowSub}>None</Text>}
          </View>
          <View style={styles.note}>
            <Ionicons name="information-circle-outline" size={18} color={theme.muted} />
            <Text style={[ui.rowSub, ui.fill]}>To change your conditions or allergies, ask a volunteer. They set what is safe for you.</Text>
          </View>
        </Card>
      </Section>

      {/* How the colors work (was the Safety tab) */}
      <Section title="What the colors mean">
        <Card style={styles.list}>
          {notes.map((n, i) => {
            const p = n.tone === 'green' || n.tone === 'yellow' || n.tone === 'red' ? verdictPalette[n.tone] : null;
            return (
              <View key={n.title} style={[styles.colorRow, i > 0 && styles.border]}>
                {p ? <Ionicons name={p.icon} size={24} color={p.fg} /> : null}
                <View style={ui.fill}>
                  <Text style={ui.rowTitle}>{n.title}</Text>
                  <Text style={ui.rowSub}>{n.body}</Text>
                </View>
              </View>
            );
          })}
        </Card>
      </Section>

      {/* Editable preferences */}
      <Section title="Household & preferences">
        <Card>
          <View style={styles.stepRow}>
            <View style={ui.fill}>
              <Text style={ui.rowTitle}>People in your household</Text>
              <Text style={ui.rowSub}>Used to suggest how much to take.</Text>
            </View>
            <View style={styles.stepper}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Fewer people"
                onPress={() => update({ ...profile, householdSize: Math.max(1, profile.householdSize - 1) })}
                style={styles.stepBtn}
              >
                <Ionicons name="remove" size={22} color={theme.green} />
              </Pressable>
              <Text style={styles.stepValue} accessibilityLabel={`${profile.householdSize} people`}>
                {profile.householdSize}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="More people"
                onPress={() => update({ ...profile, householdSize: Math.min(12, profile.householdSize + 1) })}
                style={styles.stepBtn}
              >
                <Ionicons name="add" size={22} color={theme.green} />
              </Pressable>
            </View>
          </View>
          <Text style={ui.rowTitle}>Food preferences</Text>
          <View style={styles.chips}>
            {PREFERENCES.map((pref) => {
              const on = profile.preferences.includes(pref);
              return (
                <Pressable
                  key={pref}
                  onPress={() => update({ ...profile, preferences: toggle(profile.preferences, pref) })}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  style={[styles.toggle, on && styles.toggleOn]}
                >
                  {on ? <Ionicons name="checkmark" size={18} color={theme.white} /> : null}
                  <Text style={[styles.toggleText, on && styles.toggleTextOn]}>{pref}</Text>
                </Pressable>
              );
            })}
          </View>
          {dirty ? <Button icon="save-outline" label="Save changes" onPress={onSave} /> : null}
          {saved ? <Banner tone="success" text="Saved." /> : null}
        </Card>
      </Section>

      <Section title="More">
        <Card style={styles.list}>
          <ListRow icon="bookmark-outline" title="Saved recipes" onPress={() => router.navigate({ pathname: '/(tabs)/recipes', params: { mode: 'saved' } })} />
          <View style={styles.border} />
          <ListRow icon="storefront-outline" title="Stores & visits" onPress={() => router.navigate('/(tabs)/list')} />
        </Card>
      </Section>

      {/* Destructive action, separated */}
      <Button
        variant="danger"
        icon="log-out-outline"
        label="Log out"
        onPress={() => {
          logout();
          router.replace('/');
        }}
        style={styles.logout}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: theme.space.lg, marginTop: theme.space.sm },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: theme.green, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: theme.white, fontSize: 28, fontWeight: '800' },
  planLine: { fontSize: theme.type.h3, fontWeight: '700', color: theme.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  note: { flexDirection: 'row', gap: theme.space.sm, alignItems: 'flex-start', marginTop: theme.space.xs },
  list: { paddingVertical: theme.space.xs, gap: 0 },
  border: { height: 1, backgroundColor: theme.line, borderTopWidth: 0 },
  colorRow: { flexDirection: 'row', gap: theme.space.md, alignItems: 'center', paddingVertical: theme.space.md, borderTopColor: theme.line },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
  stepBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: theme.line, alignItems: 'center', justifyContent: 'center' },
  stepValue: { fontSize: theme.type.h2, fontWeight: '800', color: theme.ink, minWidth: 28, textAlign: 'center' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: theme.space.lg, borderRadius: 999, borderWidth: 1, borderColor: theme.line },
  toggleOn: { backgroundColor: theme.green, borderColor: theme.green },
  toggleText: { fontSize: theme.type.body, fontWeight: '700', color: theme.ink },
  toggleTextOn: { color: theme.white },
  logout: { marginTop: theme.space.lg },
});
