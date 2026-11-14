import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getRecommendations, type Group, type Product } from '../../../services/api';
import { OfflineBanner, ProductCard, ScreenTitle } from '../../components/ui';
import { theme } from '../../theme';

const groups: Group[] = ['Produce', 'Proteins', 'Dairy', 'Grains', 'Pantry'];

export default function ListScreen() {
  const router = useRouter();
  const [items, setItems] = useState<Product[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getRecommendations().then((next) => {
        if (active) setItems(next);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenTitle>My Shopping List</ScreenTitle>
        <OfflineBanner />
        <View style={styles.note}>
          <Text style={styles.noteText}>Picked for you based on what's in stock today.</Text>
        </View>
        {items === null ? <Text style={styles.body}>Gathering today's list…</Text> : null}
        {groups.map((group) => {
          const rows = (items ?? []).filter((item) => item.group === group);
          if (rows.length === 0) return null;
          return (
            <View key={group}>
              <Text style={styles.group}>{group}</Text>
              {rows.map((item) => (
                <ProductCard
                  key={item.sku}
                  product={item}
                  onPress={() => router.push({ pathname: '/scan-result', params: { sku: item.sku } })}
                />
              ))}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 20, paddingBottom: 32 },
  note: { backgroundColor: theme.greenSoft, borderRadius: 12, padding: 12, marginBottom: 16 },
  noteText: { fontSize: theme.body, color: theme.ink, fontWeight: '600' },
  group: { fontSize: 22, fontWeight: '700', color: theme.ink, marginBottom: 8, marginTop: 8 },
  body: { fontSize: theme.body, color: theme.muted },
});
