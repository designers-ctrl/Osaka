/**
 * Vuetify Typography Configuration
 *
 * Maps Vuetify's built-in text utility classes to the Osaka typography scale
 * (Google Sans Flex font with specific sizes, weights, and line heights)
 *
 * Use these classes in templates: <p class="text-body-lg">Large body text</p>
 * Or reference the scale directly for custom typography needs
 */

import { typographyScale } from './typographyScale'

export const vuetifyTypographyConfig = {
  // Vuetify utility class → Osaka typography scale mapping
  // These can be used as className="text-heading-3xl-semibold" etc.

  // Headings
  'text-heading-4xl-regular': typographyScale.heading['4xl'].regular,
  'text-heading-4xl-semibold': typographyScale.heading['4xl'].semibold,
  'text-heading-3xl-regular': typographyScale.heading['3xl'].regular,
  'text-heading-3xl-semibold': typographyScale.heading['3xl'].semibold,
  'text-heading-2xl-regular': typographyScale.heading['2xl'].regular,
  'text-heading-2xl-semibold': typographyScale.heading['2xl'].semibold,
  'text-heading-xl-regular': typographyScale.heading.xl.regular,
  'text-heading-xl-semibold': typographyScale.heading.xl.semibold,
  'text-heading-lg-regular': typographyScale.heading.lg.regular,
  'text-heading-lg-semibold': typographyScale.heading.lg.semibold,
  'text-heading-md-light': typographyScale.heading.md.light,
  'text-heading-md-regular': typographyScale.heading.md.regular,
  'text-heading-md-semibold': typographyScale.heading.md.semibold,
  'text-heading-sm-regular': typographyScale.heading.sm.regular,
  'text-heading-sm-semibold': typographyScale.heading.sm.semibold,

  // Body
  'text-body-lg-regular': typographyScale.body.lg.regular,
  'text-body-lg-semibold': typographyScale.body.lg.semibold,
  'text-body-lg-underline': typographyScale.body.lg.underline,
  'text-body-md-light': typographyScale.body.md.light,
  'text-body-md-regular': typographyScale.body.md.regular,
  'text-body-md-semibold': typographyScale.body.md.semibold,
  'text-body-md-underline': typographyScale.body.md.underline,
  'text-body-sm-regular': typographyScale.body.sm.regular,
  'text-body-sm-semibold': typographyScale.body.sm.semibold,
  'text-body-xs-regular': typographyScale.body.xs.regular,
  'text-body-xs-semibold': typographyScale.body.xs.semibold,
  'text-body-xs-uppercase': typographyScale.body.xs.uppercase,
  'text-body-2xs-regular': typographyScale.body['2xs'].regular,
}

// ── VUETIFY INTEGRATION ──────────────────────────────────────────────────────

/**
 * To use these typography styles in Vuetify, you have three options:
 *
 * 1. UTILITY CLASSES (Recommended for templates)
 *    Add to src/styles/overrides.css or a new src/styles/typography.scss:
 *
 *    .text-heading-4xl-regular {
 *      font-size: 44px;
 *      font-weight: 400;
 *      line-height: 52px;
 *    }
 *    // ... etc for all styles
 *
 * 2. COMPONENT PROP (Direct on Vuetify text components)
 *    <v-card-title class="text-heading-3xl-semibold">Title</v-card-title>
 *
 * 3. INLINE STYLE (CSS-in-JS via Vue)
 *    <p :style="typographyScale.heading['3xl'].semibold">Title</p>
 */

// ── SUGGESTED DEFAULTS ──────────────────────────────────────────────────────

export const typographyDefaults = {
  // Component-level typography defaults (can be set in vuetify.ts defaults)
  'v-card-title': typographyScale.heading.lg.semibold,
  'v-card-subtitle': typographyScale.body.md.regular,
  'v-list-item-title': typographyScale.body.md.regular,
  'v-list-item-subtitle': typographyScale.body.sm.regular,
  'v-btn': typographyScale.body.md.semibold,
  'v-label': typographyScale.body.md.regular,
  'v-chip': typographyScale.body.sm.semibold,
}
