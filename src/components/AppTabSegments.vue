<!--
  src/components/AppTabSegments.vue

  A reusable tab segmented control (icon-only toggle group) based on the design spec.

  The component is a segmented control container with multiple tab buttons. Currently
  icon-only tabs are used, but the structure supports text and icon-left/right variants
  for future expansion without rebuilding the component.

  Props:
    modelValue     - the currently selected tab value
    size           - 's' | 'm' | 'l' (default: 's') — controls padding/gap; only S is
                     currently used in the product
    disabled       - boolean (default: false) — disables all tabs
    mandatory      - boolean (default: true) — at least one tab must be selected

  Events:
    update:modelValue - emitted when a tab is selected

  Slots:
    default - contains AppTabSegmentsItem children (required)

  Example usage:
    <app-tab-segments v-model="viewType" size="s">
      <app-tab-segments-item value="list" icon="list" />
      <app-tab-segments-item value="grid" icon="grid" />
    </app-tab-segments>

  Design (from spec):
  - Container: Linear gradient Gray/3→Gray/4 (top→bottom), 6px radius
  - Inner shadows: top (0, 4px blur) + bottom (0, -4px blur), both Gray/W 20%
  - Padding/Gap: 4px (size S)
  - Tab default: no background, White/80% icon
  - Tab hover: Gray/2→Gray/3 gradient, White/5 icon
  - Tab selected: Black/1 background, White/5 icon
  - Tab disabled: White/20% icon
-->

<script setup lang="ts">
import { computed } from 'vue'

export interface Props {
  modelValue?: string | number
  size?: 's' | 'm' | 'l'
  disabled?: boolean
  mandatory?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  size: 's',
  disabled: false,
  mandatory: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
}>()

const containerClass = computed(() => ({
  'app-tab-segments': true,
  [`app-tab-segments--${props.size}`]: true,
  'app-tab-segments--disabled': props.disabled,
}))
</script>

<template>
  <div :class="containerClass">
    <v-btn-toggle
      :model-value="modelValue"
      :mandatory="mandatory"
      :disabled="disabled"
      @update:model-value="emit('update:modelValue', $event)"
    >
      <slot />
    </v-btn-toggle>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/button-tokens' as bt;

/* ── CONTAINER STRUCTURE ───────────────────────────────────────── */
.app-tab-segments {
  display: inline-flex;
  border-radius: 6px;
  background: linear-gradient(
    180deg,
    rgb(var(--v-theme-gray3)) 0%,
    rgb(var(--v-theme-gray4)) 100%
  );
  box-shadow:
    inset 0 4px 4px 0 rgba(var(--v-theme-button-gray-w-20)),
    inset 0 -4px 4px 0 rgba(var(--v-theme-button-gray-w-20));
  transition: opacity 0.15s ease;
}

/* Size S: 4px padding, 4px gap (icon-only 20px) */
.app-tab-segments--s {
  padding: 4px;
  gap: 4px;

  :deep(.v-btn) {
    padding: 0 !important;
    min-width: 32px !important;
    min-height: 32px !important;
    width: 32px !important;
    height: 32px !important;
    line-height: 32px !important;
  }

  :deep(.v-icon) {
    font-size: 20px !important;
  }
}

/* Size M: structural support for future use */
.app-tab-segments--m {
  padding: 6px;
  gap: 6px;

  :deep(.v-btn) {
    padding: 0 !important;
    min-width: 40px !important;
    min-height: 40px !important;
    width: 40px !important;
    height: 40px !important;
    line-height: 40px !important;
  }

  :deep(.v-icon) {
    font-size: 24px !important;
  }
}

/* Size L: structural support for future use */
.app-tab-segments--l {
  padding: 8px;
  gap: 8px;

  :deep(.v-btn) {
    padding: 0 !important;
    min-width: 48px !important;
    min-height: 48px !important;
    width: 48px !important;
    height: 48px !important;
    line-height: 48px !important;
  }

  :deep(.v-icon) {
    font-size: 28px !important;
  }
}

/* Disabled state: muted opacity */
.app-tab-segments--disabled {
  opacity: 0.5;
}

/* ── VBtnToggle reset ──────────────────────────────────────── */
.app-tab-segments :deep(.v-btn-toggle) {
  height: auto !important;
  display: flex !important;
  flex-direction: row !important;
}

/* ── TAB BUTTON STATES ─────────────────────────────────────── */
.app-tab-segments :deep(.v-btn) {
  position: relative;
  border-radius: 6px;
  background: transparent;
  color: rgba(var(--v-theme-button-white-80));
  box-shadow: none;
  border: none;
  transition: all 0.15s ease;
  flex: 0 0 auto !important;

  /* Remove Vuetify's default ripple overlay */
  &::before {
    display: none;
  }
}

/* Default state: no background, White/80% icon (Figma "White/80%") */
.app-tab-segments :deep(.v-btn:not(:hover, :focus, .v-btn--active, :disabled)) {
  background: transparent;
  color: rgba(var(--v-theme-button-white-80));
}

/* Hover state: Gray/2→Gray/3 gradient, full-white icon.
   Figma's "White/5" is a SHADE step (pure white), not 5% opacity — the same
   mapping AppButton uses — so it resolves to button-white-100, never
   button-white-5 (which is 5% alpha and near-invisible). */
.app-tab-segments :deep(.v-btn:hover:not(:disabled, .v-btn--active)) {
  background: linear-gradient(
    180deg,
    rgb(var(--v-theme-gray2)) 0%,
    rgb(var(--v-theme-gray3)) 100%
  );
  color: rgb(var(--v-theme-button-white-100));
}

/* Selected state: Black/1 background (the `background` theme token — see the
   Black/1 mapping in surfaces.scss), full-white icon for clear contrast */
.app-tab-segments :deep(.v-btn--active) {
  background: rgb(var(--v-theme-background));
  color: rgb(var(--v-theme-button-white-100));
  box-shadow: none;
}

/* Kill Vuetify's overlay on active state — it sits above the background and
   lightens it away from the exact theme color */
.app-tab-segments :deep(.v-btn--active > .v-btn__overlay) {
  opacity: 0 !important;
}

/* Focus state: enhance visibility for keyboard navigation */
.app-tab-segments :deep(.v-btn:focus-visible) {
  outline: 2px solid rgba(var(--v-theme-button-white-100), 0.3);
  outline-offset: 2px;
}

/* Disabled state: White/20% icon, no interactive effects */
.app-tab-segments--disabled :deep(.v-btn),
.app-tab-segments :deep(.v-btn:disabled) {
  color: rgba(var(--v-theme-button-white-20)) !important;
  background: transparent !important;
  cursor: not-allowed;
}
</style>
