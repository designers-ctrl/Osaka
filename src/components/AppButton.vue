<!--
  src/components/AppButton.vue

  Reusable application button component based on the Figma Button Component Set.

  Supports three visual variants:
  - primary: Primary action — elevated appearance with glass morphism effects
  - secondary: Secondary action — darker surface with gradient background
  - ghost: Minimal button — background-less, text-only appearance

  Four sizes: xs (24px), s (32px), m (40px), l (48px)

  Props:
    variant    - 'primary' | 'secondary' | 'ghost' (default: 'primary')
    size       - 'xs' | 's' | 'm' | 'l' (default: 'm')
    disabled   - boolean (default: false)
    loading    - boolean (default: false) — shows spinner, disables interaction

  Slots:
    default    - button label text (optional)
    icon       - left icon (optional, must be v-icon component)
    rightIcon  - right icon (optional, must be v-icon component)

  Events:
    click      - emitted when button is clicked (if not disabled/loading)

  Design:
  - ICONS: Fixed size (~18px), never scales with button size
  - EFFECTS: Primary (blur + shadows), Secondary (gradients), Ghost (minimal)
  - BORDERS: Primary (border), Secondary (none), Ghost (none)
  - DISABLED: Gray/W 10% bg, White/20% text/icons across all variants
  - LOADING: Shows spinner, disables interaction, preserves shape
-->

<script setup lang="ts">
import { computed } from 'vue'

export interface Props {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outlined'
  size?: 'xs' | 's' | 'm' | 'l'
  disabled?: boolean
  loading?: boolean
  type?: 'button' | 'submit' | 'reset'
  iconOnly?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'm',
  disabled: false,
  loading: false,
  type: 'button',
  iconOnly: false,
})

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

const isDisabled = computed(() => props.disabled || props.loading)

const buttonClass = computed(() => ({
  'app-button': true,
  [`app-button--${props.variant}`]: true,
  [`app-button--${props.size}`]: true,
  'app-button--disabled': isDisabled.value,
  'app-button--loading': props.loading,
  'app-button--icon-only': props.iconOnly,
}))

const iconSizeClass = computed(() => {
  // Icon size is fixed regardless of button size
  return 'v-icon-md'
})

function handleClick(e: MouseEvent) {
  if (!isDisabled.value) {
    emit('click', e)
  }
}
</script>

<template>
  <button
    :type="type"
    :class="buttonClass"
    :disabled="isDisabled"
    @click="handleClick"
  >
    <div class="app-button__content">
      <!-- Loading spinner (shown instead of left icon when loading) -->
      <v-progress-circular
        v-if="loading"
        class="app-button__spinner"
        :size="18"
        :width="2"
        indeterminate
      />
      <!-- Left icon -->
      <slot v-else-if="$slots.icon" name="icon" :size-class="iconSizeClass"></slot>

      <!-- Label text -->
      <slot class="app-button__label"></slot>

      <!-- Right icon -->
      <slot name="rightIcon" :size-class="iconSizeClass"></slot>
    </div>
  </button>
</template>

<style scoped lang="scss">
@use '@/styles/button-tokens' as bt;

/* ── BASE BUTTON STRUCTURE ─────────────────────────────────────── */
.app-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: inherit;
  font-size: inherit;
  font-weight: 500;
  line-height: 1.2;
  cursor: pointer;
  border: none;
  transition: all 0.15s ease;
  touch-action: manipulation;
  -webkit-font-smoothing: antialiased;
}

/* Remove focus ring outline; use custom state instead */
.app-button:focus-visible {
  outline: none;
}

.app-button__content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: inherit; /* Gap set per size */
  width: 100%;
  height: 100%;
}

.app-button__spinner {
  flex-shrink: 0;
}

/* ── SIZE VARIANTS ─────────────────────────────────────── */

/* XS: 24px height */
.app-button--xs {
  height: 24px;
  padding: 6px 8px;
  gap: 10px;
  border-radius: 4px;
  font-family: 'Google Sans Flex Variable', sans-serif;
  font-size: 10px;
  font-weight: 400;
  line-height: 14px;
  letter-spacing: 0.2px;
}

/* Icon-only buttons are square: padding on all sides equal */
.app-button--xs.app-button--icon-only {
  padding: 6px;
  width: 24px;
}

/* S: 32px height */
.app-button--s {
  height: 32px;
  padding: 8px 12px;
  gap: 10px;
  border-radius: 6px;
  font-family: 'Google Sans Flex Variable', sans-serif;
  font-size: 12px;
  font-weight: 400;
  line-height: 16px;
}

.app-button--s.app-button--icon-only {
  padding: 8px;
  width: 32px;
}

/* M: 40px height (default) */
.app-button--m {
  height: 40px;
  padding: 10px 12px;
  gap: 10px;
  border-radius: 8px;
  font-family: 'Google Sans Flex Variable', sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 20px;
}

.app-button--m.app-button--icon-only {
  padding: 10px;
  width: 40px;
}

/* L: 48px height */
.app-button--l {
  height: 48px;
  padding: 12px 16px;
  gap: 12px;
  border-radius: 8px;
  font-family: 'Google Sans Flex Variable', sans-serif;
  font-size: 16px;
  font-weight: 400;
  line-height: 24px;
}

.app-button--l.app-button--icon-only {
  padding: 14px;
  width: 48px;
}

/* ── VARIANT: PRIMARY ──────────────────────────────────────── */
/* Primary buttons use:
   - Background: Gray/W 20% (rgba(148, 155, 153, 0.20))
   - Border: Gray/W 40% (rgba(148, 155, 153, 0.40))
   - Text/Icon: White (rgb(255, 255, 255))
   - Effects: Backdrop blur (24px) + inner shadows + drop shadow
*/

.app-button--primary {
  color: rgb(var(--v-theme-button-white-100));
  background: rgba(var(--v-theme-button-gray-w-20));
  border: 1px solid rgba(var(--v-theme-button-gray-w-40));
  backdrop-filter: blur(24px);
  box-shadow:
    inset 0 -5px 4px 0 rgba(var(--v-theme-button-gray-w-20)),
    inset 0 4px 4px 0 rgba(var(--v-theme-button-gray-w-40)),
    0 0 12px 0 rgba(var(--v-theme-button-black-b-40));
}

.app-button--primary:hover:not(.app-button--disabled) {
  background: rgba(var(--v-theme-button-gray-w-40));
  border-color: rgba(var(--v-theme-button-gray-w-60));
}

.app-button--primary:active:not(.app-button--disabled) {
  background: rgba(var(--v-theme-button-gray-w-10));
  background-image: linear-gradient(
    180deg,
    rgb(var(--v-theme-gray2)) 0%,
    rgb(var(--v-theme-gray3)) 100%
  );
  border-color: rgb(var(--v-theme-gray1));
  box-shadow:
    inset 0 -5px 4px 0 rgba(var(--v-theme-button-gray-w-20)),
    inset 0 4px 4px 0 rgba(var(--v-theme-button-gray-w-40)),
    0 0 12px 0 rgba(var(--v-theme-button-black-b-40));
}

/* ── VARIANT: SECONDARY ────────────────────────────────────────── */
/* Secondary buttons use:
   - Background: Linear gradient (Gray/3 to Gray/4)
   - Text/Icon: White/80% (default), White/100% (hover)
   - No border
   - Effects: Inner shadow
*/

.app-button--secondary {
  color: rgba(var(--v-theme-button-white-80));
  background: linear-gradient(
    180deg,
    rgb(var(--v-theme-gray3)) 0%,
    rgb(var(--v-theme-gray4)) 23.08%
  );
  border: none;
  box-shadow: inset 0 -4px 4px 0 rgba(var(--v-theme-button-gray-w-20));
}

.app-button--secondary:hover:not(.app-button--disabled) {
  color: rgb(var(--v-theme-button-white-100));
  background: linear-gradient(
    180deg,
    rgb(var(--v-theme-gray3)) 0%,
    rgb(var(--v-theme-gray4)) 23.08%
  );
}

.app-button--secondary:active:not(.app-button--disabled) {
  color: rgb(var(--v-theme-button-white-100));
  background: rgba(var(--v-theme-button-gray-w-20));
  border: 1px solid rgba(var(--v-theme-button-gray-w-60));
  backdrop-filter: blur(24px);
  box-shadow:
    inset 0 -4px 4px 0 rgba(var(--v-theme-button-gray-w-10)),
    inset 0 5px 4px 0 rgba(var(--v-theme-button-gray-w-10)),
    0 0 12px 0 rgba(var(--v-theme-button-black-b-40));
}

/* ── VARIANT: GHOST ────────────────────────────────────────── */
/* Ghost buttons use:
   - Text/Icon: White/80% (default), White/100% (hover)
   - No background
   - No border
   - No effects
*/

.app-button--ghost {
  color: rgba(var(--v-theme-button-white-80));
  background: transparent;
  border: none;
  box-shadow: none;
}

.app-button--ghost:hover:not(.app-button--disabled) {
  color: rgb(var(--v-theme-button-white-100));
}

.app-button--ghost:active:not(.app-button--disabled) {
  color: rgb(var(--v-theme-button-white-100));
  background: rgba(var(--v-theme-button-gray-w-20));
}

/* ── VARIANT: OUTLINED ────────────────────────────────────────── */
/* Outlined buttons use:
   - Border: Gradient (Yellow 1→2) at 40% opacity (default), 100% (hover/pressed)
   - Icon: Gradient (Yellow 1→2) at 60% opacity (default), 100% (hover)
   - Text: White/100%
   - Pressed: White/10% fill + gradient border (White 60%→Yellow 1)
   - Disabled: Gray/W 10% border, White/20% text/icons, inner shadows
*/

.app-button--outlined {
  position: relative;
  color: rgb(var(--v-theme-button-white-100));
  background: transparent;
  border: 1px solid transparent;
  box-shadow: none;
}

/* Gradient border using ::before pseudo-element with mask to cut center */
.app-button--outlined::before {
  content: '';
  position: absolute;
  inset: 0;
  padding: 1px;
  border-radius: inherit;
  background: linear-gradient(
    180deg,
    #F2C585 0%,
    #7C6749 100%
  );
  opacity: 0.4;
  pointer-events: none;
  -webkit-mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  mask-composite: exclude;
}

.app-button--outlined:hover:not(.app-button--disabled) {
  color: rgb(var(--v-theme-button-white-100));
}

/* Hover: increase border gradient opacity to 100% */
.app-button--outlined:hover:not(.app-button--disabled)::before {
  opacity: 1;
}

.app-button--outlined:active:not(.app-button--disabled) {
  color: rgb(var(--v-theme-button-white-100));
  background: rgba(var(--v-theme-button-white-10));
}

/* Pressed: new gradient border (White 60% → Yellow 1) at 100% opacity */
.app-button--outlined:active:not(.app-button--disabled)::before {
  background: linear-gradient(
    180deg,
    rgba(var(--v-theme-button-white-60)) 0%,
    var(--v-theme-button-outlined-accent-1) 100%
  );
  opacity: 1;
}

/* ── DISABLED STATE ────────────────────────────────────────── */
/* All variants use the same disabled appearance:
   - Background: Gray/W 10%
   - Text/Icon: White/20%
   - No border
   - Muted inner shadows
*/

.app-button--disabled {
  cursor: not-allowed;
  color: rgba(var(--v-theme-button-white-20)) !important;
  background: rgba(var(--v-theme-button-gray-w-10)) !important;
  border: none !important;
  box-shadow:
    inset 0 -5px 4px 0 rgba(var(--v-theme-button-gray-w-10)),
    inset 0 4px 4px 0 rgba(var(--v-theme-button-gray-w-10)) !important;
  opacity: 1;
}

/* Outlined disabled: special border styling */
.app-button--outlined.app-button--disabled::before {
  background: rgba(var(--v-theme-button-gray-w-10)) !important;
  opacity: 1 !important;
}

/* Outlined disabled: icons should be plain white, not gradient */
.app-button--outlined.app-button--disabled :deep(.v-icon) {
  opacity: 1 !important;
}

/* Hide gradient overlay on disabled icons */
.app-button--outlined.app-button--disabled :deep(.v-icon)::before {
  display: none !important;
}

/* ── FOCUS STATE ────────────────────────────────────────── */
/* Visual focus indicator when button receives keyboard focus */

.app-button:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

/* Icon sizing (size-specific, never scales with zoom) */
:deep(.v-icon) {
  font-size: 20px !important; /* Default for M/L */
}

/* Size-specific icon sizing */
.app-button--xs :deep(.v-icon) {
  font-size: 12px !important;
}

.app-button--s :deep(.v-icon) {
  font-size: 16px !important;
}

.app-button--m :deep(.v-icon) {
  font-size: 20px !important;
}

.app-button--l :deep(.v-icon) {
  font-size: 20px !important;
}

/* Outlined button: gradient icons using layered pseudo-element technique */
.app-button--outlined :deep(.v-icon) {
  position: relative;
  isolation: isolate;
  opacity: 0.6;
}

/* Gradient layer overlaid on icon using pseudo-element */
.app-button--outlined :deep(.v-icon)::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    var(--v-theme-button-outlined-accent-1) 0%,
    var(--v-theme-button-outlined-accent-2) 100%
  );
  pointer-events: none;
  mix-blend-mode: color;
  border-radius: inherit;
  z-index: 1;
}

/* Hover: increase icon opacity to 100% */
.app-button--outlined:hover:not(.app-button--disabled) :deep(.v-icon) {
  opacity: 1;
}

/* Pressed: icon gradient changes to White 60% → Yellow 1 at 100% opacity */
.app-button--outlined:active:not(.app-button--disabled) :deep(.v-icon) {
  opacity: 1;
}

.app-button--outlined:active:not(.app-button--disabled) :deep(.v-icon)::before {
  background: linear-gradient(
    180deg,
    rgba(var(--v-theme-button-white-60)) 0%,
    var(--v-theme-button-outlined-accent-1) 100%
  );
}
</style>
