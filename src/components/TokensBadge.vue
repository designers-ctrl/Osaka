<!--
  src/components/TokensBadge.vue

  A compact token-count badge (Figma "Tokens Badge", node 2021:50622): a circled
  lightning bolt + a count, on a soft gray gradient pill.

  Built on a plain flex container rather than v-chip: the chip's fixed heights,
  overlay/hover states and solid variants all fight the spec (a stateless 24px
  gradient pill), and the DS pattern for stateless custom surfaces is bespoke
  markup + theme tokens (see AppTabSegments).

  Props:
    count - the number to display (number | string), e.g. 32 or "1.2k"
    icon  - semantic icon key (default: 'tokens', the circled bolt)
    label - screen-reader unit suffix after the count (default: 'tokens');
            the visible badge shows only the count, so this is what makes
            "32" announce as "32 tokens"

  Example usage:
    <tokens-badge :count="32" />
    <tokens-badge :count="workflow.tokens" label="credits" icon="ai" />

  Design (from spec):
  - Container: vertical gradient Gray/W 0% → 20% (at 65.865%) → 40%,
    1px White/10% border, 6px radius, padding 2px 6px, gap 4px
  - Icon: offline_bolt 16px, success green
  - Count: body/md/regular 14/20 (MD3 body-medium), white
-->

<script setup lang="ts">
  import AppIcon from '@/components/AppIcon.vue'
  import type { AppIconName } from '@/icons/carbon'

  export interface Props {
    count: number | string
    icon?: AppIconName
    label?: string
  }

  withDefaults(defineProps<Props>(), {
    icon: 'tokens',
    label: 'tokens',
  })
</script>

<template>
  <span class="tokens-badge">
    <app-icon :name="icon" class="tokens-badge__icon" />
    <span class="text-body-medium">{{ count }}</span>
    <span class="d-sr-only">{{ label }}</span>
  </span>
</template>

<style scoped>
  .tokens-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    border: 1px solid rgba(var(--v-theme-button-white-10));
    /* Gray/W 0% stop: `transparent` — no 0-alpha token exists, and premultiplied
       gradient interpolation makes it identical to rgba(148,155,153,0). */
    background: linear-gradient(
      180deg,
      transparent 0%,
      rgba(var(--v-theme-button-gray-w-20)) 65.865%,
      rgba(var(--v-theme-button-gray-w-40)) 100%
    );
    color: rgb(var(--v-theme-button-white-100));
  }

  /* AppIcon renders at 1em, so font-size is the icon's designed 16px box. */
  .tokens-badge__icon {
    font-size: 16px;
    color: rgb(var(--v-theme-success));
  }
</style>
