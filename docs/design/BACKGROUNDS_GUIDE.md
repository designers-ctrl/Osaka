# Background System Guide

## Overview

The app uses a three-layer background system for rich, sophisticated page visuals in dark mode:

1. **Layer 1** — Base solid color (`#000101`)
2. **Layer 2** — Radial gradient (`#1B2220` → `#000`)
3. **Layer 3** — Noise texture overlay (16% opacity, multiply blend)

This approach creates visual depth and sophistication while maintaining excellent contrast for legibility.

## Architecture

### Layer 1: Base Color
- **Color**: `#000101` (nearly black, from Vuetify theme `background`)
- **Purpose**: Solid foundation that fills the entire screen
- **Theme-aware**: Changes with light/dark mode

### Layer 2: Gradient Overlay
- **Type**: Radial gradient
- **Position**: Center-right, slightly below middle
- **From**: `#1B2220` (gray-3, slightly lighter)
- **To**: `#000` (pure black)
- **Mode**: Dark mode only (hidden in light mode)
- **Effect**: Creates atmospheric depth, focus toward center

### Layer 3: Noise Texture
- **Type**: SVG pattern with embedded noise texture
- **Opacity**: 16%
- **Blend Mode**: `multiply`
- **Coverage**: Full viewport
- **Effect**: Adds tactile, grained surface quality

## Usage

### Full-Page Background (Recommended)

Place the `AppBackground` component in your root layout:

```vue
<!-- App.vue or your root layout -->
<template>
  <AppBackground />
  <RouterView />
</template>

<script setup lang="ts">
import AppBackground from '@/components/AppBackground.vue'
</script>
```

The component:
- Fixes itself behind all content (z-index: -1)
- Applies all three layers automatically
- Responds to light/dark theme
- Handles noise texture via embedded SVG

### CSS Utility Classes

Import the backgrounds stylesheet (auto-imported in `main.ts`):

```scss
@import './styles/backgrounds.scss'
```

Available classes:

#### `.background-full-page`
Full three-layer system for page-level backgrounds.

```vue
<div class="background-full-page">
  <!-- Page content -->
</div>
```

#### `.background-layered`
Three-layer effect for specific elements (using `::before`/`::after` pseudo-elements).

```vue
<section class="background-layered">
  <!-- Section content -->
</section>
```

#### `.background-gradient-dark`
Gradient only (no noise), for dark mode.

```vue
<div class="background-gradient-dark">
  <!-- Content -->
</div>
```

#### `.background-noise`
Noise texture only, for adding texture to existing backgrounds.

```vue
<div class="background-noise">
  <!-- Content -->
</div>
```

### CSS Custom Properties

For use in `<style>` blocks:

```scss
:root {
  --background-dark-gradient: radial-gradient(46.61% 109.78% at 51.61% 55.8%, #1B2220 0%, #000 100%);
  --background-base: rgb(var(--v-theme-background));
}
```

```vue
<style scoped lang="scss">
.my-card {
  background-image: var(--background-dark-gradient);
}
</style>
```

## Implementation Details

### Component: `AppBackground.vue`

- **Position**: Fixed, full viewport
- **Z-index**: -1 (behind all content)
- **Layers**: Three separate divs + noise SVG
- **Theme-aware**: Gradient hides in light mode
- **Performance**: Minimal DOM, uses CSS and SVG only

### SCSS Module: `backgrounds.scss`

- **Variables**: `$dark-gradient`, `$noise-filter`
- **Mixins**: Pseudo-element based layering
- **Utilities**: Four configurable background classes
- **Custom Properties**: CSS vars for use in components

## Light Mode

The gradient layer automatically hides in light mode:

```scss
@media (prefers-color-scheme: light) {
  &__gradient {
    display: none;
  }
}
```

You can customize this by:
1. Creating a light-mode gradient
2. Adjusting the media query in `backgrounds.scss`
3. Modifying the component's styles

Example light-mode gradient:

```scss
$light-gradient: radial-gradient(
  50% 50% at 50% 50%,
  #F5F5F5 0%,
  #FFFFFF 100%
);
```

## Customization

### Change Gradient Position

Edit `backgrounds.scss` `$dark-gradient`:

```scss
$dark-gradient: radial-gradient(
  46.61% 109.78% at 51.61% 55.8%, // ← Adjust these percentages
  var(--Gray-3, #1b2220) 0%,
  #000 100%
);
```

Breakdown:
- `46.61% 109.78%` — ellipse dimensions (width %, height %)
- `at 51.61% 55.8%` — center position (x %, y %)

### Change Noise Opacity

Edit `.app-background__noise` or `.background-noise` `fill-opacity`:

```scss
&__noise {
  fill-opacity: 0.10; // Default is 0.16
}
```

### Disable Gradient for Light Mode

Remove or modify the media query in `AppBackground.vue`:

```scss
// Delete this block to show gradient in all modes:
@media (prefers-color-scheme: light) {
  display: none;
}
```

## Performance

- **No JavaScript**: Pure CSS + SVG
- **Minimal DOM**: 3 divs + 1 SVG element
- **Fixed positioning**: No layout reflow
- **GPU accelerated**: CSS transforms and blend modes
- **Responsive**: Uses viewport units, scales automatically
- **Lazy loaded**: No impact until component is mounted

## Browser Support

| Feature | Support |
|---------|---------|
| Fixed positioning | All modern browsers |
| CSS Grid/Flexbox | All modern browsers |
| Radial gradient | All modern browsers |
| SVG patterns | All modern browsers |
| Mix-blend-mode | All modern browsers |
| CSS custom properties | All modern browsers |
| Media queries (prefers-color-scheme) | All modern browsers |

## Troubleshooting

### Gradient not showing
- Check dark mode is enabled
- Verify `--Gray-3` CSS variable is set
- Inspect z-index (should be behind content)

### Noise texture too strong/weak
- Adjust `fill-opacity` in SVG or `.background-noise` opacity

### Performance issues
- Check GPU acceleration is enabled in browser dev tools
- Verify fixed positioning isn't conflicting with parent `transform`

### Light mode customization
- Create a `$light-gradient` variable
- Update media query logic in `backgrounds.scss`

## Integration with Other Elements

### Cards and containers
Cards should inherit the page background through transparency:

```vue
<v-card class="transparent">
  <!-- content -->
</v-card>

<style scoped>
.transparent {
  background: rgba(var(--v-theme-surface), 0.8);
}
</style>
```

### Text contrast
Ensure text maintains sufficient contrast over the layered background:

```vue
<h1 class="text-heading-lg-semibold">
  Title with high contrast
</h1>

<style scoped>
h1 {
  color: rgb(var(--v-theme-on-background));
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3); // Optional: adds legibility
}
</style>
```

## Examples

### Full page with AppBackground component

```vue
<template>
  <v-app>
    <AppBackground />
    
    <v-app-bar>
      <!-- Header -->
    </v-app-bar>
    
    <v-main>
      <RouterView />
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
import AppBackground from '@/components/AppBackground.vue'
</script>
```

### Section with gradient only

```vue
<template>
  <section class="background-gradient-dark">
    <h2>Featured Section</h2>
    <p>Content...</p>
  </section>
</template>

<style scoped>
.background-gradient-dark {
  padding: 2rem;
}
</style>
```

### Custom background with noise

```vue
<template>
  <div class="background-noise card-bg">
    <v-card>
      <!-- Card content -->
    </v-card>
  </div>
</template>

<style scoped lang="scss">
.card-bg {
  background-color: rgba(var(--v-theme-surface), 0.9);
}
</style>
```

---

**Last Updated**: 2026-07-31  
**System**: Google Sans Flex / Osaka Design System  
**Mode**: Dark mode with light mode fallback
