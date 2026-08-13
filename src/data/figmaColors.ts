/**
 * Figma Semantic Colors
 *
 * Comprehensive semantic color system with light and dark mode support.
 * Derived from figma-export.json - used as reference for Vuetify theme colors.
 */

// ── PRIMITIVE COLORS (Do not use directly) ───────────────────────────────────

export const primitiveColors = {
  // Blue Sky palette
  blueSky: {
    100: '#E8F0FB',
    150: '#D6E5F8',
    200: '#CCDEF6',
    300: '#99BCED',
    400: '#669BE4',
    500: '#3379DB',
    600: '#0058D2',
    700: '#0046A8',
    800: '#00357E',
    900: '#00295A',
  },

  // Lavender
  lavender: {
    100: '#EFEAFC',
    200: '#DDD2FA',
    300: '#BBA5F5',
    400: '#9A79EF',
    500: '#784CEA',
    600: '#561FE5',
    700: '#4519B7',
    800: '#341389',
    900: '#240C66',
  },

  // Purple
  purple: {
    100: '#EFEAFC',
    200: '#DDD2FA',
    300: '#CBAFFD',
    400: '#B287FB',
    500: '#985FFA',
    600: '#7E37F9',
    700: '#652CC7',
    800: '#4C2195',
    900: '#36166A',
  },

  // Magenta
  magenta: {
    100: '#F7EAFA',
    200: '#EED1F5',
    300: '#DDA3EB',
    400: '#CC74E2',
    500: '#BB46D8',
    600: '#AA18CE',
    700: '#8813A5',
    800: '#660E7C',
    900: '#4A095A',
  },

  // Forest Green
  forestGreen: {
    100: '#E8F1F1',
    150: '#D6E6E7',
    200: '#CCE0E1',
    300: '#99C1C3',
    400: '#66A1A5',
    500: '#338287',
    600: '#006369',
    700: '#004F54',
    800: '#003B3F',
    900: '#00292C',
  },

  // Red
  red: {
    50: '#FEEFEE',
    100: '#FEE4E2',
    200: '#FECDC9',
    300: '#FDA19B',
    400: '#F97066',
    500: '#F04438',
    600: '#D92D20',
    700: '#B32318',
    800: '#912018',
    900: '#7A271A',
  },

  // Apricot (Warning)
  apricot: {
    50: '#FEF5DD',
    100: '#FEEFC6',
    200: '#FEDF89',
    300: '#FEC84B',
    400: '#FDB022',
    500: '#F79009',
    600: '#DC6803',
    700: '#B54708',
    800: '#93370D',
    900: '#792E0D',
  },

  // Green (Success)
  green: {
    50: '#EBF7F1',
    100: '#E6F5EE',
    200: '#CDEADD',
    300: '#9AD6BB',
    400: '#68C199',
    500: '#35AD77',
    600: '#039855',
    700: '#027948',
    800: '#05603A',
    900: '#054F31',
  },

  // Gray
  gray: {
    50: '#F7F7F7',
    100: '#F5F5F5',
    200: '#F1F1F1',
    250: '#D9D9D9',
    300: '#B2B2B2',
    350: '#8A8A8A',
    400: '#757575',
    500: '#616161',
    600: '#444444',
    700: '#383838',
    800: '#2C2C2C',
    900: '#1E1E1E',
  },

  // Neutral
  black: '#121212',
  white: '#FFFFFF',
}

// ── SEMANTIC COLORS - LIGHT MODE ────────────────────────────────────────────

export const lightModeColors = {
  // Base background layers
  background: {
    default: '#FFFFFF',
    defaultActive: '#D9D9D9',
    secondary: '#F5F5F5',
    secondaryActive: '#D9D9D9',
    tertiary: '#F1F1F1',
    tertiaryActive: '#B2B2B2',
  },

  // Brand colors
  brand: {
    default: '#0058D2',
    defaultActive: '#00357E',
    defaultHover: '#0046A8',
    secondary: '#E8F0FB',
    secondaryActive: '#99BCED',
    secondaryHover: '#CCDEF6',
    tertiary: '#00295A',
  },

  // Status - Positive
  positive: {
    default: '#039855',
    defaultActive: '#05603A',
    defaultHover: '#027948',
    secondary: '#E6F5EE',
    secondaryActive: '#CDEADD',
  },

  // Status - Warning
  warning: {
    default: '#FDB022',
    defaultActive: '#DC6803',
    defaultHover: '#F79009',
    secondary: '#FEEFC6',
    secondaryActive: '#FEDF89',
    accent: '#FEC84B',
  },

  // Status - Danger
  danger: {
    default: '#D92D20',
    defaultActive: '#912018',
    defaultHover: '#B32318',
    secondary: '#FEE4E2',
    secondaryActive: '#FDA19B',
    secondaryHover: '#FECDC9',
  },

  // Text
  text: {
    default: '#121212',
    secondary: '#383838',
    tertiary: '#757575',
    brand: '#0058D2',
    brandHover: '#0058D2',
    brandVisited: '#AA18CE',
    disabled: '#B2B2B2',
    inverse: '#FFFFFF',
    inverseOnColor: '#FFFFFF',
    defaultOnColor: '#121212',
    secondaryOnColor: '#444444',
    positiveOnSecondary: '#027948',
    warningOnSecondary: '#B54708',
    dangerOnSecondary: '#B32318',
    brandOnSecondary: '#0058D2',
  },

  // Icon
  icon: {
    default: '#121212',
    secondary: '#444444',
    tertiary: '#757575',
    brand: '#0058D2',
    brandHover: '#0058D2',
    brandVisited: '#AA18CE',
    disabled: '#B2B2B2',
    inverseDefault: '#FFFFFF',
    inverseOnColor: '#FFFFFF',
    defaultOnColor: '#121212',
    secondaryOnColor: '#444444',
    positiveOnSecondary: '#027948',
    warningOnSecondary: '#B54708',
    dangerOnSecondary: '#B32318',
    brandOnSecondary: '#0058D2',
    positive: '#039855',
    warning: '#DC6803',
    danger: '#D92D20',
  },

  // Border
  border: {
    default: '#D9D9D9',
    secondary: '#B2B2B2',
    tertiary: '#444444',
    strong: '#121212',
    subtle: '#FFFFFF',
    brand: '#0058D2',
    disabled: '#D9D9D9',
    positive: '#027948',
    warning: '#DC6803',
    danger: '#D92D20',
  },

  // Disabled
  disabled: {
    background: '#F1F1F1',
    backgroundSecondary: '#D9D9D9',
    text: '#B2B2B2',
    textOnDisabled: '#B2B2B2',
    icon: '#B2B2B2',
    border: '#D9D9D9',
  },

  // Alpha / Overlays
  alpha: {
    overlayDark: 'rgba(18, 18, 18, 0.4)',
    overlayLight: 'rgba(255, 255, 255, 0.4)',
    largeSurface: 'rgba(68, 68, 68, 0.03)',
  },
}

// ── SEMANTIC COLORS - DARK MODE ─────────────────────────────────────────────

export const darkModeColors = {
  // Base background layers
  background: {
    default: '#1E1E1E',
    defaultActive: '#383838',
    secondary: '#2C2C2C',
    secondaryActive: '#444444',
    tertiary: '#383838',
    tertiaryActive: '#616161',
  },

  // Brand colors (adjusted for dark)
  brand: {
    default: '#0058D2',
    defaultActive: '#00357E',
    defaultHover: '#0046A8',
    secondary: '#CCDEF6',
    secondaryActive: '#669BE4',
    secondaryHover: '#99BCED',
    tertiary: '#00295A',
  },

  // Status - Positive (adjusted for dark)
  positive: {
    default: '#027948',
    defaultActive: '#054F31',
    defaultHover: '#05603A',
    secondary: '#CDEADD',
    secondaryActive: '#9AD6BB',
  },

  // Status - Warning (adjusted for dark)
  warning: {
    default: '#F79009',
    defaultActive: '#B54708',
    defaultHover: '#DC6803',
    secondary: '#FEDF89',
    secondaryActive: '#FEC84B',
    accent: '#FDB022',
  },

  // Status - Danger (adjusted for dark)
  danger: {
    default: '#B32318',
    defaultActive: '#7A271A',
    defaultHover: '#912018',
    secondary: '#FECDC9',
    secondaryActive: '#F97066',
    secondaryHover: '#FDA19B',
  },

  // Text
  text: {
    default: '#FFFFFF',
    secondary: '#F1F1F1',
    tertiary: '#B2B2B2',
    brand: '#669BE4',
    brandHover: '#0046A8',
    brandVisited: '#CC74E2',
    disabled: '#444444',
    inverse: '#121212',
    inverseOnColor: '#FFFFFF',
    defaultOnColor: '#121212',
    secondaryOnColor: '#444444',
    positiveOnSecondary: '#05603A',
    warningOnSecondary: '#93370D',
    dangerOnSecondary: '#912018',
    brandOnSecondary: '#0046A8',
  },

  // Icon
  icon: {
    default: '#FFFFFF',
    secondary: '#F1F1F1',
    tertiary: '#B2B2B2',
    brand: '#669BE4',
    brandHover: '#0046A8',
    brandVisited: '#CC74E2',
    disabled: '#444444',
    inverseDefault: '#121212',
    inverseOnColor: '#FFFFFF',
    defaultOnColor: '#121212',
    secondaryOnColor: '#444444',
    positiveOnSecondary: '#05603A',
    warningOnSecondary: '#93370D',
    dangerOnSecondary: '#912018',
    brandOnSecondary: '#0046A8',
    positive: '#35AD77',
    warning: '#F79009',
    danger: '#F04438',
  },

  // Border
  border: {
    default: '#444444',
    secondary: '#757575',
    tertiary: '#D9D9D9',
    strong: '#F5F5F5',
    subtle: '#121212',
    brand: '#3379DB',
    disabled: '#444444',
    positive: '#35AD77',
    warning: '#F79009',
    danger: '#F04438',
  },

  // Disabled
  disabled: {
    background: '#383838',
    backgroundSecondary: '#757575',
    text: '#444444',
    textOnDisabled: '#757575',
    icon: '#444444',
    border: '#444444',
  },

  // Alpha / Overlays
  alpha: {
    overlayDark: 'rgba(18, 18, 18, 0.1)',
    overlayLight: 'rgba(255, 255, 255, 0.1)',
    largeSurface: 'rgba(68, 68, 68, 0.1)',
  },
}

// ── COLOR HELPER FUNCTIONS ──────────────────────────────────────────────────

export function getSemanticColor(
  colorName: keyof typeof lightModeColors,
  shade: string,
  isDark: boolean = false
): string {
  const colorMap = isDark ? darkModeColors : lightModeColors
  const category = colorMap[colorName]
  if (category && typeof category === 'object' && shade in category) {
    return category[shade as keyof typeof category]
  }
  return ''
}
