import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getScanTestLog } from '../../services/api';
import { theme } from '../theme';

export default function ScanTestLogScreen() {
  const rows = getScanTestLog();
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Scan test log</Text>
        <Text style={styles.body}>code · product · expected vs actual · latency · resolved_by</Text>
        {rows.length === 0 ? <Text style={styles.body}>No scans yet. Use manual entry on Scan.</Text> : null}
        {rows.map((row, i) => (
          <Text key={`${row.at}-${i}`} style={styles.row}>
            {row.code} → {row.product} | exp={row.expected ?? '-'} act={row.actual ?? '-'} | {row.ms}ms |{' '}
            {row.resolved_by || '-'}
          </Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 20, gap: 8 },
  title: { fontSize: 28, fontWeight: '700', color: theme.ink },
  body: { fontSize: 15, color: theme.ink, opacity: 0.8 },
  row: { fontFamily: 'Courier', fontSize: 12, color: theme.ink },
});
