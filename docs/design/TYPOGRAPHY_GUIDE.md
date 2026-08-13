# Typography Guide - Google Sans Flex

Quick reference for using the Osaka typography scale in your screens.

## Overview

- **Brand Font**: Google Sans Flex Variable
- **Weights**: 200 (ExtraLight), 300 (Light), 400 (Regular), 600 (SemiBold)
- **Hierarchy**: 7 heading sizes + 5 body sizes
- **Source**: `src/data/typographyScale.ts`

## Heading Sizes

| Size | px | Regular | SemiBold | Use Case |
|------|----|---------|----|----------|
| 4xl | 44 | ✓ | ✓ | Page hero titles, large displays |
| 3xl | 36 | ✓ | ✓ | Main page titles |
| 2xl | 30 | ✓ | ✓ | Section titles |
| xl | 24 | ✓ | ✓ | Card titles, subsections |
| lg | 20 | ✓ | ✓ | Component headers |
| md | 18 | ✓* | ✓ | Small headers (* Light variant available) |
| sm | 16 | ✓ | ✓ | Input labels, small headings |

## Body Sizes

| Size | px | Variants | Use Case |
|------|----|----|----------|
| lg | 16 | Regular, **SemiBold**, Underline | Large body copy |
| md | 14 | Light, Regular, **SemiBold**, Underline | Default body text, list items |
| sm | 12 | Regular, SemiBold | Small text, captions |
| xs | 10 | Regular, SemiBold, Uppercase | Tiny text, badges, hints (2% letter spacing) |
| 2xs | 8 | Regular | Extra small labels |

## Usage Examples

### Vue Template

```vue
<template>
  <!-- Using direct import -->
  <h1 :style="typographyScale.heading['3xl'].semibold">Page Title</h1>
  <p :style="typographyScale.body.md.regular">Body text</p>

  <!-- With Vuetify components -->
  <v-card-title class="font-weight-600" style="font-size: 20px">
    Card Title
  </v-card-title>
  <v-card-text>
    {{ content }}
  </v-card-text>

  <!-- Using helper function -->
  <p :style="getTypography('body', 'md', 'semibold')">Semibold label</p>
</template>

<script setup lang="ts">
import { typographyScale, getTypography } from '@/data/typographyScale'
</script>

<style scoped>
.page-title {
  v-bind(typographyScale.heading['3xl'].semibold)
}
</style>
```

### CSS/SCSS

```scss
// In component <style scoped>
.heading {
  font-size: 36px;
  font-weight: 600;
  line-height: 44px;
}

.body-text {
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
}

.label {
  font-size: 14px;
  font-weight: 600;
  line-height: 22px;
}

// Use CSS vars if available
.small-hint {
  font-size: 10px;
  font-weight: 400;
  line-height: 16px;
  letter-spacing: 2%;
}
```

### TypeScript

```typescript
import { typographyScale, applyTypography } from '@/data/typographyScale'

// Get a single style
const headingStyle = typographyScale.heading['3xl'].semibold
// → { fontSize: '36px', fontWeight: 600, lineHeight: '44px' }

// Apply to an element
const styles = applyTypography(typographyScale.body.md.regular)
// → { fontSize: '14px', fontWeight: 400, lineHeight: '22px' }

// Use with component styling
const heading = document.querySelector('h1')
Object.assign(heading.style, applyTypography(typographyScale.heading['3xl'].semibold))
```

## Common Presets

```typescript
import { typographyPresets } from '@/data/typographyScale'

// Page titles
typographyPresets.pageTitle        // heading 3xl semibold
typographyPresets.sectionTitle     // heading 2xl semibold
typographyPresets.subsectionTitle  // heading xl semibold

// Body text
typographyPresets.bodyDefault   // body md regular
typographyPresets.bodySmall     // body sm regular
typographyPresets.bodyLarge     // body lg regular
typographyPresets.label         // body md semibold
typographyPresets.caption       // body sm regular
typographyPresets.hint          // body xs regular
```

## Font Weight Reference

```typescript
// In Google Sans Flex Variable:
200  // ExtraLight (light variants only)
300  // Light
400  // Regular (default)
600  // SemiBold (emphasis)
```

## Line Height Rules

All line heights are designed for optimal readability:

```
Heading: +8px above font-size
  44px → 52px
  36px → 44px
  30px → 38px
  24px → 32px
  20px → 28px
  18px → 26px
  16px → 24px

Body: +8px above font-size (md and larger), +6px for smaller
  16px → 24px (lg)
  14px → 22px (md)
  12px → 20px (sm)
  10px → 16px (xs)
  8px  → 12px (2xs)
```

## Letter Spacing

- **Default**: 0% (not specified, uses font default)
- **Xs sizes**: 2% (slightly spaced for emphasis)

## Responsive Typography

The scale doesn't change between viewports — Google Sans Flex renders clearly at all sizes.

For responsive text size changes, create breakpoint-specific style overrides in your components:

```vue
<style scoped>
.title {
  font-size: 36px; /* desktop */
}

@media (max-width: 768px) {
  .title {
    font-size: 28px; /* tablet */
  }
}

@media (max-width: 576px) {
  .title {
    font-size: 24px; /* mobile */
  }
}
</style>
```

## Adding CSS Utility Classes (Optional)

If you want to use utility classes like `.text-heading-3xl-semibold` throughout the app:

1. Add to `src/styles/typography.scss`:

```scss
@use './settings' as *;

.text-heading-4xl-regular {
  font-size: 44px;
  font-weight: 400;
  line-height: 52px;
}

.text-heading-4xl-semibold {
  font-size: 44px;
  font-weight: 600;
  line-height: 52px;
}

// ... etc for all styles
```

2. Import in `src/main.ts`:

```typescript
import '@/styles/typography.scss'
```

3. Use in templates:

```vue
<h1 class="text-heading-3xl-semibold">Page Title</h1>
<p class="text-body-md-regular">Body text</p>
```

## Testing Typography

Check rendering in the Storybook (if available) or create a test screen:

```vue
<template>
  <v-container>
    <h1 class="text-heading-4xl-regular">Heading 4xl Regular</h1>
    <h1 class="text-heading-4xl-semibold">Heading 4xl SemiBold</h1>
    <h2 class="text-heading-3xl-regular">Heading 3xl Regular</h2>
    <h2 class="text-heading-3xl-semibold">Heading 3xl SemiBold</h2>
    <!-- ... etc -->
  </v-container>
</template>
```

## Questions?

Refer to:
- `src/data/typographyScale.ts` — Full definitions
- `src/data/vuetifyTypography.ts` — Vuetify integration
- `FIGMA_INTEGRATION.md` — Integration notes
- `textStyles.json` — Original Figma export

---

**Last Updated**: 2026-07-31  
**Font**: Google Sans Flex Variable  
**Source**: [Osaka] UX Exploration (Figma)
