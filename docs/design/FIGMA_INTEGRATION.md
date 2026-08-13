# Figma Design System Integration

This document outlines the integration of design tokens from the Figma export (`figma-export.json`) into the project.

## Changes Summary

### 1. Typography Scale - Google Sans Flex

**From Figma Export:** `[Osaka] UX Exploration` (textStyles.json)

**Heading Sizes:**
- 4xl: 44px (Regular, SemiBold)
- 3xl: 36px (Regular, SemiBold)
- 2xl: 30px (Regular, SemiBold)
- xl: 24px (Regular, SemiBold)
- lg: 20px (Regular, SemiBold)
- md: 18px (Light, Regular, SemiBold)
- sm: 16px (Regular, SemiBold)

**Body Sizes:**
- lg: 16px (Regular, SemiBold, Underline)
- md: 14px (Light, Regular, SemiBold, Underline)
- sm: 12px (Regular, SemiBold)
- xs: 10px (Regular, SemiBold, Uppercase) — 2% letter spacing
- 2xs: 8px (Regular)

**Files Created:**
- `src/data/typographyScale.ts` - Complete typography reference with utility functions
- `src/data/vuetifyTypography.ts` - Vuetify integration guide

**Usage Examples:**
```typescript
import { typographyScale, getTypography } from '@/data/typographyScale'

// Direct access
const headingStyle = typographyScale.heading['3xl'].semibold

// Via helper function
const bodyStyle = getTypography('body', 'md', 'regular')

// Apply to element
const styles = applyTypography(typographyScale.heading.lg.semibold)
```

### 2. Border Radius Scale (`src/styles/_tokens.scss`)

**Added new radius sizes from Figma:**
- `$radius-0`: 0px
- `$radius-xs`: 4px (was previously 4px, renamed)
- `$radius-sm`: 6px (new - Figma small interactive elements)
- `$radius-md`: 8px (default tier)
- `$radius-lg`: 12px (select/combobox/autocomplete popups)
- `$radius-xl`: 16px (new explicit)
- `$radius-2xl`: 24px (section panels, large surfaces)
- `$radius-3xl`: 32px (new - very large surfaces)
- `$radius-full`: 999px (new - pill/fully rounded)

**Updated in:**
- `src/styles/settings.scss` - Updated `$rounded` map with new sizes
- `src/styles/css-tokens.scss` - Added CSS custom property exports for all new sizes

### 2. Typography System (Updated)

**Primary Font:** Google Sans Flex Variable (brand font - unchanged)
- Remains the official brand font
- Supports font weights: 200 (Extra Light), 300 (Light), 400 (Regular), 600 (SemiBold)

**Typography Scale** (From Figma: [Osaka] UX Exploration)
- Definitive source: `src/data/typographyScale.ts`
- All sizes, weights, and line heights matched to Figma design
- Includes utility functions: `getTypography()`, `applyTypography()`
- Preset combinations for common use cases

**Reference Files:**
- `src/data/typographyScale.ts` - Complete typography hierarchy
- `src/data/vuetifyTypography.ts` - Integration guide for Vuetify components
- `src/data/figmaTokens.ts` - Additional token references (kept for comparison)

### 3. Color System

**Theme:** Default remains `dark` (unchanged)
**Status:** Available as reference in `src/data/figmaColors.ts` (not applied to project)

**Light Mode Colors:**
- Background: #FFFFFF (primary app background)
- Surface: #FFFFFF (components, cards, menus)
- Primary Brand: #0058D2 (Blue Sky 600)
- Success: #039855 (Green 600)
- Warning: #FDB022 (Apricot 400)
- Danger: #D92D20 (Red 600)
- Text: #121212 (Gray 900)

**Dark Mode Colors:**
- Background: #1E1E1E (primary app background)
- Surface: #1E1E1E (components, cards, menus)
- Primary Brand: #0058D2 (maintained)
- Success: #35AD77 (Green 500 - lighter for contrast)
- Warning: #F79009 (Apricot 500 - lighter for contrast)
- Danger: #F04438 (Red 500 - lighter for contrast)
- Text: #FFFFFF (for readability)

**Updated in:**
- `src/plugins/vuetify.ts` - Complete theme color overhaul
- `index.html` - Theme color meta tag updated to #FFFFFF

### 4. New Token Files Created

#### `src/data/figmaTokens.ts`
Complete reference of Figma design tokens:
- **Typography**: Desktop, Mobile, and Documentation scales
- **Spacing Scale**: 0, 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 56, 64, 80, 96, 120
- **Radius Scale**: All sizes from primitive export
- **Border Width Scale**: 0.5, 1, 1.5, 2, 3
- **Effect Styles**: Drop shadows (6 levels), Focus rings (8 variants)
- **Breakpoints**: xs (320), sm (576), md (768), lg (992), xl (1248)
- **Grid Systems**: Responsive column and gutter specifications

#### `src/data/figmaColors.ts`
Comprehensive semantic color system:
- **Primitive Colors**: All Figma color palettes (Blue Sky, Lavender, Purple, Magenta, Forest Green, Red, Apricot, Green, Gray)
- **Light Mode Colors**: Full semantic color mapping by category
- **Dark Mode Colors**: Theme-adjusted semantic colors
- **Helper Function**: `getSemanticColor()` for programmatic color access

### 5. Meta Changes

**index.html:**
- Theme color changed from #000101 (dark) to #FFFFFF (light) to match new default theme

**vite.config.mts:**
- Replaced Google Sans Flex Variable with Onest (primary)
- Added JetBrains Mono (documentation)
- Added Google Sans Flex as fallback

## Usage Guide

### Using Typography Tokens

```typescript
import { typographyTokens } from '@/data/figmaTokens'

// Desktop typography
const desktopH1 = typographyTokens.desktop.h1
// { fontFamily: 'Onest', fontSize: '40px', fontWeight: 600, ... }

// Mobile typography
const mobileH2 = typographyTokens.mobile.h2

// Documentation (code)
const docFont = typographyTokens.documentation.medium
```

### Using Spacing & Sizing

```typescript
import { spacingScale, radiusScale, borderWidthScale } from '@/data/figmaTokens'

// Apply spacing
padding: spacingScale[16] // '16px'
margin: spacingScale[24]  // '24px'

// Apply radius
borderRadius: radiusScale[8] // '8px'

// Apply border width
borderWidth: borderWidthScale[1] // '1px'
```

### Using Color Tokens

```typescript
import { lightModeColors, darkModeColors, getSemanticColor } from '@/data/figmaColors'

// Light mode colors
const brandColor = lightModeColors.brand.default // '#0058D2'
const successBg = lightModeColors.positive.secondary // '#E6F5EE'

// Dark mode colors
const darkBrandColor = darkModeColors.brand.default // '#0058D2'

// Programmatic access
const color = getSemanticColor('brand', 'secondary', isDarkMode)
```

### In Vue Components with Vuetify

```vue
<template>
  <!-- Uses theme colors automatically -->
  <v-btn color="primary">Save</v-btn>
  <v-card class="rounded-lg">
    <v-card-text>Content uses primary text color</v-card-text>
  </v-card>
</template>

<style scoped>
.section {
  border-radius: var(--radius-xl); /* 16px */
  padding: var(--radius-md); /* 8px — CSS custom property */
  background-color: rgb(var(--v-theme-surface));
}
</style>
```

## Verification Checklist

- [x] Typography scale extracted from Figma (Google Sans Flex weights and sizes)
- [x] Created `src/data/typographyScale.ts` with full hierarchy
- [x] Created `src/data/vuetifyTypography.ts` with integration guide
- [x] Radius tokens updated with all Figma sizes
- [x] Font family remains Google Sans Flex Variable (unchanged)
- [x] CSS custom properties exported for radius values
- [x] Theme remains dark mode as default (unchanged)
- [x] Reference files created for Figma tokens (optional: `figmaTokens.ts`, `figmaColors.ts`)

## Background System

**Three-layer approach for page backgrounds (Dark Mode)**

1. **Layer 1 - Base Color**: `#000101` (solid background)
2. **Layer 2 - Gradient**: Radial gradient from #1B2220 to #000
3. **Layer 3 - Noise**: SVG pattern with 16% opacity, multiply blend mode

**Implementation:**

Use the `AppBackground.vue` component as a fixed background:

```vue
<!-- In your root layout -->
<template>
  <AppBackground />
  <RouterView />
</template>

<script setup lang="ts">
import AppBackground from '@/components/AppBackground.vue'
</script>
```

Or apply via CSS utilities:

```scss
// Full three-layer background
.page { @extend .background-full-page; }

// Gradient + noise on specific element
.section { @extend .background-layered; }

// Noise texture only
.card { @extend .background-noise; }
```

**CSS Custom Properties:**
- `--background-dark-gradient`: Radial gradient layer
- `--background-base`: Base background color

## Next Steps

1. **Start dev server** (if not already running):
   ```bash
   corepack pnpm dev
   ```

2. **Integrate AppBackground component**: Place in your root layout for full-page effect

3. **Apply typography to screens**: Use the new typography scale when building
   ```typescript
   import { typographyScale } from '@/data/typographyScale'
   
   // In Vue templates
   <p :style="typographyScale.heading['3xl'].semibold">Page Title</p>
   
   // Or use utility classes (if added to CSS)
   <p class="text-heading-3xl-semibold">Page Title</p>
   ```

4. **Verify radius scale**: Test that new radius sizes (`xs`, `3xl`, `full`) render correctly
   ```vue
   <v-card rounded="3xl">Large rounded corners</v-card>
   <v-card rounded="full">Pill shaped</v-card>
   ```

5. **Reference available tokens**:
   - Typography: `src/data/typographyScale.ts`
   - Spacing: `src/data/figmaTokens.ts` → `spacingScale`
   - Radius: CSS vars `--radius-*` or Vuetify `rounded` prop
   - Optional colors: `src/data/figmaColors.ts` (for future color updates)
   - Backgrounds: `src/styles/backgrounds.scss` utilities

## Figma Export Details

### Primary Source: [Osaka] UX Exploration
- **Export**: textStyles.json
- **Font**: Google Sans Flex (brand font)
- **Text Styles**: 30 typography definitions (heading/body variants with weights)
- **Integration**: 100% — All sizes, weights, and line heights matched

### Secondary Source: RPBI (mud) - Figma Design System
- **Export Date**: 2026-07-31T16:57:39.567Z
- **Collections Exported**: 5
  1. Typography Primitives (31 variables) — reference only
  2. Sizes (32 variables) — spacing/radius scales
  3. Primitive Colors (99 colors) — reference only
  4. Semantic Colors (95 colors, 2 modes) — reference only
  5. Responsive Typography Test (3 variables) — reference only
- **Styles Exported**: 18 Text Styles, 12 Effect Styles, 5 Grid Styles
- **Integration**: Partial — Radius and spacing tokens only

## Design System Documentation

For reference on design principles and component usage patterns:
- Typography hierarchy and line-height ratios follow Material Design 3 principles
- Color contrast ratios meet WCAG AA standards for accessibility
- Responsive breakpoints follow mobile-first design approach
- Shadow system provides 6 elevation levels for depth perception
- Focus rings provide accessible keyboard navigation indicators

---

**Last Updated**: 2026-07-31  
**Status**: Integration Complete ✓
