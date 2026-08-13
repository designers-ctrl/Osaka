<!--
  src/components/NotificationsMenu.vue

  The notifications dropdown opened from the workspace bell (Figma
  "Notifications", node 1767:44273).

  Same construction as ProfileMenu: v-menu supplies toggle-on-click,
  click-outside, Escape, anchoring and focus handling; the activator is the
  existing AppButton ghost bell (AppButton re-emits `click` with the native
  MouseEvent and lets the activator's aria attrs fall through to its <button>,
  which is all v-menu needs). The unread badge dot on the bell is derived from
  the rows, so the two can never disagree.

  Card: glass surface (.surface--card) at the section-panel radius, with the
  spec's header — "Notifications" heading, accent-outlined "Show All", ghost
  overflow — above the NotificationItem rows separated by inset dividers.

  Props:
    notifications - NotificationRow[] ({ id, title, description, timestamp,
                    icon, unread }) — the WorkspaceNotification shape, kept
                    structural here so any future API rows fit

  Events:
    show-all - the "Show All" header action was clicked
    overflow - the three-dots header action was clicked

  Example usage:
    <notifications-menu :notifications="data.notifications" @show-all="..." />
-->

<script setup lang="ts">
  import { computed, nextTick, ref, watch } from 'vue'
  import AppButton from '@/components/AppButton.vue'
  import NotificationItem from '@/components/NotificationItem.vue'
  import type { AppIconName } from '@/icons/carbon'

  export interface NotificationRow {
    id: string
    title: string
    description: string
    timestamp: string
    icon: string
    unread: boolean
  }

  const props = defineProps<{ notifications: NotificationRow[] }>()

  const emit = defineEmits<{
    'show-all': []
    overflow: []
  }>()

  const open = ref(false)

  /** Unread rows always list first; order within each group is preserved. */
  const sortedNotifications = computed(() => [
    ...props.notifications.filter(n => n.unread),
    ...props.notifications.filter(n => !n.unread),
  ])

  const unreadCount = computed(() => props.notifications.filter(n => n.unread).length)
  const bellLabel = computed(() =>
    unreadCount.value ? `Notifications, ${unreadCount.value} unread` : 'Notifications',
  )

  // ── Scroll hint ──
  // The list scrolls internally; the bottom fade shows only while there is
  // more content below, and clears once the user reaches the end.
  const listEl = ref<HTMLElement>()
  const moreBelow = ref(false)

  function updateScrollHint() {
    const el = listEl.value
    // −1 absorbs fractional scroll positions at the very bottom
    moreBelow.value = !!el && el.scrollTop + el.clientHeight < el.scrollHeight - 1
  }

  // v-menu mounts its content lazily, so measure when it opens, not on mount.
  watch(open, isOpen => {
    if (isOpen) nextTick(updateScrollHint)
  })
</script>

<template>
  <v-menu v-model="open" location="bottom end" :offset="8">
    <template #activator="{ props: activatorProps }">
      <AppButton
        v-bind="activatorProps"
        variant="ghost"
        size="m"
        icon-only
        :aria-label="bellLabel"
      >
        <!-- The dot is decorative; the unread count lives in the aria-label. -->
        <template #icon>
          <v-badge :model-value="unreadCount > 0" color="success" dot>
            <v-icon icon="notification" />
          </v-badge>
        </template>
      </AppButton>
    </template>

    <v-sheet class="notifications-card surface--card" width="400">
      <div class="d-flex align-center ga-3 px-3 py-4">
        <!-- div instead of h2: no native heading margins; role keeps it a heading for AT -->
        <div role="heading" aria-level="2" class="notifications-card__title flex-grow-1 px-2">Notifications</div>
        <AppButton variant="outlined" size="s" @click="emit('show-all')">Show All</AppButton>
        <AppButton
          variant="ghost"
          size="s"
          icon-only
          aria-label="Notification options"
          @click="emit('overflow')"
        >
          <template #icon><v-icon icon="overflow" /></template>
        </AppButton>
      </div>

      <!-- The wrap anchors the fade OUTSIDE the scrolling element, so the hint
           stays pinned to the bottom edge instead of scrolling with the rows -->
      <div class="notifications-card__scroll-wrap">
        <!-- my-0 kills the native <ul> margin, which Vuetify's reset leaves alone -->
        <ul
          ref="listEl"
          class="notifications-card__list my-0 py-0 px-3"
          @scroll.passive="updateScrollHint"
        >
          <template v-for="(n, i) in sortedNotifications" :key="n.id">
            <v-divider v-if="i > 0" class="notifications-card__divider my-4" />
            <NotificationItem
              :title="n.title"
              :description="n.description"
              :timestamp="n.timestamp"
              :icon="n.icon as AppIconName"
              :unread="n.unread"
            />
          </template>
        </ul>
        <div
          class="notifications-card__fade"
          :class="{ 'notifications-card__fade--visible': moreBelow }"
          aria-hidden="true"
        ></div>
      </div>
      <div class="pb-6"></div>
    </v-sheet>
  </v-menu>
</template>

<style scoped>
  /* 12px card radius — the existing lg step of the radius scale */
  .notifications-card {
    border-radius: var(--radius-lg);
  }

  /* 20px title, per spec. The MD3 utility scale has no 20px step (title-large
     is 22, headline-small 24), so the size is set here; family, weight and
     color still inherit from the theme. */
  .notifications-card__title {
    font-size: 20px;
    line-height: 28px;
  }

  .notifications-card__scroll-wrap {
    position: relative;
  }

  /* Row divider (Figma): full menu width, 1px, horizontal gray gradient —
     transparent → 20% gray1 at center → transparent. gray1 (#949B99) IS the
     Figma rgba(148,155,153,…) color, so the token drives the stops. Vuetify's
     own border + border-opacity dimming are removed; the gradient paints on
     the element's 1px body instead (v-divider is height:0 by default). */
  .notifications-card__divider {
    border: 0 !important;
    height: 1px !important;
    max-height: 1px !important;
    opacity: 1 !important;
    background: linear-gradient(
      270deg,
      rgba(var(--v-theme-gray1), 0) 0%,
      rgba(var(--v-theme-gray1), 0.2) 50%,
      rgba(var(--v-theme-gray1), 0) 100%
    );
  }

  /* Roughly the height of the original three-row card, so the dropdown's
     footprint doesn't change — extra rows scroll inside instead. */
  .notifications-card__list {
    list-style: none;
    max-height: 340px;
    overflow-y: auto;
    /* No visible scrollbar — the bottom fade is the scroll affordance */
    scrollbar-width: none;
  }

  .notifications-card__list::-webkit-scrollbar {
    display: none;
  }

  /* Bottom scroll hint: fades from transparent into the card's own bottom
     color (the surface--card gradient ends on the background token), so it
     reads as the surface swallowing the rows, not a divider. Fades in/out
     with scroll position; never intercepts the pointer. */
  .notifications-card__fade {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    height: 48px;
    background: linear-gradient(180deg, transparent 0%, rgb(var(--v-theme-background)) 100%);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
  }

  .notifications-card__fade--visible {
    opacity: 1;
  }
</style>
