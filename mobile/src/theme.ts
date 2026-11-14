// Same light theme as frontend/src/app/globals.css (:root).
// Hex values are those OKLCH tokens. React Native does not paint oklch.
// Style: "Accessible & Ethical" — high contrast, 17pt body, 48pt touch targets, calm motion.
export const theme = {
  bg: '#f8f7f1',
  card: '#ffffff',
  ink: '#131d17',
  muted: '#556159',
  line: '#e0ded7',
  green: '#156f41',
  greenDark: '#0f5532',
  greenSoft: '#e1efe5',
  verdictGreen: '#d2f6dd',
  verdictGreenFg: '#004922',
  yellow: '#6c4300',
  yellowSoft: '#fbefc2',
  red: '#9b1e22',
  redSoft: '#ffdfda',
  white: '#f9fdfa',
  radius: 20,
  radiusSm: 14,
  body: 17,
  title: 30,
  tap: 48,
  // 4/8 spacing rhythm
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  // Type scale
  type: { caption: 14, body: 17, label: 15, h3: 19, h2: 22, h1: 30 },
  shadow: {
    shadowColor: '#131d17',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
} as const;

export const verdictPalette = {
  green: { bg: theme.verdictGreen, fg: theme.verdictGreenFg, icon: 'checkmark-circle' },
  yellow: { bg: theme.yellowSoft, fg: theme.yellow, icon: 'alert-circle' },
  red: { bg: theme.redSoft, fg: theme.red, icon: 'close-circle' },
} as const;
