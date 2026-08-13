<!--
  src/components/NotificationItem.vue

  One notification row (Figma "Notification Item", node 1767:44273): a circular
  icon chip with an unread status dot, then title / description / timestamp.

  Purely presentational and dataset-shaped, so a screen can later map real
  notification API rows straight onto it (see WorkspaceNotification in
  src/data/graphWorkspace.ts). It renders as an <li> — always place it inside
  a <ul>/<ol> (NotificationsMenu does) so screen readers announce the count.

  Props:
    title       - bold first line
    description - one-to-two-line summary under the title
    timestamp   - preformatted relative time ("2 h ago")
    icon        - semantic key from src/icons/carbon.ts (default 'notification')
    unread      - true shows the green status dot on the icon chip (default false)

  Design (from spec):
  - Icon chip: 40px surface-light circle, 20px glyph
  - Unread dot: 12px success circle, top-left of the chip
  - Title: title-medium · Description: body-medium, medium emphasis ·
    Timestamp: body-small, disabled emphasis
-->

<script setup lang="ts">
  import AppIcon from '@/components/AppIcon.vue'
  import type { AppIconName } from '@/icons/carbon'

  export interface Props {
    title: string
    description: string
    timestamp: string
    icon?: AppIconName
    unread?: boolean
  }

  withDefaults(defineProps<Props>(), {
    icon: 'notification',
    unread: false,
  })
</script>

<template>
  <li
    class="notification-item d-flex ga-3 py-1 px-2"
    :class="{ 'notification-item--read': !unread }"
  >
    <div class="notification-item__chip flex-shrink-0">
      <v-avatar color="surface-light" size="40">
        <app-icon :name="icon" class="notification-item__glyph" />
      </v-avatar>
      <span v-if="unread" class="notification-item__dot" aria-hidden="true" />
      <span v-if="unread" class="d-sr-only">Unread</span>
    </div>
    <div class="notification-item__body">
      <div class="text-title-medium">{{ title }}</div>
      <div class="text-body-medium text-medium-emphasis">{{ description }}</div>
      <div class="text-body-small text-disabled mt-1">{{ timestamp }}</div>
    </div>
  </li>
</template>

<style scoped>
  .notification-item {
    list-style: none;
    /* Compact-row floor (local to notifications; content-height rows above it) */
    min-height: 36px;
  }

  /* The chip anchors the unread dot */
  .notification-item__chip {
    position: relative;
  }

  .notification-item__glyph {
    font-size: 20px;
    color: rgb(var(--v-theme-button-white-100));
  }

  .notification-item__dot {
    position: absolute;
    top: -2px;
    left: -2px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: rgb(var(--v-theme-success));
  }

  /* Let the text column shrink so long descriptions wrap, not overflow */
  .notification-item__body {
    min-width: 0;
  }

  /* Read rows: text steps back to the theme's medium-emphasis level, so
     unread rows (full emphasis) read as the prominent ones. Icon chip and
     layout are untouched. */
  .notification-item--read .notification-item__body {
    opacity: var(--v-medium-emphasis-opacity);
  }
</style>
