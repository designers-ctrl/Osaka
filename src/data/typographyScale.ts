/**
 * Typography Scale - Google Sans Flex
 *
 * From Figma: [Osaka] UX Exploration (textStyles.json)
 * Brand font: Google Sans Flex Variable
 * Defines all heading and body text styles used in the app
 */

export const typographyScale = {
  // ── HEADINGS ────────────────────────────────────────────────────────────

  heading: {
    // 4xl - Display Large
    '4xl': {
      regular: {
        fontSize: '44px',
        fontWeight: 400,
        lineHeight: '52px',
      },
      semibold: {
        fontSize: '44px',
        fontWeight: 600,
        lineHeight: '52px',
      },
    },

    // 3xl - Display Medium
    '3xl': {
      regular: {
        fontSize: '36px',
        fontWeight: 400,
        lineHeight: '44px',
      },
      semibold: {
        fontSize: '36px',
        fontWeight: 600,
        lineHeight: '44px',
      },
    },

    // 2xl
    '2xl': {
      regular: {
        fontSize: '30px',
        fontWeight: 400,
        lineHeight: '38px',
      },
      semibold: {
        fontSize: '30px',
        fontWeight: 600,
        lineHeight: '38px',
      },
    },

    // xl
    xl: {
      regular: {
        fontSize: '24px',
        fontWeight: 400,
        lineHeight: '32px',
      },
      semibold: {
        fontSize: '24px',
        fontWeight: 600,
        lineHeight: '32px',
      },
    },

    // lg
    lg: {
      regular: {
        fontSize: '20px',
        fontWeight: 400,
        lineHeight: '28px',
      },
      semibold: {
        fontSize: '20px',
        fontWeight: 600,
        lineHeight: '28px',
      },
    },

    // md
    md: {
      light: {
        fontSize: '18px',
        fontWeight: 300,
        lineHeight: '26px',
      },
      regular: {
        fontSize: '18px',
        fontWeight: 400,
        lineHeight: '26px',
      },
      semibold: {
        fontSize: '18px',
        fontWeight: 600,
        lineHeight: '26px',
      },
    },

    // sm
    sm: {
      regular: {
        fontSize: '16px',
        fontWeight: 400,
        lineHeight: '24px',
      },
      semibold: {
        fontSize: '16px',
        fontWeight: 600,
        lineHeight: '24px',
      },
    },
  },

  // ── BODY ────────────────────────────────────────────────────────────────

  body: {
    // lg
    lg: {
      regular: {
        fontSize: '16px',
        fontWeight: 400,
        lineHeight: '24px',
      },
      semibold: {
        fontSize: '16px',
        fontWeight: 600,
        lineHeight: '24px',
      },
      underline: {
        fontSize: '16px',
        fontWeight: 400,
        lineHeight: '24px',
        textDecoration: 'underline',
      },
    },

    // md
    md: {
      light: {
        fontSize: '14px',
        fontWeight: 200,
        lineHeight: '22px',
      },
      regular: {
        fontSize: '14px',
        fontWeight: 400,
        lineHeight: '22px',
      },
      semibold: {
        fontSize: '14px',
        fontWeight: 600,
        lineHeight: '22px',
      },
      underline: {
        fontSize: '14px',
        fontWeight: 400,
        lineHeight: '22px',
        textDecoration: 'underline',
      },
    },

    // sm
    sm: {
      regular: {
        fontSize: '12px',
        fontWeight: 400,
        lineHeight: '20px',
      },
      semibold: {
        fontSize: '12px',
        fontWeight: 600,
        lineHeight: '20px',
      },
    },

    // xs
    xs: {
      regular: {
        fontSize: '10px',
        fontWeight: 400,
        lineHeight: '16px',
        letterSpacing: '2%',
      },
      semibold: {
        fontSize: '10px',
        fontWeight: 600,
        lineHeight: '16px',
        letterSpacing: '2%',
      },
      uppercase: {
        fontSize: '10px',
        fontWeight: 400,
        lineHeight: '16px',
        letterSpacing: '2%',
        textTransform: 'uppercase',
      },
    },

    // 2xs
    '2xs': {
      regular: {
        fontSize: '8px',
        fontWeight: 400,
        lineHeight: '12px',
      },
    },
  },
}

// ── UTILITY FUNCTIONS ───────────────────────────────────────────────────────

export interface TypographyStyle {
  fontSize: string
  fontWeight: number | string
  lineHeight: string
  letterSpacing?: string
  textDecoration?: string
  textTransform?: string
}

/**
 * Get typography style by category, size, and weight
 * @example
 * getTypography('heading', '3xl', 'semibold')
 * getTypography('body', 'md', 'regular')
 */
export function getTypography(
  category: 'heading' | 'body',
  size: string,
  weight?: string
): TypographyStyle | null {
  const categoryStyles = typographyScale[category]
  if (!categoryStyles) return null

  const sizeStyles = categoryStyles[size as keyof typeof categoryStyles]
  if (!sizeStyles) return null

  if (weight) {
    return sizeStyles[weight as keyof typeof sizeStyles] || null
  }

  // Return first available weight if none specified
  return Object.values(sizeStyles)[0] as TypographyStyle || null
}

/**
 * Apply typography style to an element (for CSS-in-JS)
 */
export function applyTypography(style: TypographyStyle): Record<string, string> {
  const result: Record<string, string> = {
    fontSize: style.fontSize,
    fontWeight: String(style.fontWeight),
    lineHeight: style.lineHeight,
  }

  if (style.letterSpacing) result.letterSpacing = style.letterSpacing
  if (style.textDecoration) result.textDecoration = style.textDecoration
  if (style.textTransform) result.textTransform = style.textTransform

  return result
}

// ── PRESET COMBINATIONS ─────────────────────────────────────────────────────

export const typographyPresets = {
  // Page titles
  pageTitle: typographyScale.heading['3xl'].semibold,
  sectionTitle: typographyScale.heading['2xl'].semibold,
  subsectionTitle: typographyScale.heading.xl.semibold,

  // Body text
  bodyDefault: typographyScale.body.md.regular,
  bodySmall: typographyScale.body.sm.regular,
  bodyLarge: typographyScale.body.lg.regular,
  label: typographyScale.body.md.semibold,
  caption: typographyScale.body.sm.regular,
  hint: typographyScale.body.xs.regular,
}
