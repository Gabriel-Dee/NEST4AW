import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DAILY_VALUES, locationLabel, type Product, type Verdict } from '../../services/api';
import { theme, verdictPalette } from '../theme';

type IconName = keyof typeof Ionicons.glyphMap;

/* ───────────────────────── Layout ───────────────────────── */

/**
 * Every screen uses this. Top safe area only: the tab bar owns the bottom.
 * `back` shows a back chevron (falls back to Home when there is no history).
 */
export function Screen({
  title,
  subtitle,
  back = false,
  right,
  children,
  scroll = true,
  refreshing,
  onRefresh,
  contentStyle,
}: {
  title?: string;
  subtitle?: string;
  back?: boolean;
  right?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const header = title || back ? <Header title={title} subtitle={subtitle} back={back} right={right} /> : null;
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.content, contentStyle]}
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}
          keyboardShouldPersistTaps="handled"
        >
          {header}
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.fill, contentStyle]}>
          {header}
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}

export function Header({
  title,
  subtitle,
  back,
  right,
}: {
  title?: string;
  subtitle?: string;
  back?: boolean;
  right?: ReactNode;
}) {
  const router = useRouter();
  return (
    <View style={styles.header}>
      {back ? (
        <View style={styles.headerNav}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/list'))}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-back" size={24} color={theme.green} />
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          <View style={styles.headerRight}>{right}</View>
        </View>
      ) : null}
      <View style={styles.headerTitleRow}>
        <View style={styles.fill}>
          {title ? (
            <Text style={styles.h1} accessibilityRole="header">
              {title}
            </Text>
          ) : null}
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {!back && right ? <View style={styles.headerRight}>{right}</View> : null}
      </View>
    </View>
  );
}

export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: { label: string; onPress: () => void };
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.h2} accessibilityRole="header">
          {title}
        </Text>
        {action ? (
          <Pressable onPress={action.onPress} accessibilityRole="button" hitSlop={10}>
            <Text style={styles.sectionAction}>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

export function Card({
  children,
  onPress,
  tone = 'plain',
  style,
  accessibilityLabel,
}: {
  children: ReactNode;
  onPress?: () => void;
  tone?: 'plain' | 'green' | 'brand';
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const toneStyle = tone === 'green' ? styles.cardGreen : tone === 'brand' ? styles.cardBrand : null;
  if (!onPress) return <View style={[styles.card, toneStyle, style]}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.card, toneStyle, style, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

/* ───────────────────────── Controls ───────────────────────── */

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'onBrand';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const v = {
    primary: { bg: theme.green, fg: theme.white, border: theme.green },
    secondary: { bg: theme.card, fg: theme.ink, border: theme.line },
    ghost: { bg: 'transparent', fg: theme.green, border: 'transparent' },
    danger: { bg: theme.card, fg: theme.red, border: theme.redSoft },
    onBrand: { bg: theme.white, fg: theme.greenDark, border: theme.white },
  }[variant];
  const off = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: v.bg, borderColor: v.border, opacity: disabled ? 0.45 : 1 },
        pressed && !off && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={20} color={v.fg} /> : null}
          <Text style={[styles.buttonText, { color: v.fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/** Kept for screens that still use the older name. */
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
  return (
    <Button
      label={label}
      onPress={onPress}
      disabled={disabled}
      variant={tone === 'quiet' ? 'secondary' : 'primary'}
      style={styles.stackGap}
    />
  );
}

export function Chip({ label, icon, tone = 'green' }: { label: string; icon?: IconName; tone?: 'green' | 'neutral' | 'warn' }) {
  const t = {
    green: { bg: theme.greenSoft, fg: theme.green },
    neutral: { bg: theme.line, fg: theme.ink },
    warn: { bg: theme.yellowSoft, fg: theme.yellow },
  }[tone];
  return (
    <View style={[styles.chip, { backgroundColor: t.bg }]}>
      {icon ? <Ionicons name={icon} size={16} color={t.fg} /> : null}
      <Text style={[styles.chipText, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

export function ListRow({
  icon,
  title,
  subtitle,
  right,
  onPress,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
}) {
  const body = (
    <>
      {icon ? (
        <View style={styles.rowIcon}>
          <Ionicons name={icon} size={22} color={theme.green} />
        </View>
      ) : null}
      <View style={styles.fill}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.rowSub}>{subtitle}</Text> : null}
      </View>
      {right}
      {onPress ? <Ionicons name="chevron-forward" size={20} color={theme.muted} /> : null}
    </>
  );
  if (!onPress) return <View style={styles.row}>{body}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
}

/* ───────────────────────── Feedback ───────────────────────── */

export function Banner({
  tone = 'info',
  text,
  icon,
  action,
}: {
  tone?: 'info' | 'warn' | 'error' | 'success';
  text: string;
  icon?: IconName;
  action?: { label: string; onPress: () => void };
}) {
  const t = {
    info: { bg: theme.greenSoft, fg: theme.ink, icon: 'information-circle' as IconName },
    success: { bg: theme.verdictGreen, fg: theme.verdictGreenFg, icon: 'checkmark-circle' as IconName },
    warn: { bg: theme.yellowSoft, fg: theme.yellow, icon: 'alert-circle' as IconName },
    error: { bg: theme.redSoft, fg: theme.red, icon: 'close-circle' as IconName },
  }[tone];
  return (
    <View style={[styles.banner, { backgroundColor: t.bg }]} accessibilityRole="alert">
      <Ionicons name={icon ?? t.icon} size={22} color={t.fg} />
      <Text style={[styles.bannerText, { color: t.fg }]}>{text}</Text>
      {action ? (
        <Pressable onPress={action.onPress} accessibilityRole="button" hitSlop={10}>
          <Text style={[styles.bannerAction, { color: t.fg }]}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void; icon?: IconName };
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={32} color={theme.green} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {body ? <Text style={styles.emptyBody}>{body}</Text> : null}
      {action ? <Button label={action.label} icon={action.icon} onPress={action.onPress} style={styles.emptyBtn} /> : null}
    </View>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={theme.green} />
      <Text style={styles.rowSub}>{label}</Text>
    </View>
  );
}

/** No longer shown by default; kept for a real offline state. */
export function OfflineBanner() {
  return <Banner tone="warn" icon="cloud-offline-outline" text="You're offline. We'll sync when you're back." />;
}

/* ───────────────────────── Food ───────────────────────── */

export function badgeCopy(verdict: Verdict, suggestedQty: number) {
  if (verdict === 'green') return 'Great choice';
  if (verdict === 'yellow') return `Limit to ${suggestedQty || 1}`;
  return 'Not for you today';
}

export function StatusBadge({
  verdict,
  suggestedQty,
  size = 'md',
}: {
  verdict: Verdict;
  suggestedQty: number;
  size?: 'sm' | 'md' | 'lg';
}) {
  const p = verdictPalette[verdict];
  const label = badgeCopy(verdict, suggestedQty);
  const big = size === 'lg';
  return (
    <View
      style={[styles.badge, { backgroundColor: p.bg }, size === 'sm' && styles.badgeSm, big && styles.badgeLg]}
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      <Ionicons name={p.icon} size={big ? 26 : size === 'sm' ? 16 : 20} color={p.fg} />
      <Text style={[styles.badgeText, { color: p.fg }, size === 'sm' && styles.badgeTextSm, big && styles.badgeTextLg]}>
        {label}
      </Text>
    </View>
  );
}

export function PhotoPlaceholder({ icon, size = 56 }: { icon: Product['icon']; size?: number }) {
  return (
    <View style={[styles.photo, { width: size, height: size }]}>
      <Ionicons name={icon} size={size * 0.45} color={theme.green} />
    </View>
  );
}

export function ProductCard({ product, onPress }: { product: Product; onPress?: () => void }) {
  return (
    <Card onPress={onPress} style={styles.productCard} accessibilityLabel={`${product.name}, ${badgeCopy(product.verdict, product.suggestedQty)}`}>
      <PhotoPlaceholder icon={product.icon} />
      <View style={styles.productBody}>
        <Text style={styles.productName} numberOfLines={2}>
          {product.name}
        </Text>
        <StatusBadge verdict={product.verdict} suggestedQty={product.suggestedQty} size="sm" />
        {product.aisle ? (
          <View style={styles.inline}>
            <Ionicons name="location-outline" size={16} color={theme.muted} />
            <Text style={styles.rowSub}>{locationLabel(product)}</Text>
          </View>
        ) : null}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={20} color={theme.muted} /> : null}
    </Card>
  );
}

/**
 * % Daily Value per serving, using the FDA 5/20 rule:
 * 5% DV or less is low, 20% DV or more is high (21 CFR 101.9).
 */
export function NutrientBars({ product }: { product: Product }) {
  const rows = [
    { label: 'Sodium', value: product.sodiumMg, dv: DAILY_VALUES.sodiumMg, unit: 'mg' },
    { label: 'Sugar', value: product.sugarG, dv: DAILY_VALUES.addedSugarG, unit: 'g' },
    { label: 'Potassium', value: product.potassiumMg, dv: DAILY_VALUES.potassiumMg, unit: 'mg' },
    { label: 'Carbs', value: product.carbsG, dv: DAILY_VALUES.carbsG, unit: 'g' },
  ];
  return (
    <View style={styles.bars}>
      {rows.map((row) => {
        const pct = row.dv > 0 ? Math.round((row.value / row.dv) * 100) : 0;
        const level = pct >= 20 ? 'High' : pct <= 5 ? 'Low' : 'Medium';
        const color = pct >= 20 ? theme.red : pct <= 5 ? theme.green : '#a46a00';
        return (
          <View key={row.label} style={styles.barRow} accessibilityLabel={`${row.label} ${row.value} ${row.unit}, ${pct} percent daily value, ${level}`}>
            <View style={styles.barHead}>
              <Text style={styles.barLabel}>{row.label}</Text>
              <Text style={styles.barValue}>
                {Number.isInteger(row.value) ? row.value : row.value.toFixed(1)} {row.unit} · <Text style={{ color }}>{pct}% DV · {level}</Text>
              </Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.barFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: color }]} />
            </View>
          </View>
        );
      })}
      <Text style={styles.caption}>% Daily Value per serving. 5% or less is low, 20% or more is high.</Text>
    </View>
  );
}

export function ScreenTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.h1}>{children}</Text>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  fill: { flex: 1 },
  content: { paddingHorizontal: theme.space.xl, paddingTop: theme.space.sm, paddingBottom: theme.space.xxl, gap: theme.space.lg },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stackGap: { marginTop: theme.space.sm },

  header: { gap: theme.space.sm, marginBottom: theme.space.xs },
  headerNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  backBtn: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingRight: 12, marginLeft: -6 },
  backText: { fontSize: theme.type.body, color: theme.green, fontWeight: '600' },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
  h1: { fontSize: theme.type.h1, fontWeight: '800', color: theme.ink, letterSpacing: -0.4 },
  h2: { fontSize: theme.type.h2, fontWeight: '700', color: theme.ink },
  subtitle: { fontSize: theme.type.body, color: theme.muted, marginTop: 2, lineHeight: 24 },

  section: { gap: theme.space.md, marginTop: theme.space.sm },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionAction: { fontSize: theme.type.body, color: theme.green, fontWeight: '700' },
  sectionBody: { gap: theme.space.md },

  card: { backgroundColor: theme.card, borderRadius: theme.radius, padding: theme.space.lg, gap: theme.space.md, ...theme.shadow },
  cardGreen: { backgroundColor: theme.greenSoft, shadowOpacity: 0 },
  cardBrand: { backgroundColor: theme.green },

  button: {
    minHeight: theme.tap + 4,
    borderRadius: theme.radiusSm,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.sm,
    paddingHorizontal: theme.space.lg,
  },
  buttonText: { fontSize: 18, fontWeight: '700' },

  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
  chipText: { fontSize: theme.type.label, fontWeight: '700' },

  row: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md, minHeight: 56, paddingVertical: theme.space.sm },
  rowIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: theme.greenSoft, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: theme.type.body, fontWeight: '700', color: theme.ink },
  rowSub: { fontSize: theme.type.caption + 1, color: theme.muted, lineHeight: 21 },

  banner: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm, borderRadius: theme.radiusSm, padding: theme.space.md },
  bannerText: { flex: 1, fontSize: theme.type.body, fontWeight: '600', lineHeight: 23 },
  bannerAction: { fontSize: theme.type.body, fontWeight: '800', textDecorationLine: 'underline' },

  empty: { alignItems: 'center', gap: theme.space.sm, paddingVertical: theme.space.xl, paddingHorizontal: theme.space.lg },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: theme.greenSoft, alignItems: 'center', justifyContent: 'center', marginBottom: theme.space.xs },
  emptyTitle: { fontSize: theme.type.h3, fontWeight: '700', color: theme.ink, textAlign: 'center' },
  emptyBody: { fontSize: theme.type.body, color: theme.muted, textAlign: 'center', lineHeight: 24 },
  emptyBtn: { alignSelf: 'stretch', marginTop: theme.space.sm },
  loading: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm, paddingVertical: theme.space.lg },

  badge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
  badgeSm: { paddingVertical: 4, paddingHorizontal: 10 },
  badgeLg: { paddingVertical: 10, paddingHorizontal: 16, gap: 8 },
  badgeText: { fontSize: theme.type.body, fontWeight: '700' },
  badgeTextSm: { fontSize: theme.type.label },
  badgeTextLg: { fontSize: 20 },

  photo: { borderRadius: theme.radiusSm, backgroundColor: theme.greenSoft, alignItems: 'center', justifyContent: 'center' },
  productCard: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md, padding: theme.space.md },
  productBody: { flex: 1, gap: 6 },
  productName: { fontSize: theme.type.h3 - 1, fontWeight: '700', color: theme.ink },

  bars: { gap: theme.space.md },
  barRow: { gap: 6 },
  barHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  barLabel: { fontSize: theme.type.body, fontWeight: '700', color: theme.ink },
  barValue: { fontSize: theme.type.label, color: theme.muted, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  track: { height: 10, borderRadius: 99, backgroundColor: theme.line, overflow: 'hidden' },
  barFill: { height: 10, borderRadius: 99 },
  caption: { fontSize: theme.type.caption, color: theme.muted, lineHeight: 20 },
});

export const ui = styles;
