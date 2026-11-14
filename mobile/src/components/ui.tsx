import { Ionicons } from '@expo/vector-icons';
import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { locationLabel, type Product, type Verdict } from '../../services/api';
import { theme } from '../theme';

export function badgeCopy(verdict: Verdict, suggestedQty: number) {
  if (verdict === 'green') return 'Great choice';
  if (verdict === 'yellow') return `Limit to ${suggestedQty}`;
  return 'Not for you today';
}

const iconName = {
  green: 'checkmark-circle',
  yellow: 'alert-circle',
  red: 'close-circle',
} as const;

export function StatusBadge({ verdict, suggestedQty }: { verdict: Verdict; suggestedQty: number }) {
  const palette = {
    green: { bg: theme.greenSoft, fg: theme.green },
    yellow: { bg: theme.yellowSoft, fg: theme.yellow },
    red: { bg: theme.redSoft, fg: theme.red },
  }[verdict];
  const label = badgeCopy(verdict, suggestedQty);
  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]} accessibilityRole="text">
      <Ionicons name={iconName[verdict]} size={22} color={palette.fg} />
      <Text style={[styles.badgeText, { color: palette.fg }]}>{label}</Text>
    </View>
  );
}

export function OfflineBanner() {
  return (
    <View style={styles.banner}>
      <Ionicons name="cloud-offline-outline" size={22} color={theme.ink} />
      <Text style={styles.bannerText}>Saved on your phone, will sync</Text>
    </View>
  );
}

export function PhotoPlaceholder({ icon }: { icon: Product['icon'] }) {
  return (
    <View style={styles.photo}>
      <Ionicons name={icon} size={28} color={theme.green} />
    </View>
  );
}

export function ProductCard({ product, onPress }: { product: Product; onPress?: () => void }) {
  const body = (
    <View style={styles.card}>
      <PhotoPlaceholder icon={product.icon} />
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{product.name}</Text>
        <StatusBadge verdict={product.verdict} suggestedQty={product.suggestedQty} />
        <Text style={styles.meta}>Suggested: {product.suggestedQty > 0 ? product.suggestedQty : 0}</Text>
        <Text style={styles.meta}>{locationLabel(product)}</Text>
      </View>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={styles.press} accessibilityRole="button">
      {body}
    </Pressable>
  );
}

export function PrimaryButton({
  label,
  onPress,
  tone = 'green',
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  tone?: 'green' | 'ink' | 'quiet';
  disabled?: boolean;
}) {
  const background = tone === 'green' ? theme.green : tone === 'ink' ? theme.ink : theme.card;
  const color = tone === 'quiet' ? theme.ink : theme.white;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={[styles.button, { backgroundColor: background, opacity: disabled ? 0.45 : 1, borderWidth: tone === 'quiet' ? 1 : 0, borderColor: theme.line }]}
    >
      <Text style={[styles.buttonText, { color }]}>{label}</Text>
    </Pressable>
  );
}

export function NutrientBars({
  product,
  guides,
}: {
  product: Product;
  guides: { sodiumMg: number; addedSugarG: number; potassiumMg: number; carbsG: number };
}) {
  const rows = [
    { label: 'Sodium', value: product.sodiumMg, guide: guides.sodiumMg, unit: 'mg' },
    { label: 'Sugar', value: product.sugarG, guide: guides.addedSugarG, unit: 'g' },
    { label: 'Potassium', value: product.potassiumMg, guide: guides.potassiumMg, unit: 'mg' },
    { label: 'Carbs', value: product.carbsG, guide: guides.carbsG, unit: 'g' },
  ];
  return (
    <View style={styles.bars}>
      {rows.map((row) => {
        const width = row.guide <= 0 ? 0 : Math.min(row.value / row.guide, 1);
        return (
          <View key={row.label} style={styles.barRow}>
            <Text style={styles.meta}>
              {row.label} {row.value}
              {row.unit}
            </Text>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${width * 100}%` }]} />
            </View>
            <Text style={styles.guide}>
              Guide {row.guide}
              {row.unit}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export function ScreenTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minHeight: theme.tap,
  },
  badgeText: { fontSize: theme.body, fontWeight: '700' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F3E6C8',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  bannerText: { flex: 1, fontSize: theme.body, color: theme.ink, fontWeight: '600' },
  photo: {
    width: 64,
    height: 64,
    borderRadius: 14,
    backgroundColor: theme.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: theme.card,
    borderRadius: theme.radius,
    padding: 14,
    ...theme.shadow,
  },
  cardBody: { flex: 1, gap: 6 },
  cardTitle: { fontSize: 20, fontWeight: '700', color: theme.ink },
  meta: { fontSize: theme.body, color: theme.ink },
  guide: { fontSize: 14, color: theme.muted },
  press: { marginBottom: 12 },
  button: {
    minHeight: theme.tap,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginTop: 8,
  },
  buttonText: { fontSize: 18, fontWeight: '700' },
  bars: { gap: 10, marginTop: 8 },
  barRow: { gap: 4 },
  track: { height: 10, borderRadius: 99, backgroundColor: theme.line, overflow: 'hidden' },
  fill: { height: 10, backgroundColor: theme.green },
  title: { fontSize: theme.title, fontWeight: '700', color: theme.ink, marginBottom: 8 },
});
