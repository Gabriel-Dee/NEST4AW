import type { ReactNode } from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

// ponytail: static placeholder on web; swap in a web map library if the web build needs a real map.
export default function MapView({ style }: { style?: StyleProp<ViewStyle>; children?: ReactNode; [key: string]: unknown }) {
  return (
    <View style={[{ alignItems: 'center', justifyContent: 'center', backgroundColor: '#E3EEE6' }, style]}>
      <Text style={{ color: '#3D5245' }}>Map is available in the mobile app</Text>
    </View>
  );
}

export function Marker(_props: Record<string, unknown>) {
  return null;
}

export function Circle(_props: Record<string, unknown>) {
  return null;
}
