import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { getSession } from '../../services/api';
import { PrimaryButton } from '../components/ui';
import { theme } from '../theme';

type Home = Awaited<ReturnType<typeof getSession>>;

function Ring({ picked, goal }: { picked: number; goal: number }) {
  const size = 96;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const ratio = goal === 0 ? 0 : Math.min(picked / goal, 1);
  return (
    <View style={styles.ringWrap} accessibilityLabel={`${picked} of ${goal} healthy picks today`}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={theme.line} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={theme.green}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${circ} ${circ}`}
          strokeDashoffset={circ * (1 - ratio)}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <Text style={styles.ringLabel}>
        {picked} of {goal}
        {'\n'}
        healthy picks today
      </Text>
    </View>
  );
}

export default function WelcomeScreen() {
  const router = useRouter();
  const [home, setHome] = useState<Home | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getSession().then((next) => {
        if (active) setHome(next);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>Epic Cure</Text>
        <Text style={styles.title}>Hi {home?.firstName ?? 'there'}</Text>
        <View style={styles.plan}>
          <Text style={styles.planText}>{home?.planBadge ?? 'Your plan'}</Text>
        </View>
        <Text style={styles.body}>Household of {home?.householdSize ?? 3}</Text>
        <Text style={styles.body}>{home?.conditionsLabel}</Text>
        <View style={styles.streak}>
          <Text style={styles.streakText}>{home?.streakLabel ?? '3 visits with healthy carts'}</Text>
        </View>
        <Ring picked={home?.greensInCart ?? 0} goal={home?.greenGoal ?? 0} />
        <PrimaryButton label="Start Shopping" onPress={() => router.push('/(tabs)/list')} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 20, paddingBottom: 40 },
  kicker: { fontSize: 16, fontWeight: '700', color: theme.green, marginBottom: 8 },
  title: { fontSize: 36, fontWeight: '700', color: theme.ink },
  plan: {
    alignSelf: 'flex-start',
    backgroundColor: theme.greenSoft,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginVertical: 12,
    minHeight: theme.tap,
    justifyContent: 'center',
  },
  planText: { fontSize: theme.body, fontWeight: '700', color: theme.green },
  body: { fontSize: theme.body, color: theme.ink, marginBottom: 6 },
  streak: {
    marginTop: 12,
    backgroundColor: theme.card,
    borderRadius: theme.radius,
    padding: 14,
    ...theme.shadow,
  },
  streakText: { fontSize: theme.body, fontWeight: '700', color: theme.ink },
  ringWrap: { alignItems: 'center', marginVertical: 20, gap: 8 },
  ringLabel: { fontSize: theme.body, textAlign: 'center', color: theme.ink, fontWeight: '600' },
});
