import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { useEffect, useState } from 'react';

import { isLoggedIn, restoreSession } from '../../../services/api';
import { theme } from '../../theme';

type IconName = keyof typeof Ionicons.glyphMap;

// Inner screens: reachable routes with no tab button. (`href: null` in this Expo Router version
// bounced navigation back to the first tab.)
const HIDDEN = { tabBarButton: () => null, tabBarItemStyle: { display: 'none' as const } };

function tabIcon(active: IconName, idle: IconName) {
  function TabIcon({ color, focused }: { color: unknown; focused: boolean }) {
    return <Ionicons name={focused ? active : idle} color={typeof color === 'string' ? color : theme.green} size={26} />;
  }
  return TabIcon;
}

/**
 * Five top-level tabs (HIG / Material limit). Every other screen lives in this group with
 * `href: null`, so the tab bar stays visible everywhere and Home is always one tap away.
 * `backBehavior="history"` makes the Back button return to the previous screen, not the first tab.
 */
export default function TabLayout() {
  // Render immediately when a session is already in memory: returning null here, even briefly,
  // drops the screen we were navigating to and the tabs fall back to Home.
  const [ready, setReady] = useState(isLoggedIn());
  const [signedIn, setSignedIn] = useState(isLoggedIn());

  useEffect(() => {
    if (isLoggedIn()) return;
    let alive = true;
    (async () => {
      await restoreSession();
      if (!alive) return;
      setSignedIn(isLoggedIn());
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!ready) return null;
  if (!signedIn) return <Redirect href="/" />;

  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.green,
        tabBarInactiveTintColor: theme.muted,
        tabBarStyle: {
          backgroundColor: theme.card,
          borderTopColor: theme.line,
          borderTopWidth: 1,
          height: 88,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 13, fontWeight: '700', marginTop: 2 },
        tabBarItemStyle: { minHeight: 48 },
      }}
    >
      <Tabs.Screen name="list" options={{ title: 'Home', tabBarIcon: tabIcon('home', 'home-outline') }} />
      <Tabs.Screen name="scan" options={{ title: 'Scan', tabBarIcon: tabIcon('scan-circle', 'scan-circle-outline') }} />
      <Tabs.Screen name="cart" options={{ title: 'Cart', tabBarIcon: tabIcon('cart', 'cart-outline') }} />
      <Tabs.Screen name="recipes" options={{ title: 'Recipes', tabBarIcon: tabIcon('restaurant', 'restaurant-outline') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: tabIcon('person-circle', 'person-circle-outline') }} />

      {/* Inner screens: no tab button, but the tab bar stays visible. */}
      <Tabs.Screen name="scan-result" options={HIDDEN} />
      <Tabs.Screen name="check-in" options={HIDDEN} />
      <Tabs.Screen name="stores" options={HIDDEN} />
      <Tabs.Screen name="checkout" options={HIDDEN} />
      <Tabs.Screen name="safety" options={HIDDEN} />
      <Tabs.Screen name="recipe/[id]" options={HIDDEN} />
      <Tabs.Screen name="scan-test-log" options={HIDDEN} />
    </Tabs>
  );
}
