<!--
  src/icons/OfflineBolt.vue

  Custom glyph: a lightning bolt inside a filled circle ("offline_bolt" in the
  Figma spec, exported from the Tokens Badge component, node 2021:50618).
  Carbon ships no circled-bolt — its `lightning` / `flash--filled` are bare
  bolts — so the exact exported path lives here instead of @carbon/icons-vue.

  It is registered in src/icons/carbon.ts under the semantic key `tokens`, so
  screens reference it like any other icon (`<app-icon name="tokens" />`,
  `prepend-icon="tokens"`) and never import this file directly.

  Same rendering contract as the Carbon components: the path is drawn in a
  16-grid with the design's built-in 8.42% inset, fills with currentColor, and
  AppIcon sizes the svg to 1em — so `size`/`color`/font-size all keep working.
-->
<template>
  <svg viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path
      transform="translate(1.3467 1.3467)"
      d="M6.65333 0C2.98 0 0 2.98 0 6.65333C0 10.3267 2.98 13.3067 6.65333 13.3067C10.3267 13.3067 13.3067 10.3267 13.3067 6.65333C13.3067 2.98 10.3267 0 6.65333 0ZM6.30667 11.9867V7.81333H3.98667L7.32 1.32V5.49333H9.55333L6.30667 11.9867Z"
    />
  </svg>
</template>
