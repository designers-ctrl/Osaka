/**
 * Figma Design System Tokens
 *
 * Reference tokens exported from Figma (figma-export.json)
 * These define the design system standards for typography, spacing, sizing, and effects.
 */

// ── TYPOGRAPHY ──────────────────────────────────────────────────────────────

export const typographyTokens = {
  // Desktop typography scale
  desktop: {
    displayLarge: {
      fontFamily: 'Onest',
      fontSize: '56px',
      fontWeight: 600,
      lineHeight: '64px',
      letterSpacing: '-2%',
    },
    displayMedium: {
      fontFamily: 'Onest',
      fontSize: '48px',
      fontWeight: 600,
      lineHeight: '56px',
      letterSpacing: '-2%',
    },
    h1: {
      fontFamily: 'Onest',
      fontSize: '40px',
      fontWeight: 600,
      lineHeight: '48px',
      letterSpacing: '-2%',
    },
    h2: {
      fontFamily: 'Onest',
      fontSize: '32px',
      fontWeight: 600,
      lineHeight: '40px',
      letterSpacing: '-2%',
    },
    h3: {
      fontFamily: 'Onest',
      fontSize: '24px',
      fontWeight: 600,
      lineHeight: '32px',
      letterSpacing: '-1%',
    },
    h4: {
      fontFamily: 'Onest',
      fontSize: '20px',
      fontWeight: 600,
      lineHeight: '28px',
      letterSpacing: '-1%',
    },
    h5: {
      fontFamily: 'Onest',
      fontSize: '18px',
      fontWeight: 600,
      lineHeight: '26px',
      letterSpacing: '-1%',
    },
    bodyLarge: {
      fontFamily: 'Onest',
      fontSize: '18px',
      fontWeight: 400,
      lineHeight: '28px',
      letterSpacing: '0%',
    },
    bodyLargeMedium: {
      fontFamily: 'Onest',
      fontSize: '18px',
      fontWeight: 500,
      lineHeight: '28px',
      letterSpacing: '0%',
    },
    body: {
      fontFamily: 'Onest',
      fontSize: '16px',
      fontWeight: 400,
      lineHeight: '24px',
      letterSpacing: '0%',
    },
    bodyMedium: {
      fontFamily: 'Onest',
      fontSize: '16px',
      fontWeight: 500,
      lineHeight: '24px',
      letterSpacing: '0%',
    },
    bodySmall: {
      fontFamily: 'Onest',
      fontSize: '14px',
      fontWeight: 400,
      lineHeight: '20px',
      letterSpacing: '0%',
    },
    bodySmallMedium: {
      fontFamily: 'Onest',
      fontSize: '14px',
      fontWeight: 500,
      lineHeight: '20px',
      letterSpacing: '0%',
    },
    captionMedium: {
      fontFamily: 'Onest',
      fontSize: '12px',
      fontWeight: 400,
      lineHeight: '16px',
      letterSpacing: '0%',
    },
    captionMediumMedium: {
      fontFamily: 'Onest',
      fontSize: '12px',
      fontWeight: 500,
      lineHeight: '16px',
      letterSpacing: '0%',
    },
    captionSmall: {
      fontFamily: 'Onest',
      fontSize: '10px',
      fontWeight: 400,
      lineHeight: '12px',
      letterSpacing: '0%',
    },
  },

  // Mobile typography scale
  mobile: {
    displayLarge: {
      fontFamily: 'Onest',
      fontSize: '48px',
      fontWeight: 600,
      lineHeight: '56px',
      letterSpacing: '-2%',
    },
    displayMedium: {
      fontFamily: 'Onest',
      fontSize: '40px',
      fontWeight: 600,
      lineHeight: '48px',
      letterSpacing: '-2%',
    },
    h1: {
      fontFamily: 'Onest',
      fontSize: '48px',
      fontWeight: 600,
      lineHeight: '40px', // Note: unusual in Figma export, likely should be 56px
      letterSpacing: '-2%',
    },
    h2: {
      fontFamily: 'Onest',
      fontSize: '28px',
      fontWeight: 600,
      lineHeight: '36px',
      letterSpacing: '-2%',
    },
    h3: {
      fontFamily: 'Onest',
      fontSize: '22px',
      fontWeight: 600,
      lineHeight: '30px',
      letterSpacing: '-1%',
    },
    h4: {
      fontFamily: 'Onest',
      fontSize: '18px',
      fontWeight: 600,
      lineHeight: '26px',
      letterSpacing: '-1%',
    },
    h5: {
      fontFamily: 'Onest',
      fontSize: '16px',
      fontWeight: 600,
      lineHeight: '24px',
      letterSpacing: '-1%',
    },
  },

  // Documentation/Code typography
  documentation: {
    extraLarge: {
      fontFamily: 'JetBrains Mono',
      fontSize: '20px',
      fontWeight: 500,
      lineHeight: '28px',
      letterSpacing: '-1%',
    },
    large: {
      fontFamily: 'JetBrains Mono',
      fontSize: '18px',
      fontWeight: 400,
      lineHeight: '28px',
      letterSpacing: '-1%',
    },
    medium: {
      fontFamily: 'JetBrains Mono',
      fontSize: '16px',
      fontWeight: 500,
      lineHeight: '24px',
      letterSpacing: '-1%',
    },
    small: {
      fontFamily: 'JetBrains Mono',
      fontSize: '14px',
      fontWeight: 500,
      lineHeight: '20px',
      letterSpacing: '-1%',
    },
  },
}

// ── SPACING SCALE ───────────────────────────────────────────────────────────

export const spacingScale = {
  0: '0px',
  2: '2px',
  4: '4px',
  6: '6px',
  8: '8px',
  12: '12px',
  16: '16px',
  20: '20px',
  24: '24px',
  32: '32px',
  40: '40px',
  48: '48px',
  56: '56px',
  64: '64px',
  80: '80px',
  96: '96px',
  120: '120px',
}

// ── BORDER RADIUS SCALE ─────────────────────────────────────────────────────

export const radiusScale = {
  0: '0px',
  4: '4px',
  6: '6px',
  8: '8px',
  12: '12px',
  16: '16px',
  24: '24px',
  32: '32px',
  full: '999px',
}

// ── BORDER WIDTH SCALE ──────────────────────────────────────────────────────

export const borderWidthScale = {
  0.5: '0.5px',
  1: '1px',
  1.5: '1.5px',
  2: '2px',
  3: '3px',
}

// ── EFFECTS (SHADOWS & FOCUS RINGS) ─────────────────────────────────────────

export const effectStyles = {
  dropShadow: {
    small: '0px 1px 3px 0px rgba(0, 0, 0, 0.16), 0px 0px 0.5px 0px rgba(0, 0, 0, 0.3)',
    medium: '0px 1px 3px 0px rgba(0, 0, 0, 0.08), 0px 3px 8px 0px rgba(0, 0, 0, 0.08), 0px 0px 0.5px 0px rgba(0, 0, 0, 0.18)',
    large: '0px 1px 3px 0px rgba(0, 0, 0, 0.08), 0px 5px 12px 0px rgba(0, 0, 0, 0.08), 0px 0px 0.5px 0px rgba(0, 0, 0, 0.15)',
    xl: '0px 2px 8px 0px rgba(0, 0, 0, 0.08), 0px 10px 24px 0px rgba(0, 0, 0, 0.08), 0px 0px 0px 0.5px rgba(0, 0, 0, 0.12)',
    xxl: '0px 2px 5px 0px rgba(0, 0, 0, 0.1), 0px 12px 32px 0px rgba(0, 0, 0, 0.12), 0px 0px 0.5px 0px rgba(0, 0, 0, 0.08), 0px 3px 12px 0px rgba(0, 0, 0, 0.05)',
    xxxl: '0px 6px 12px 0px rgba(0, 0, 0, 0.1), 0px 16px 48px 0px rgba(0, 0, 0, 0.14), 0px 0px 0.5px 0px rgba(0, 0, 0, 0.08), 0px 3px 12px 0px rgba(0, 0, 0, 0.05)',
  },
  focusRing: {
    small: '0px 0px 0px 3px #3379db, 0px 0px 0px 1px #ffffff',
    smallInner: 'inset 0px 0px 0px 2px #3379db',
    medium: '0px 0px 0px 5px #3379db, 0px 0px 0px 2px #ffffff',
    largeDefault: '0px 0px 0px 4px #ccdef6',
    largeWarning: '0px 0px 0px 4px #fedf89',
    largeError: '0px 0px 0px 4px #fecdc9',
    largeSuccess: '0px 0px 0px 4px #cdeadd',
  },
}

// ── RESPONSIVE BREAKPOINTS (from Grid Styles) ──────────────────────────────

export const breakpoints = {
  xs: 320,     // XS Mobile
  sm: 576,     // S Mobile
  md: 768,     // M Tablet
  lg: 992,     // L Desktop
  xl: 1248,    // XL Desktop
}

// ── GRID SYSTEMS ────────────────────────────────────────────────────────────

export const gridSystems = {
  xs: { columns: 4, gutter: '16px', margin: '16px' },  // XS Mobile (≥ 320)
  sm: { columns: 4, gutter: '16px', margin: '16px' },  // S Mobile (≥ 576)
  md: { columns: 8, gutter: '24px', margin: '24px' },  // M Tablet (≥ 768)
  lg: { columns: 12, gutter: '24px', margin: '24px' }, // L Desktop (≥ 992)
  xl: { columns: 12, gutter: '24px', margin: '24px' }, // XL Desktop (≥ 1248)
}
