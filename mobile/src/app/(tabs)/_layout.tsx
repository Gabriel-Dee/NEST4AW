import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { useEffect, useState } from 'react';

import { isLoggedIn, restoreSession } from '../../../services/api';
import { theme } from '../../theme';

export default function TabLayout() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
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
  if (!signedIn) {
    return <Redirect href="/" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.green,
        tabBarInactiveTintColor: theme.muted,
        tabBarStyle: {
          backgroundColor: theme.card,
          borderTopColor: theme.line,
          borderTopWidth: 1,
          minHeight: 64,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontSize: 13, fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="list"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" color={typeof color === 'string' ? color : theme.green} size={size} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scan',
          tabBarIcon: ({ color, size }) => <Ionicons name="scan" color={typeof color === 'string' ? color : theme.green} size={size} />,
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: 'Cart',
          tabBarIcon: ({ color, size }) => <Ionicons name="cart" color={typeof color === 'string' ? color : theme.green} size={size} />,
        }}
      />
      <Tabs.Screen
        name="safety"
        options={{
          title: 'Safety',
          tabBarIcon: ({ color, size }) => <Ionicons name="shield-checkmark" color={typeof color === 'string' ? color : theme.green} size={size} />,
        }}
      />
      <Tabs.Screen
        name="recipes"
        options={{
          title: 'Recipes',
          tabBarIcon: ({ color, size }) => <Ionicons name="restaurant" color={typeof color === 'string' ? color : theme.green} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <Ionicons name="person" color={typeof color === 'string' ? color : theme.green} size={size} />,
        }}
      />
    </Tabs>
  );
}
